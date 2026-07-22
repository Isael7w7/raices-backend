import { Injectable, Inject } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { Subject } from 'rxjs'
import { v4 as uuid } from 'uuid'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'

@Injectable()
export class NotificationsService {
  private streams = new Map<string, Subject<any>>()

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  getStream(usuarioId: string): Subject<any> {
    if (!this.streams.has(usuarioId)) {
      this.streams.set(usuarioId, new Subject())
    }
    return this.streams.get(usuarioId)!
  }

  async crear(usuarioId: string, tipo: string, titulo: string, cuerpo: string, referenciaId?: string) {
    const id = uuid()
    await this.db.collection(COLECCIONES.notificaciones).doc(id).set({
      id, usuarioId, tipo, titulo, cuerpo, referenciaId: referenciaId ?? null,
      leida: false, fechaCreacion: new Date().toISOString(),
    })
    const notif = { id, usuarioId, tipo, titulo, cuerpo, referenciaId, leida: false, fechaCreacion: new Date().toISOString() }
    const stream = this.streams.get(usuarioId)
    if (stream) stream.next({ data: JSON.stringify(notif) })
    return notif
  }

  async findByUser(usuarioId: string) {
    const snap = await this.db.collection(COLECCIONES.notificaciones)
      .where('usuarioId', '==', usuarioId)
      .orderBy('fechaCreacion', 'desc')
      .limit(50).get()
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  }

  async markRead(usuarioId: string, notificacionId: string) {
    const doc = await this.db.collection(COLECCIONES.notificaciones).doc(notificacionId).get()
    if (doc.exists && doc.data()?.usuarioId === usuarioId) {
      await doc.ref.update({ leida: true })
    }
    return { ok: true }
  }

  async markAllRead(usuarioId: string) {
    const snap = await this.db.collection(COLECCIONES.notificaciones)
      .where('usuarioId', '==', usuarioId)
      .where('leida', '==', false).get()
    const lote = this.db.batch()
    for (const doc of snap.docs) {
      lote.update(doc.ref, { leida: true })
    }
    await lote.commit()
    return { ok: true }
  }
}
