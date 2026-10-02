import { Injectable, Inject, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { verificarMultimediaPermitida, normalizarMediaUrl } from '../../common/utils/multimedia-permiso'

/** Mensaje de la colección `mensajesDirectos` (campos usados por este servicio). */
interface MensajeDirectoDoc {
  remitenteId: string
  destinatarioId: string
  contenido?: string
  fechaCreacion?: string
  leido?: boolean
  [key: string]: unknown
}

@Injectable()
export class MessagesService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  /**
   * Un socio es "usuario fantasma" si su perfil no existe, si fue eliminado
   * explícitamente o si su cuenta fue desactivada. El historial de la
   * conversación se conserva: solo se marca para que el cliente muestre
   * "Usuario Eliminado" y bloquee el envío (que responde 403).
   */
  private esUsuarioEliminado(perfil: Record<string, unknown> | undefined): boolean {
    if (!perfil) return true
    if (perfil.eliminado === true) return true
    return perfil.activo !== true
  }

  /**
   * No se expone PII (nombre, avatar, correo) de cuentas dadas de baja: se
   * devuelve un socio anonimizado que el cliente puede seguir mostrando.
   */
  private socioSeguro(socioId: string, perfil: Record<string, unknown> | undefined): Record<string, unknown> {
    if (this.esUsuarioEliminado(perfil)) {
      return { id: socioId, nombreCompleto: 'Usuario Eliminado', urlAvatar: null }
    }
    return { id: socioId, ...perfil }
  }

  async getConversations(usuarioId: string) {
    const [enviadosSnap, recibidosSnap] = await Promise.all([
      this.db.collection(COLECCIONES.mensajesDirectos).where('remitenteId', '==', usuarioId).get(),
      this.db.collection(COLECCIONES.mensajesDirectos).where('destinatarioId', '==', usuarioId).get(),
    ])
    const mensajes = [...enviadosSnap.docs, ...recibidosSnap.docs].map(d => ({ id: d.id, ...d.data() } as MensajeDirectoDoc & { id: string }))

    const socios = new Map<string, MensajeDirectoDoc & { id: string }>()
    const ultimaFecha = new Map<string, number>()
    for (const msg of mensajes) {
      const socioId = msg.remitenteId === usuarioId ? msg.destinatarioId : msg.remitenteId
      if (!socios.has(socioId)) socios.set(socioId, msg)
      const fecha = new Date(msg.fechaCreacion ?? 0).getTime()
      if ((ultimaFecha.get(socioId) ?? 0) < fecha) ultimaFecha.set(socioId, fecha)
    }
    if (socios.size === 0) return []

    // Conversaciones borradas lógicamente por este usuario: se ocultan de la
    // lista hasta que exista un mensaje posterior al borrado (nuevo del    // socio o enviado por el propio usuario).
    const ocultasSnap = await this.db.collection(COLECCIONES.conversacionesOcultas)
      .where('usuarioId', '==', usuarioId).get()
    const ocultas = new Map<string, number>()
    ocultasSnap.docs.forEach(d => {
      const data = d.data() as { socioId?: string; ocultoEn?: string }
      if (data.socioId) ocultas.set(data.socioId, new Date(data.ocultoEn ?? 0).getTime())
    })
    for (const [socioId, ocultoEn] of ocultas) {
      if ((ultimaFecha.get(socioId) ?? 0) <= ocultoEn) socios.delete(socioId)
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
      // "Usuario fantasma": el historial se conserva y se devuelve, pero se marca
      // para que el cliente muestre "Usuario Eliminado" y bloquee el envío
      // (el POST /enviar/:userId devuelve 403 para esa cuenta).
      const isDeleted = this.esUsuarioEliminado(perfil)
      return {
        socio: this.socioSeguro(sid, perfil),
        ultimoMensaje: socios.get(sid)?.contenido ?? '',
        ultimoEn: socios.get(sid)?.fechaCreacion ?? null,
        noLeidos: mensajes.filter(m => m.remitenteId === sid && m.destinatarioId === usuarioId && !m.leido).length,
        isDeleted,
        destinatarioActivo: !isDeleted,
      }
    }).sort((a, b) => new Date(b.ultimoEn ?? 0).getTime() - new Date(a.ultimoEn ?? 0).getTime())
  }

  async getMessages(usuarioId: string, socioId: string) {
    // ═══════════════════════════════════════════════════════════════════
    // IDOR Protection: Verificar que exista al menos un mensaje entre
    // ambos usuarios antes de mostrar la conversación completa.
    // Esto impide que un usuario acceda a mensajes de otros usuarios
    // conociendo únicamente sus IDs.
    // ═══════════════════════════════════════════════════════════════════
    const verificarEnviados = await this.db.collection(COLECCIONES.mensajesDirectos)
      .where('remitenteId', '==', usuarioId).where('destinatarioId', '==', socioId).limit(1).get()
    const verificarRecibidos = await this.db.collection(COLECCIONES.mensajesDirectos)
      .where('remitenteId', '==', socioId).where('destinatarioId', '==', usuarioId).limit(1).get()

    if (verificarEnviados.empty && verificarRecibidos.empty) {
      throw new ForbiddenException('No tienes permiso para ver esta conversación')
    }

    const noLeidosSnap = await this.db.collection(COLECCIONES.mensajesDirectos)
      .where('remitenteId', '==', socioId)
      .where('destinatarioId', '==', usuarioId)
      .where('leido', '==', false).get()
    const lote = this.db.batch()
    for (const doc of noLeidosSnap.docs) lote.update(doc.ref, { leido: true })
    if (!noLeidosSnap.empty) await lote.commit()

    const [enviadosSnap, recibidosSnap] = await Promise.all([
      this.db.collection(COLECCIONES.mensajesDirectos)
        .where('remitenteId', '==', usuarioId).where('destinatarioId', '==', socioId).get(),
      this.db.collection(COLECCIONES.mensajesDirectos)
        .where('remitenteId', '==', socioId).where('destinatarioId', '==', usuarioId).get(),
    ])

    return [...enviadosSnap.docs, ...recibidosSnap.docs]
      .map(d => ({ id: d.id, ...d.data() } as MensajeDirectoDoc & { id: string }))
      .sort((a, b) => new Date(String(a.fechaCreacion ?? 0)).getTime() - new Date(String(b.fechaCreacion ?? 0)).getTime())
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
   * Borrado lógico de una conversación: la oculta SOLO para el usuario
   * actual sin eliminar mensajes (el socio conserva su historial).
   *
   * Protecciones:
   * - 403 si se intenta borrar la "propia" conversación (socio == usuario).
   * - 404 si no existe ningún mensaje entre ambos (IDOR: un tercero no puede
   *   borrar conversaciones ajenas conociendo los IDs).
   *
   * Al ocultarla también se marcan como leídos los mensajes recibidos para
   * que el badge de no leídos no muestre un chat que ya no está en la lista.
   */
  async ocultarConversacion(usuarioId: string, socioId: string): Promise<{ ocultado: boolean; socioId: string }> {
    if (usuarioId === socioId) {
      throw new ForbiddenException('No puedes borrar tu propia conversación')
    }

    const [enviados, recibidos] = await Promise.all([
      this.db.collection(COLECCIONES.mensajesDirectos)
        .where('remitenteId', '==', usuarioId).where('destinatarioId', '==', socioId).limit(1).get(),
      this.db.collection(COLECCIONES.mensajesDirectos)
        .where('remitenteId', '==', socioId).where('destinatarioId', '==', usuarioId).limit(1).get(),
    ])
    if (enviados.empty && recibidos.empty) {
      throw new NotFoundException('Conversación no encontrada')
    }

    await this.db.collection(COLECCIONES.conversacionesOcultas).doc(`${usuarioId}_${socioId}`).set({
      usuarioId,
      socioId,
      ocultoEn: new Date().toISOString(),
    })

    await this.marcarConversacionLeida(usuarioId, socioId)

    return { ocultado: true, socioId }
  }

  async getUnreadCount(usuarioId: string): Promise<number> {
    const snap = await this.db.collection(COLECCIONES.mensajesDirectos)
      .where('destinatarioId', '==', usuarioId).where('leido', '==', false).get()
    return snap.size
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

    // Escritura atómica en batch (límite de Firestore: 500 ops por batch;
    // el paginado defensivo evita fallar con conversaciones muy largas)
    const docs = snap.docs
    for (let i = 0; i < docs.length; i += 450) {
      const batch = this.db.batch()
      for (const doc of docs.slice(i, i + 450)) {
        batch.update(doc.ref, { leido: true })
      }
      await batch.commit()
    }

    return { actualizados: docs.length }
  }
}
