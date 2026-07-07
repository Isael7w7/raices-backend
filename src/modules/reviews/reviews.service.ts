import { Injectable, Inject } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { v4 as uuid } from 'uuid'
import { FIRESTORE } from '../../database/firebase.provider'

@Injectable()
export class ReviewsService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async findByInstitution(institutionId: string) {
    const revSnap = await this.db.collection('u_reviews')
      .where('institution_id', '==', institutionId).orderBy('created_at', 'desc').get()
    const reviews = revSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    // Enrich with user profile data
    const userIds = [...new Set(reviews.map(r => r.user_id))]
    const userMap = new Map<string, any>()
    for (const uid of userIds) {
      const doc = await this.db.collection('u_profiles').doc(uid).get()
      if (doc.exists) userMap.set(uid, doc.data())
    }

    return reviews.map(r => ({
      id: r.id, rating: r.rating, comment: r.comment, created_at: r.created_at,
      full_name: userMap.get(r.user_id)?.full_name ?? null,
      avatar_url: userMap.get(r.user_id)?.avatar_url ?? null,
    }))
  }

  async submit(userId: string, institutionId: string, rating: number, comment: string) {
    const snap = await this.db.collection('u_reviews')
      .where('user_id', '==', userId)
      .where('institution_id', '==', institutionId)
      .limit(1).get()

    if (!snap.empty) {
      await snap.docs[0].ref.update({ rating, comment })
    } else {
      await this.db.collection('u_reviews').doc(uuid()).set({
        id: uuid(), user_id: userId, institution_id: institutionId,
        rating, comment, created_at: new Date().toISOString(),
      })
    }

    // Recalculate rating
    const allRev = await this.db.collection('u_reviews')
      .where('institution_id', '==', institutionId).get()
    const ratings = allRev.docs.map(d => d.data().rating as number)
    const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length
    await this.db.collection('p_institutions').doc(institutionId).update({
      rating_avg: parseFloat(avg.toFixed(2)),
      rating_count: ratings.length,
    })

    return { ok: true }
  }

  async myReviews(userId: string) {
    const revSnap = await this.db.collection('u_reviews')
      .where('user_id', '==', userId).orderBy('created_at', 'desc').get()
    const reviews = revSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    const instIds = [...new Set(reviews.map(r => r.institution_id))]
    const instMap = new Map<string, any>()
    for (const iid of instIds) {
      const doc = await this.db.collection('p_institutions').doc(iid).get()
      if (doc.exists) instMap.set(iid, doc.data())
    }

    return reviews.map(r => ({
      ...r,
      institution_name: instMap.get(r.institution_id)?.name ?? null,
      category: instMap.get(r.institution_id)?.category ?? null,
    }))
  }
}
