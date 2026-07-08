import { Injectable, Inject } from '@nestjs/common'
import { Firestore, CollectionReference } from 'firebase-admin/firestore'
import { randomUUID } from 'crypto'
import { FIRESTORE } from '../../database/firebase.provider'
import type {
  Notification,
  CreateNotificationData,
  INotificationRepository,
} from '../interfaces/notification.repository.interface'

@Injectable()
export class FirestoreNotificationRepository implements INotificationRepository {
  private readonly col: CollectionReference

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {
    this.col = this.db.collection('u_notifications')
  }

  async create(data: CreateNotificationData): Promise<Notification> {
    const id = randomUUID()
    const now = new Date().toISOString()
    const notification: Notification = {
      id,
      user_id: data.user_id,
      type: data.type,
      title: data.title,
      body: data.body,
      ref_id: data.ref_id ?? null,
      is_read: false,
      created_at: now,
    }
    await this.col.doc(id).set(notification)
    return notification
  }

  async findByUser(userId: string): Promise<Notification[]> {
    const snap = await this.col
      .where('user_id', '==', userId)
      .orderBy('created_at', 'desc')
      .limit(50)
      .get()
    return snap.docs.map((d) => this.toDomain(d.id, d.data()))
  }

  async getUnreadCount(userId: string): Promise<number> {
    const snap = await this.col
      .where('user_id', '==', userId)
      .where('is_read', '==', false)
      .get()
    return snap.size
  }

  async markAsRead(userId: string, notifId: string): Promise<void> {
    const doc = await this.col.doc(notifId).get()
    if (doc.exists && doc.data()?.user_id === userId) {
      await doc.ref.update({ is_read: true })
    }
  }

  async markAllAsRead(userId: string): Promise<void> {
    const snap = await this.col
      .where('user_id', '==', userId)
      .where('is_read', '==', false)
      .get()
    if (snap.empty) return
    const batch = this.db.batch()
    for (const doc of snap.docs) {
      batch.update(doc.ref, { is_read: true })
    }
    await batch.commit()
  }

  async delete(notifId: string): Promise<void> {
    await this.col.doc(notifId).delete()
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private toDomain(
    id: string,
    data: FirebaseFirestore.DocumentData,
  ): Notification {
    return {
      id,
      user_id: data.user_id ?? '',
      type: data.type ?? '',
      title: data.title ?? '',
      body: data.body ?? '',
      ref_id: data.ref_id ?? null,
      is_read: data.is_read ?? false,
      created_at: data.created_at ?? '',
    }
  }
}
