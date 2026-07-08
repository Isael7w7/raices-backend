import { Injectable, Inject } from '@nestjs/common'
import { Firestore, CollectionReference } from 'firebase-admin/firestore'
import { randomUUID } from 'crypto'
import { FIRESTORE } from '../../database/firebase.provider'
import type {
  Message,
  CreateMessageData,
  IMessageRepository,
} from '../interfaces/message.repository.interface'

@Injectable()
export class FirestoreMessageRepository implements IMessageRepository {
  private readonly col: CollectionReference

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {
    this.col = this.db.collection('u_direct_messages')
  }

  async findSentByUser(userId: string): Promise<Message[]> {
    const snap = await this.col.where('from_id', '==', userId).get()
    return snap.docs.map((d) => this.toDomain(d.id, d.data()))
  }

  async findReceivedByUser(userId: string): Promise<Message[]> {
    const snap = await this.col.where('to_id', '==', userId).get()
    return snap.docs.map((d) => this.toDomain(d.id, d.data()))
  }

  async findMessagesBetween(userId: string, partnerId: string): Promise<Message[]> {
    const [sentSnap, receivedSnap] = await Promise.all([
      this.col.where('from_id', '==', userId).where('to_id', '==', partnerId).get(),
      this.col.where('from_id', '==', partnerId).where('to_id', '==', userId).get(),
    ])
    const messages = [
      ...sentSnap.docs.map((d) => this.toDomain(d.id, d.data())),
      ...receivedSnap.docs.map((d) => this.toDomain(d.id, d.data())),
    ]
    return messages.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
  }

  async sendMessage(data: CreateMessageData): Promise<Message> {
    const id = randomUUID()
    const now = new Date().toISOString()
    const message: Message = {
      id,
      from_id: data.from_id,
      to_id: data.to_id,
      content: data.content,
      is_read: false,
      created_at: now,
    }
    await this.col.doc(id).set(message)
    return message
  }

  async getUnreadCount(userId: string): Promise<number> {
    const snap = await this.col
      .where('to_id', '==', userId)
      .where('is_read', '==', false)
      .get()
    return snap.size
  }

  async markMessagesAsRead(fromUserId: string, toUserId: string): Promise<void> {
    const snap = await this.col
      .where('from_id', '==', fromUserId)
      .where('to_id', '==', toUserId)
      .where('is_read', '==', false)
      .get()
    if (snap.empty) return
    const batch = this.db.batch()
    for (const doc of snap.docs) {
      batch.update(doc.ref, { is_read: true })
    }
    await batch.commit()
  }

  async markAllAsRead(userId: string): Promise<void> {
    const snap = await this.col
      .where('to_id', '==', userId)
      .where('is_read', '==', false)
      .get()
    if (snap.empty) return
    const batch = this.db.batch()
    for (const doc of snap.docs) {
      batch.update(doc.ref, { is_read: true })
    }
    await batch.commit()
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private toDomain(id: string, data: FirebaseFirestore.DocumentData): Message {
    return {
      id,
      from_id: data.from_id ?? '',
      to_id: data.to_id ?? '',
      content: data.content ?? '',
      is_read: data.is_read ?? false,
      created_at: data.created_at ?? '',
    }
  }
}
