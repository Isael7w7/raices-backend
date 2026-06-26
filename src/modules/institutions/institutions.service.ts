import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'
import { KNEX_CONNECTION } from '../../database/knex.provider'

@Injectable()
export class InstitutionsService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}

  async findAll(filters: any = {}) {
    let q = this.db('p_institutions').where({ is_active: true })

    if (filters.category) q = q.where({ category: filters.category })
    if (filters.city) q = q.whereILike('city', `%${filters.city}%`)
    if (filters.search) {
      const term = `%${filters.search}%`
      q = q.where(function () {
        this.whereILike('name', term)
          .orWhereILike('description', term)
          .orWhereILike('city', term)
          .orWhereILike('state', term)
      })
    }
    if (filters.disability_type) {
      q = q.whereRaw(`disability_types LIKE ?`, [`%"${filters.disability_type}"%`])
    }
    if (filters.age) {
      const age = parseInt(filters.age)
      q = q.where(function () {
        this.whereNull('age_min').orWhere('age_min', '<=', age)
      }).where(function () {
        this.whereNull('age_max').orWhere('age_max', '>=', age)
      })
    }

    const rows = await q.orderBy('rating_avg', 'desc')
    return rows.map(this.parse)
  }

  async findOne(id: string) {
    const row = await this.db('p_institutions').where({ id }).first()
    if (!row) throw new NotFoundException('Institución no encontrada')
    return this.parse(row)
  }

  async create(data: any, userId: string) {
    const id = uuid()
    await this.db('p_institutions').insert({
      id, ...data,
      disability_types: JSON.stringify(data.disability_types ?? []),
      created_by: userId, is_active: true, is_verified: false,
    })
    return this.findOne(id)
  }

  private parse(row: any) {
    if (!row) return row
    try { row.disability_types = JSON.parse(row.disability_types ?? '[]') } catch { row.disability_types = [] }
    return row
  }
}
