import { Injectable, Inject, ForbiddenException } from '@nestjs/common'
import { Knex } from 'knex'
import { KNEX_CONNECTION } from '../../database/knex.provider'
import { randomUUID } from 'crypto'

@Injectable()
export class MessagesService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}

  async getConversations(userId: string) {
    // Get latest message per conversation partner
    const sent = await this.db('u_direct_messages')
      .where('from_id', userId)
      .orWhere('to_id', userId)
      .orderBy('created_at', 'desc')
      .select('*')

    const partners = new Map<string, any>()
    for (const msg of sent) {
      const partnerId = msg.from_id === userId ? msg.to_id : msg.from_id
      if (!partners.has(partnerId)) partners.set(partnerId, msg)
    }

    if (partners.size === 0) return []

    const partnerIds = Array.from(partners.keys())
    const profiles = await this.db('u_profiles')
      .whereIn('id', partnerIds)
      .select('id', 'full_name', 'avatar_url', 'role')

    return profiles.map(p => {
      const lastMsg = partners.get(p.id)
      return {
        partner: p,
        last_message: lastMsg?.content ?? '',
        last_at: lastMsg?.created_at,
        unread: sent.filter(m => m.from_id === p.id && m.to_id === userId && !m.is_read).length,
      }
    }).sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime())
  }

  async getMessages(userId: string, partnerId: string) {
    // Mark as read
    await this.db('u_direct_messages')
      .where({ from_id: partnerId, to_id: userId, is_read: false })
      .update({ is_read: true })

    return this.db('u_direct_messages')
      .where(function () {
        this.where({ from_id: userId, to_id: partnerId })
          .orWhere({ from_id: partnerId, to_id: userId })
      })
      .orderBy('created_at', 'asc')
      .select('*')
  }

  async sendMessage(fromId: string, toId: string, content: string) {
    if (fromId === toId) throw new ForbiddenException('No puedes enviarte mensajes a ti mismo')
    const target = await this.db('u_profiles').where({ id: toId, is_active: true }).first()
    if (!target) throw new ForbiddenException('Usuario destinatario no existe')

    const id = randomUUID()
    await this.db('u_direct_messages').insert({ id, from_id: fromId, to_id: toId, content, is_read: false })
    return { id, from_id: fromId, to_id: toId, content, is_read: false, created_at: new Date().toISOString() }
  }

  async getUnreadCount(userId: string): Promise<number> {
    const row = await this.db('u_direct_messages')
      .where({ to_id: userId, is_read: false })
      .count('* as total')
      .first()
    return Number((row as any)?.total ?? 0)
  }
}
