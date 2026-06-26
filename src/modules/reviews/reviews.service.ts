import { Injectable, Inject } from '@nestjs/common'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'
import { KNEX_CONNECTION } from '../../database/knex.provider'

@Injectable()
export class ReviewsService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}

  async findByInstitution(institutionId: string) {
    return this.db('u_reviews as r')
      .join('u_profiles as p', 'r.user_id', 'p.id')
      .where({ 'r.institution_id': institutionId })
      .select('r.id', 'r.rating', 'r.comment', 'r.created_at', 'p.full_name', 'p.avatar_url')
      .orderBy('r.created_at', 'desc')
  }

  async submit(userId: string, institutionId: string, rating: number, comment: string) {
    const exists = await this.db('u_reviews').where({ user_id: userId, institution_id: institutionId }).first()
    if (exists) {
      await this.db('u_reviews').where({ id: exists.id }).update({ rating, comment })
    } else {
      await this.db('u_reviews').insert({ id: uuid(), user_id: userId, institution_id: institutionId, rating, comment })
    }

    const rows = await this.db('u_reviews').where({ institution_id: institutionId }).select('rating')
    const avg = rows.reduce((s: number, r: any) => s + r.rating, 0) / rows.length
    await this.db('p_institutions').where({ id: institutionId }).update({
      rating_avg: parseFloat(avg.toFixed(2)),
      rating_count: rows.length,
    })

    return { ok: true }
  }

  async myReviews(userId: string) {
    return this.db('u_reviews as r')
      .join('p_institutions as i', 'r.institution_id', 'i.id')
      .where({ 'r.user_id': userId })
      .select('r.*', 'i.name as institution_name', 'i.category')
      .orderBy('r.created_at', 'desc')
  }
}
