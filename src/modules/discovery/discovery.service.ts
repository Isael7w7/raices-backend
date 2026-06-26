import { Injectable, Inject } from '@nestjs/common'
import { Knex } from 'knex'
import { KNEX_CONNECTION } from '../../database/knex.provider'

@Injectable()
export class DiscoveryService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}

  async discover(userId: string, filters: any = {}) {
    const profile = await this.db('u_user_profiles').where({ user_id: userId }).first()
    let userDisabilities: string[] = []
    try { userDisabilities = JSON.parse(profile?.disability_types ?? '[]') } catch {}

    let q = this.db('p_institutions').where({ is_active: true })

    if (filters.category) q = q.where({ category: filters.category })
    if (filters.city) q = q.whereILike('city', `%${filters.city}%`)
    if (filters.search) q = q.whereILike('name', `%${filters.search}%`)
    if (filters.disability_type) {
      q = q.whereRaw(`disability_types LIKE ?`, [`%"${filters.disability_type}"%`])
    }

    const rows = await q.orderBy('rating_avg', 'desc').limit(50)

    return rows.map((r: any) => {
      let types: string[] = []
      try { types = JSON.parse(r.disability_types ?? '[]') } catch {}
      const match = userDisabilities.length > 0 && userDisabilities.some((d) => types.includes(d))
      return { ...r, disability_types: types, profile_match: match }
    }).sort((a: any, b: any) => (b.profile_match ? 1 : 0) - (a.profile_match ? 1 : 0))
  }
}
