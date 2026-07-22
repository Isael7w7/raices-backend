import { Injectable, Inject } from '@nestjs/common'
import { Firestore, CollectionReference } from 'firebase-admin/firestore'
import { randomUUID } from 'crypto'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import type {
  Notificacion,
  CrearNotificacionDatos,
  IRepositorioNotificacion,
} from '../interfaces/notification.repository.interface'

@Injectable()
export class RepositorioNotificacionFirestore implements IRepositorioNotificacion {
  private readonly col: CollectionReference

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {
    this.col = this.db.collection(COLECCIONES.notificaciones)
  }

  async crear(datos: CrearNotificacionDatos): Promise<Notificacion> {
    const id = randomUUID()
    const ahora = new Date().toISOString()
    const notificacion: Notificacion = {
      id,
      usuarioId: datos.usuarioId,
      tipo: datos.tipo,
      titulo: datos.titulo,
      cuerpo: datos.cuerpo,
      referenciaId: datos.referenciaId ?? null,
      leida: false,
      fechaCreacion: ahora,
    }
    await this.col.doc(id).set(notificacion)
    return notificacion
  }

  async listarPorUsuario(usuarioId: string): Promise<Notificacion[]> {
    const snap = await this.col
      .where('usuarioId', '==', usuarioId)
      .orderBy('fechaCreacion', 'desc')
      .limit(50)
      .get()
    return snap.docs.map((d) => this.aDominio(d.id, d.data()))
  }

  async contarNoLeidas(usuarioId: string): Promise<number> {
    const snap = await this.col
      .where('usuarioId', '==', usuarioId)
      .where('leida', '==', false)
      .get()
    return snap.size
  }

  async marcarComoLeida(usuarioId: string, notificacionId: string): Promise<void> {
    const doc = await this.col.doc(notificacionId).get()
    if (doc.exists && doc.data()?.usuarioId === usuarioId) {
      await doc.ref.update({ leida: true })
    }
  }

  async marcarTodasComoLeidas(usuarioId: string): Promise<void> {
    const snap = await this.col
      .where('usuarioId', '==', usuarioId)
      .where('leida', '==', false)
      .get()
    if (snap.empty) return
    const lote = this.db.batch()
    for (const doc of snap.docs) {
      lote.update(doc.ref, { leida: true })
    }
    await lote.commit()
  }

  async eliminar(notificacionId: string): Promise<void> {
    await this.col.doc(notificacionId).delete()
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private aDominio(
    id: string,
    data: FirebaseFirestore.DocumentData,
  ): Notificacion {
    return {
      id,
      usuarioId: data.usuarioId ?? '',
      tipo: data.tipo ?? '',
      titulo: data.titulo ?? '',
      cuerpo: data.cuerpo ?? '',
      referenciaId: data.referenciaId ?? null,
      leida: data.leida ?? false,
      fechaCreacion: data.fechaCreacion ?? '',
    }
  }
}
