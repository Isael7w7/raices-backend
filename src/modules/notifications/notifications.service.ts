import { Injectable, Inject } from '@nestjs/common'
import { Knex } from 'knex'
import { Subject } from 'rxjs'
import { v4 as uuid } from 'uuid'
import { KNEX_CONNECTION } from '../../database/knex.provider'

@Injectable()
export class NotificationsService {
  private streams = new Map<string, Subject<any>>()

  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}

  getStream(userId: string): Subject<any> {
    if (!this.streams.has(userId)) {
      this.streams.set(userId, new Subject())
    }
    return this.streams.get(userId)!
  }

  async create(userId: string, type: string, title: string, body: string, refId?: string) {
    const id = uuid()
    await this.db('u_notifications').insert({ id, user_id: userId, type, title, body, ref_id: refId ?? null })
    const notif = { id, user_id: userId, type, title, body, ref_id: refId, is_read: 0, created_at: new Date().toISOString() }
    const stream = this.streams.get(userId)
    if (stream) stream.next({ data: JSON.stringify(notif) })
    return notif
  }

  async findByUser(userId: string) {
    return this.db('u_notifications')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .limit(50)
  }

  async markRead(userId: string, notifId: string) {
    await this.db('u_notifications').where({ id: notifId, user_id: userId }).update({ is_read: 1 })
    return { ok: true }
  }

  async markAllRead(userId: string) {
    await this.db('u_notifications').where({ user_id: userId, is_read: 0 }).update({ is_read: 1 })
    return { ok: true }
  }
}
