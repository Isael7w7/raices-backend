import { Injectable, Inject } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'

@Injectable()
export class DiscoveryService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async discover(userId: string, filters: any = {}) {
    const profileSnap = await this.db.collection('u_user_profiles')
      .where('user_id', '==', userId).limit(1).get()
    let userDisabilities: string[] = []
    if (!profileSnap.empty) {
      try { userDisabilities = JSON.parse(profileSnap.docs[0].data().disability_types ?? '[]') } catch {}
    }

    let q = this.db.collection('p_institutions').where('is_active', '==', true)
    if (filters.category) q = q.where('category', '==', filters.category)
    const snap = await q.orderBy('rating_avg', 'desc').limit(50).get()
    let rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    // Post-query filtering for LIKE / text-search patterns
    if (filters.city) {
      const term = filters.city.toLowerCase()
      rows = rows.filter((r: any) => (r.city ?? '').toLowerCase().includes(term))
    }
    if (filters.search) {
      const term = filters.search.toLowerCase()
      rows = rows.filter((r: any) => (r.name ?? '').toLowerCase().includes(term))
    }
    if (filters.disability_type) {
      rows = rows.filter((r: any) => {
        try { const arr: string[] = JSON.parse(r.disability_types ?? '[]'); return arr.includes(filters.disability_type) } catch { return false }
      })
    }

    return rows.map((r: any) => {
      let types: string[] = []
      try { types = JSON.parse(r.disability_types ?? '[]') } catch {}
      const match = userDisabilities.length > 0 && userDisabilities.some((d) => types.includes(d))
      return { ...r, disability_types: types, profile_match: match }
    }).sort((a: any, b: any) => (b.profile_match ? 1 : 0) - (a.profile_match ? 1 : 0))
  }
}
