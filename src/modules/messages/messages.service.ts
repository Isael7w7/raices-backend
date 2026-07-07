import { Injectable, Inject, ForbiddenException } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { randomUUID } from 'crypto'

@Injectable()
export class MessagesService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async getConversations(userId: string) {
    const [sentSnap, receivedSnap] = await Promise.all([
      this.db.collection('u_direct_messages').where('from_id', '==', userId).get(),
      this.db.collection('u_direct_messages').where('to_id', '==', userId).get(),
    ])
    const sent = [...sentSnap.docs, ...receivedSnap.docs].map(d => ({ id: d.id, ...d.data() } as any))

    // Group by partner, keep latest
    const partners = new Map<string, any>()
    for (const msg of sent) {
      const partnerId = msg.from_id === userId ? msg.to_id : msg.from_id
      if (!partners.has(partnerId)) partners.set(partnerId, msg)
    }
    if (partners.size === 0) return []

    const partnerIds = Array.from(partners.keys())
    // Firestore `in` query limited to 30
    const chunks: string[][] = []
    for (let i = 0; i < partnerIds.length; i += 30) chunks.push(partnerIds.slice(i, i + 30))

    const profiles = new Map<string, any>()
    for (const chunk of chunks) {
      const snap = await this.db.collection('u_profiles').where('__name__', 'in', chunk).get()
      snap.docs.forEach(d => profiles.set(d.id, d.data()))
    }

    return partnerIds.map(pid => ({
      partner: profiles.get(pid) ?? { id: pid },
      last_message: partners.get(pid)?.content ?? '',
      last_at: partners.get(pid)?.created_at,
      unread: sent.filter(m => m.from_id === pid && m.to_id === userId && !m.is_read).length,
    })).sort((a: any, b: any) => new Date(b.last_at ?? 0).getTime() - new Date(a.last_at ?? 0).getTime())
  }

  async getMessages(userId: string, partnerId: string) {
    // Mark as read
    const unreadSnap = await this.db.collection('u_direct_messages')
      .where('from_id', '==', partnerId)
      .where('to_id', '==', userId)
      .where('is_read', '==', false).get()
    const batch = this.db.batch()
    for (const doc of unreadSnap.docs) batch.update(doc.ref, { is_read: true })
    if (!unreadSnap.empty) await batch.commit()

    // Get messages between the two users (two queries, Firestore has no OR)
    const [sentSnap, receivedSnap] = await Promise.all([
      this.db.collection('u_direct_messages')
        .where('from_id', '==', userId).where('to_id', '==', partnerId).get(),
      this.db.collection('u_direct_messages')
        .where('from_id', '==', partnerId).where('to_id', '==', userId).get(),
    ])

    return [...sentSnap.docs, ...receivedSnap.docs]
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime())
  }

  async sendMessage(fromId: string, toId: string, content: string) {
    if (fromId === toId) throw new ForbiddenException('No puedes enviarte mensajes a ti mismo')
    const target = await this.db.collection('u_profiles').doc(toId).get()
    if (!target.exists || !target.data()?.is_active) throw new ForbiddenException('Usuario destinatario no existe')

    const id = randomUUID()
    const msg = { id, from_id: fromId, to_id: toId, content, is_read: false, created_at: new Date().toISOString() }
    await this.db.collection('u_direct_messages').doc(id).set(msg)
    return msg
  }

  async getUnreadCount(userId: string): Promise<number> {
    const snap = await this.db.collection('u_direct_messages')
      .where('to_id', '==', userId).where('is_read', '==', false).get()
    return snap.size
  }
}
