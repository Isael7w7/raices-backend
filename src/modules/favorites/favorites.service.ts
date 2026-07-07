import { Injectable, Inject } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { v4 as uuid } from 'uuid'
import { FIRESTORE } from '../../database/firebase.provider'

@Injectable()
export class FavoritesService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async findByUser(userId: string) {
    const favSnap = await this.db.collection('u_favorites')
      .where('user_id', '==', userId).get()
    if (favSnap.empty) return []
    const ids = favSnap.docs.map(f => f.data().institution_id)

    // Firestore `in` query limited to 30 items
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30))

    const institutions: any[] = []
    for (const chunk of chunks) {
      const snap = await this.db.collection('p_institutions')
        .where('__name__', 'in', chunk).get()
      institutions.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }
    return institutions.map((i: any) => {
      try { i.disability_types = JSON.parse(i.disability_types ?? '[]') } catch { i.disability_types = [] }
      return i
    })
  }

  async toggle(userId: string, institutionId: string) {
    const snap = await this.db.collection('u_favorites')
      .where('user_id', '==', userId)
      .where('institution_id', '==', institutionId)
      .limit(1).get()
    if (!snap.empty) {
      await snap.docs[0].ref.delete()
      return { favorited: false }
    }
    await this.db.collection('u_favorites').doc(uuid()).set({
      id: uuid(), user_id: userId, institution_id: institutionId,
      created_at: new Date().toISOString(),
    })
    return { favorited: true }
  }

  async getFavoriteIds(userId: string): Promise<string[]> {
    const snap = await this.db.collection('u_favorites')
      .where('user_id', '==', userId).get()
    return snap.docs.map(f => f.data().institution_id)
  }
}
