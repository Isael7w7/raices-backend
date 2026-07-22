import { Injectable, Inject } from '@nestjs/common'
import { Firestore, CollectionReference } from 'firebase-admin/firestore'
import { randomUUID } from 'crypto'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import type {
  Mensaje,
  CrearMensajeDatos,
  IRepositorioMensaje,
} from '../interfaces/message.repository.interface'

@Injectable()
export class RepositorioMensajeFirestore implements IRepositorioMensaje {
  private readonly col: CollectionReference

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {
    this.col = this.db.collection(COLECCIONES.mensajesDirectos)
  }

  async listarEnviadosPorUsuario(usuarioId: string): Promise<Mensaje[]> {
    const snap = await this.col.where('remitenteId', '==', usuarioId).get()
    return snap.docs.map((d) => this.aDominio(d.id, d.data()))
  }

  async listarRecibidosPorUsuario(usuarioId: string): Promise<Mensaje[]> {
    const snap = await this.col.where('destinatarioId', '==', usuarioId).get()
    return snap.docs.map((d) => this.aDominio(d.id, d.data()))
  }

  async listarMensajesEntre(usuarioId: string, parceiroId: string): Promise<Mensaje[]> {
    const [enviadosSnap, recibidosSnap] = await Promise.all([
      this.col.where('remitenteId', '==', usuarioId).where('destinatarioId', '==', parceiroId).get(),
      this.col.where('remitenteId', '==', parceiroId).where('destinatarioId', '==', usuarioId).get(),
    ])
    const mensajes = [
      ...enviadosSnap.docs.map((d) => this.aDominio(d.id, d.data())),
      ...recibidosSnap.docs.map((d) => this.aDominio(d.id, d.data())),
    ]
    return mensajes.sort(
      (a, b) => new Date(a.fechaCreacion).getTime() - new Date(b.fechaCreacion).getTime(),
    )
  }

  async enviar(datos: CrearMensajeDatos): Promise<Mensaje> {
    const id = randomUUID()
    const ahora = new Date().toISOString()
    const mensaje: Mensaje = {
      id,
      remitenteId: datos.remitenteId,
      destinatarioId: datos.destinatarioId,
      contenido: datos.contenido,
      leido: false,
      fechaCreacion: ahora,
    }
    await this.col.doc(id).set(mensaje)
    return mensaje
  }

  async contarNoLeidos(usuarioId: string): Promise<number> {
    const snap = await this.col
      .where('destinatarioId', '==', usuarioId)
      .where('leido', '==', false)
      .get()
    return snap.size
  }

  async marcarComoLeidos(remitenteId: string, destinatarioId: string): Promise<void> {
    const snap = await this.col
      .where('remitenteId', '==', remitenteId)
      .where('destinatarioId', '==', destinatarioId)
      .where('leido', '==', false)
      .get()
    if (snap.empty) return
    const lote = this.db.batch()
    for (const doc of snap.docs) {
      lote.update(doc.ref, { leido: true })
    }
    await lote.commit()
  }

  async marcarTodosComoLeidos(usuarioId: string): Promise<void> {
    const snap = await this.col
      .where('destinatarioId', '==', usuarioId)
      .where('leido', '==', false)
      .get()
    if (snap.empty) return
    const lote = this.db.batch()
    for (const doc of snap.docs) {
      lote.update(doc.ref, { leido: true })
    }
    await lote.commit()
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private aDominio(id: string, data: FirebaseFirestore.DocumentData): Mensaje {
    return {
      id,
      remitenteId: data.remitenteId ?? '',
      destinatarioId: data.destinatarioId ?? '',
      contenido: data.contenido ?? '',
      leido: data.leido ?? false,
      fechaCreacion: data.fechaCreacion ?? '',
    }
  }
}
