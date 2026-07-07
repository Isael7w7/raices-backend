import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { v4 as uuid } from 'uuid'
import { FIRESTORE } from '../../database/firebase.provider'

@Injectable()
export class InstitutionsService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private col(name: string) { return this.db.collection(name) }

  async findAll(filters: any = {}) {
    let q = this.col('p_institutions').where('is_active', '==', true)
    if (filters.category) q = q.where('category', '==', filters.category)
    const snap = await q.orderBy('rating_avg', 'desc').get()
    let rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    // Post-query filtering for LIKE / text-search patterns
    if (filters.city) {
      const term = filters.city.toLowerCase()
      rows = rows.filter((r: any) => (r.city ?? '').toLowerCase().includes(term))
    }
    if (filters.search) {
      const term = filters.search.toLowerCase()
      rows = rows.filter((r: any) =>
        (r.name ?? '').toLowerCase().includes(term) ||
        (r.description ?? '').toLowerCase().includes(term) ||
        (r.city ?? '').toLowerCase().includes(term) ||
        (r.state ?? '').toLowerCase().includes(term)
      )
    }
    if (filters.disability_type) {
      rows = rows.filter((r: any) => {
        try { const arr: string[] = JSON.parse(r.disability_types ?? '[]'); return arr.includes(filters.disability_type) } catch { return false }
      })
    }
    if (filters.age) {
      const age = parseInt(filters.age)
      rows = rows.filter((r: any) =>
        (r.age_min == null || r.age_min <= age) && (r.age_max == null || r.age_max >= age)
      )
    }

    return rows.map(this.parse)
  }

  async findOne(id: string) {
    const doc = await this.col('p_institutions').doc(id).get()
    if (!doc.exists) throw new NotFoundException('Institución no encontrada')
    return this.parse({ id: doc.id, ...doc.data()! })
  }

  async create(data: any, userId: string) {
    const id = uuid()
    await this.col('p_institutions').doc(id).set({
      id, ...data,
      disability_types: JSON.stringify(data.disability_types ?? []),
      created_by: userId, is_active: true, is_verified: false,
      created_at: new Date().toISOString(),
    })
    return this.findOne(id)
  }

  private parse(row: any) {
    if (!row) return row
    try { row.disability_types = JSON.parse(row.disability_types ?? '[]') } catch { row.disability_types = [] }
    return row
  }
}
