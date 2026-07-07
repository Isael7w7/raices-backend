import { Injectable, Inject } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { Subject } from 'rxjs'
import { v4 as uuid } from 'uuid'
import { FIRESTORE } from '../../database/firebase.provider'

@Injectable()
export class NotificationsService {
  private streams = new Map<string, Subject<any>>()

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  getStream(userId: string): Subject<any> {
    if (!this.streams.has(userId)) {
      this.streams.set(userId, new Subject())
    }
    return this.streams.get(userId)!
  }

  async create(userId: string, type: string, title: string, body: string, refId?: string) {
    const id = uuid()
    await this.db.collection('u_notifications').doc(id).set({
      id, user_id: userId, type, title, body, ref_id: refId ?? null,
      is_read: false, created_at: new Date().toISOString(),
    })
    const notif = { id, user_id: userId, type, title, body, ref_id: refId, is_read: false, created_at: new Date().toISOString() }
    const stream = this.streams.get(userId)
    if (stream) stream.next({ data: JSON.stringify(notif) })
    return notif
  }

  async findByUser(userId: string) {
    const snap = await this.db.collection('u_notifications')
      .where('user_id', '==', userId)
      .orderBy('created_at', 'desc')
      .limit(50).get()
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  }

  async markRead(userId: string, notifId: string) {
    const doc = await this.db.collection('u_notifications').doc(notifId).get()
    if (doc.exists && doc.data()?.user_id === userId) {
      await doc.ref.update({ is_read: true })
    }
    return { ok: true }
  }

  async markAllRead(userId: string) {
    const snap = await this.db.collection('u_notifications')
      .where('user_id', '==', userId)
      .where('is_read', '==', false).get()
    const batch = this.db.batch()
    for (const doc of snap.docs) {
      batch.update(doc.ref, { is_read: true })
    }
    await batch.commit()
    return { ok: true }
  }
}
