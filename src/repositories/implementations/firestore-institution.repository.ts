import { Injectable, Inject } from '@nestjs/common'
import { Firestore, CollectionReference, Query } from 'firebase-admin/firestore'
import { randomUUID } from 'crypto'
import { FIRESTORE } from '../../database/firebase.provider'
import type {
  Institution,
  InstitutionFilters,
  CreateInstitutionData,
  IInstitutionRepository,
} from '../interfaces/institution.repository.interface'

@Injectable()
export class FirestoreInstitutionRepository implements IInstitutionRepository {
  private readonly col: CollectionReference

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {
    this.col = this.db.collection('p_institutions')
  }

  async findAll(filters: InstitutionFilters = {}): Promise<Institution[]> {
    let q: Query = this.col.where('is_active', '==', true)
    if (filters.category) {
      q = q.where('category', '==', filters.category)
    }
    const snap = await q.orderBy('rating_avg', 'desc').get()
    let rows = snap.docs.map((d) => this.toDomain(d.id, d.data()))

    // ── Post-filtering (Firestore no soporta LIKE / texto libre) ─────
    if (filters.city) {
      const term = filters.city.toLowerCase()
      rows = rows.filter((r) => r.city.toLowerCase().includes(term))
    }
    if (filters.search) {
      const term = filters.search.toLowerCase()
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(term) ||
          r.description.toLowerCase().includes(term) ||
          r.city.toLowerCase().includes(term) ||
          r.state.toLowerCase().includes(term),
      )
    }
    if (filters.disability_type) {
      const dt = filters.disability_type.toLowerCase()
      rows = rows.filter((r) => r.disability_types.some((d) => d.toLowerCase() === dt))
    }
    if (filters.age != null) {
      const age = filters.age
      rows = rows.filter(
        (r) =>
          (r.age_min == null || r.age_min <= age) &&
          (r.age_max == null || r.age_max >= age),
      )
    }

    return rows
  }

  async findById(id: string): Promise<Institution | null> {
    const doc = await this.col.doc(id).get()
    if (!doc.exists) return null
    return this.toDomain(doc.id, doc.data()!)
  }

  async findByIds(ids: string[]): Promise<Institution[]> {
    if (ids.length === 0) return []
    // Firestore `in` query está limitado a 30 valores por lote
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += 30) {
      chunks.push(ids.slice(i, i + 30))
    }
    const results: Institution[] = []
    for (const chunk of chunks) {
      const snap = await this.col.where('__name__', 'in', chunk).get()
      for (const doc of snap.docs) {
        results.push(this.toDomain(doc.id, doc.data()))
      }
    }
    return results
  }

  async create(data: CreateInstitutionData, userId: string): Promise<Institution> {
    const id = randomUUID()
    const now = new Date().toISOString()
    const docData: Record<string, any> = {
      id,
      name: data.name,
      description: data.description ?? '',
      category: data.category,
      city: data.city ?? '',
      state: data.state ?? '',
      phone: data.phone ?? '',
      email: data.email ?? '',
      website: data.website ?? '',
      disability_types: JSON.stringify(data.disability_types ?? []),
      age_min: data.age_min ?? null,
      age_max: data.age_max ?? null,
      rating_avg: 0,
      rating_count: 0,
      is_active: true,
      is_verified: false,
      created_by: userId,
      created_at: now,
    }
    if (data.contact_email) docData.contact_email = data.contact_email
    await this.col.doc(id).set(docData)
    return (await this.findById(id))!
  }

  async update(id: string, data: Partial<Institution>): Promise<void> {
    const updateData: Record<string, any> = { ...data }
    // Serializar disability_types si viene como array
    if (Array.isArray(updateData.disability_types)) {
      updateData.disability_types = JSON.stringify(updateData.disability_types)
    }
    delete (updateData as any).id
    updateData.updated_at = new Date().toISOString()
    await this.col.doc(id).update(updateData)
  }

  async softDelete(id: string): Promise<void> {
    await this.col.doc(id).update({ is_active: false, updated_at: new Date().toISOString() })
  }

  async countActive(): Promise<number> {
    const snap = await this.col.where('is_active', '==', true).get()
    return snap.size
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  /** Convierte un documento Firestore crudo al tipo de dominio Institution */
  private toDomain(id: string, data: FirebaseFirestore.DocumentData): Institution {
    let types: string[] = []
    try {
      types = JSON.parse(data.disability_types ?? '[]')
      if (!Array.isArray(types)) types = []
    } catch {
      types = []
    }
    return {
      id,
      name: data.name ?? '',
      description: data.description ?? '',
      category: data.category ?? '',
      city: data.city ?? '',
      state: data.state ?? '',
      phone: data.phone ?? '',
      email: data.email ?? '',
      website: data.website ?? '',
      disability_types: types,
      age_min: data.age_min ?? null,
      age_max: data.age_max ?? null,
      rating_avg: data.rating_avg ?? 0,
      rating_count: data.rating_count ?? 0,
      is_active: data.is_active ?? false,
      is_verified: data.is_verified ?? false,
      created_by: data.created_by ?? '',
      created_at: data.created_at ?? '',
      contact_email: data.contact_email ?? undefined,
    }
  }
}
