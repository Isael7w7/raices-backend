import { Injectable, Inject } from '@nestjs/common'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'
import { KNEX_CONNECTION } from '../../database/knex.provider'

@Injectable()
export class FavoritesService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}

  async findByUser(userId: string) {
    const favs = await this.db('u_favorites').where({ user_id: userId })
    if (!favs.length) return []
    const ids = favs.map((f: any) => f.institution_id)
    const institutions = await this.db('p_institutions').whereIn('id', ids)
    return institutions.map((i: any) => {
      try { i.disability_types = JSON.parse(i.disability_types ?? '[]') } catch { i.disability_types = [] }
      return i
    })
  }

  async toggle(userId: string, institutionId: string) {
    const exists = await this.db('u_favorites').where({ user_id: userId, institution_id: institutionId }).first()
    if (exists) {
      await this.db('u_favorites').where({ user_id: userId, institution_id: institutionId }).delete()
      return { favorited: false }
    }
    await this.db('u_favorites').insert({ id: uuid(), user_id: userId, institution_id: institutionId })
    return { favorited: true }
  }

  async getFavoriteIds(userId: string): Promise<string[]> {
    const rows = await this.db('u_favorites').where({ user_id: userId }).select('institution_id')
    return rows.map((r: any) => r.institution_id)
  }
}
