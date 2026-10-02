import { Injectable, Inject, ForbiddenException } from '@nestjs/common'
import { Firestore, FieldValue, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { verificarMultimediaPermitida, normalizarMediaUrl } from '../../common/utils/multimedia-permiso'

/**
 * Límite de operaciones por batch en Firestore (500). Se usa 450, igual que en
 * `marcarConversacionLeida`, para no quedar justo en el tope.
 */
const TAMANO_LOTE = 450

/** Mensaje de la colección `mensajesDirectos` (campos usados por este servicio). */
interface MensajeDirectoDoc {
  remitenteId: string
  destinatarioId: string
  contenido?: string
  fechaCreacion?: string
  leido?: boolean
  /** uids que eliminaron este mensaje de su vista. Borrado lógico por usuario. */
  eliminadoPor?: string[]
  [key: string]: unknown
}

@Injectable()
export class MessagesService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  // ═══════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Un mensaje está oculto para `usuarioId` si ese usuario lo eliminó de su
   * vista con `DELETE /mensajes/conversacion/:userId`. El documento sigue en
   * Firestore: lo conserva la contraparte (y sirve de auditoría).
   */
  private ocultoPara(msg: MensajeDirectoDoc, usuarioId: string): boolean {
    const eliminados = msg.eliminadoPor
    return Array.isArray(eliminados) && eliminados.includes(usuarioId)
  }

  /**
   * Un socio es "usuario fantasma" si su perfil no existe, si fue eliminado
   * explícitamente o si su cuenta fue desactivada. Se conserva el historial de
   * los mensajes; solo se oculta y bloquea la escritura.
   */
  private esUsuarioEliminado(perfil: Record<string, unknown> | undefined): boolean {
    if (!perfil) return true
    if (perfil.eliminado === true) return true
    return perfil.activo !== true
  }

  private masReciente(a: MensajeDirectoDoc, b: MensajeDirectoDoc): boolean {
    return new Date(a.fechaCreacion ?? 0).getTime() > new Date(b.fechaCreacion ?? 0).getTime()
  }

  /**
   * Escribe `eliminadoPor: arrayUnion(usuarioId)` en cada documento, paginando
   * para respetar el límite de 500 ops por batch de Firestore.
   */
  private async marcarEliminados(docs: QueryDocumentSnapshot[], usuarioId: string): Promise<void> {
    for (let i = 0; i < docs.length; i += TAMANO_LOTE) {
      const batch = this.db.batch()
      for (const doc of docs.slice(i, i + TAMANO_LOTE)) {
        batch.set(doc.ref, { eliminadoPor: FieldValue.arrayUnion(usuarioId) }, { merge: true })
      }
      await batch.commit()
    }
  }

  async getConversations(usuarioId: string) {
    const [enviadosSnap, recibidosSnap] = await Promise.all([
      this.db.collection(COLECCIONES.mensajesDirectos).where('remitenteId', '==', usuarioId).get(),
      this.db.collection(COLECCIONES.mensajesDirectos).where('destinatarioId', '==', usuarioId).get(),
    ])
    const todos = [...enviadosSnap.docs, ...recibidosSnap.docs].map(d => ({ id: d.id, ...d.data() } as MensajeDirectoDoc & { id: string }))

    // Borrado lógico: el historial se conserva en Firestore pero se oculta a quien lo eliminó.
    const mensajes = todos.filter(m => !this.ocultoPara(m, usuarioId))

    // Agrupar por socio quedándose con el mensaje MÁS RECIENTE. Tomar el primero
    // encontrado hacía que `ultimoMensaje` no fuera el último cuando la conversación
    // tenía mensajes en ambos sentidos.
    const socios = new Map<string, MensajeDirectoDoc & { id: string }>()
    for (const msg of mensajes) {
      const socioId = msg.remitenteId === usuarioId ? msg.destinatarioId : msg.remitenteId
      const actual = socios.get(socioId)
      if (!actual || this.masReciente(msg, actual)) socios.set(socioId, msg)
    }
    if (socios.size === 0) return []

    const sociosIds = Array.from(socios.keys())
    const lotes: string[][] = []
    for (let i = 0; i < sociosIds.length; i += 30) lotes.push(sociosIds.slice(i, i + 30))

    const perfiles = new Map<string, Record<string, unknown>>()
    for (const lote of lotes) {
      const snap = await this.db.collection(COLECCIONES.perfiles).where('__name__', 'in', lote).get()
      snap.docs.forEach(d => perfiles.set(d.id, d.data()))
    }

    return sociosIds.map(sid => {
      const perfil = perfiles.get(sid)
      const ultimo = socios.get(sid)
      // "Usuario fantasma": el historial se conserva y se devuelve, pero se marca
      // para que el cliente muestre "Usuario Eliminado" y bloquee el envío
      // (el POST /enviar/:userId devolvería 403 para esa cuenta).
      const isDeleted = this.esUsuarioEliminado(perfil)

      // No se expone PII (nombre, avatar, correo) de cuentas dadas de baja.
      const socio = isDeleted
        ? { id: sid, nombreCompleto: 'Usuario Eliminado', urlAvatar: null }
        : { id: sid, ...perfil }

      return {
        socio,
        ultimoMensaje: ultimo?.contenido ?? '',
        ultimoEn: ultimo?.fechaCreacion ?? null,
        noLeidos: mensajes.filter(m => m.remitenteId === sid && m.destinatarioId === usuarioId && !m.leido).length,
        isDeleted,
        destinatarioActivo: !isDeleted,
      }
    }).sort((a, b) => new Date(b.ultimoEn ?? 0).getTime() - new Date(a.ultimoEn ?? 0).getTime())
  }

  async getMessages(usuarioId: string, socioId: string) {
    if (usuarioId === socioId) {
      throw new ForbiddenException('No tienes permiso para ver esta conversación')
    }

    const [enviadosSnap, recibidosSnap] = await Promise.all([
      this.db.collection(COLECCIONES.mensajesDirectos)
        .where('remitenteId', '==', usuarioId).where('destinatarioId', '==', socioId).get(),
      this.db.collection(COLECCIONES.mensajesDirectos)
        .where('remitenteId', '==', socioId).where('destinatarioId', '==', usuarioId).get(),
    ])

    const visibles = [...enviadosSnap.docs, ...recibidosSnap.docs]
      .filter(d => !this.ocultoPara(d.data() as MensajeDirectoDoc, usuarioId))

    // ═══════════════════════════════════════════════════════════════════
    // IDOR Protection: si tras aplicar el borrado lógico no queda ningún
    // mensaje visible entre ambos usuarios, no hay conversación a la que
    // tener acceso. Conocer el ID de otro usuario no basta para leer su
    // historial, y una conversación que el usuario eliminó tampoco se
    // puede reabrir adivinando la ruta.
    // ═══════════════════════════════════════════════════════════════════
    if (visibles.length === 0) {
      throw new ForbiddenException('No tienes permiso para ver esta conversación')
    }

    const noLeidos = visibles.filter(d => {
      const m = d.data() as MensajeDirectoDoc
      return m.destinatarioId === usuarioId && !m.leido
    })
    for (let i = 0; i < noLeidos.length; i += TAMANO_LOTE) {
      const lote = this.db.batch()
      for (const doc of noLeidos.slice(i, i + TAMANO_LOTE)) {
        lote.update(doc.ref, { leido: true })
      }
      await lote.commit()
    }

    return visibles
      .map(d => ({ id: d.id, ...d.data() } as MensajeDirectoDoc & { id: string }))
      .sort((a, b) => new Date(a.fechaCreacion ?? 0).getTime() - new Date(b.fechaCreacion ?? 0).getTime())
  }

  async sendMessage(user: CurrentUserPayload, destinatarioId: string, contenido: string, mediaUrl?: string) {
    if (user.id === destinatarioId) throw new ForbiddenException('No puedes enviarte mensajes a ti mismo')
    const media = normalizarMediaUrl(mediaUrl)
    verificarMultimediaPermitida(user, media)
    const destinatario = await this.db.collection(COLECCIONES.perfiles).doc(destinatarioId).get()
    if (this.esUsuarioEliminado(destinatario.exists ? (destinatario.data() as Record<string, unknown>) : undefined)) {
      throw new ForbiddenException('Usuario destinatario no existe')
    }

    const ref = this.db.collection(COLECCIONES.mensajesDirectos).doc()
    const msg = {
      id: ref.id, remitenteId: user.id, destinatarioId, contenido,
      mediaUrl: media, leido: false, fechaCreacion: new Date().toISOString(),
    }
    await ref.set(msg)
    return msg
  }

  /**
   * "Eliminar chat" al estilo WhatsApp: oculta el historial en la vista del
   * usuario que lo pide, sin destruir los mensajes ni el historial de la
   * contraparte. Cada documento registra el uid en `eliminadoPor`.
   *
   * El filtrado se hace en memoria y no con `where('eliminadoPor', 'array-contains', ...)`
   * a propósito: así las consultas de Firestore no cambian y un filtro negativo
   * no exige índices nuevos.
   *
   * Es idempotente: repetirla sobre una conversación ya eliminada devuelve 200
   * con `eliminados: 0`.
   */
  async deleteConversation(usuarioId: string, socioId: string): Promise<{ exito: boolean; mensaje: string; eliminados: number }> {
    if (usuarioId === socioId) {
      throw new ForbiddenException('No puedes eliminar tu propia conversación')
    }

    const mensajesRef = this.db.collection(COLECCIONES.mensajesDirectos)
    const [enviadosSnap, recibidosSnap] = await Promise.all([
      mensajesRef.where('remitenteId', '==', usuarioId).where('destinatarioId', '==', socioId).get(),
      mensajesRef.where('remitenteId', '==', socioId).where('destinatarioId', '==', usuarioId).get(),
    ])

    const visibles = [...enviadosSnap.docs, ...recibidosSnap.docs]
      .filter(doc => !this.ocultoPara(doc.data() as MensajeDirectoDoc, usuarioId))

    if (visibles.length === 0) {
      return { exito: true, mensaje: 'No hay conversación que eliminar', eliminados: 0 }
    }

    await this.marcarEliminados(visibles, usuarioId)
    return { exito: true, mensaje: 'Conversación eliminada', eliminados: visibles.length }
  }

  async getUnreadCount(usuarioId: string): Promise<number> {
    const snap = await this.db.collection(COLECCIONES.mensajesDirectos)
      .where('destinatarioId', '==', usuarioId).where('leido', '==', false).get()
    return snap.docs.filter(d => !this.ocultoPara(d.data() as MensajeDirectoDoc, usuarioId)).length
  }

  /**
   * Marca como leídos todos los mensajes recibidos de un socio específico.
   * Usado por el cliente al abrir una conversación: actualiza en lote los
   * mensajes `destinatarioId == usuarioId && remitenteId == socioId && leido == false`.
   */
  async marcarConversacionLeida(usuarioId: string, socioId: string): Promise<{ actualizados: number }> {
    if (usuarioId === socioId) {
      throw new ForbiddenException('No puedes marcar tu propia conversación')
    }

    const snap = await this.db.collection(COLECCIONES.mensajesDirectos)
      .where('destinatarioId', '==', usuarioId)
      .where('remitenteId', '==', socioId)
      .where('leido', '==', false)
      .get()

    if (snap.empty) return { actualizados: 0 }

    const docs = snap.docs.filter(d => !this.ocultoPara(d.data() as MensajeDirectoDoc, usuarioId))
    if (docs.length === 0) return { actualizados: 0 }

    // Escritura atómica en lotes (límite de Firestore: 500 ops por batch;
    // el paginado defensivo evita fallar con conversaciones muy largas)
    for (let i = 0; i < docs.length; i += TAMANO_LOTE) {
      const batch = this.db.batch()
      for (const doc of docs.slice(i, i + TAMANO_LOTE)) {
        batch.update(doc.ref, { leido: true })
      }
      await batch.commit()
    }

    return { actualizados: docs.length }
  }
}
