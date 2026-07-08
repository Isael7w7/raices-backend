import { Injectable, Inject } from '@nestjs/common'
import { Firestore, CollectionReference } from 'firebase-admin/firestore'
import { randomUUID } from 'crypto'
import { FIRESTORE } from '../../database/firebase.provider'
import type {
  Review,
  Favorite,
  CreateReviewData,
  IFavoriteReviewRepository,
} from '../interfaces/favorite-review.repository.interface'

@Injectable()
export class FirestoreFavoriteReviewRepository implements IFavoriteReviewRepository {
  private readonly favCol: CollectionReference
  private readonly revCol: CollectionReference

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {
    this.favCol = this.db.collection('u_favorites')
    this.revCol = this.db.collection('u_reviews')
  }

  // ── Favoritos ──────────────────────────────────────────────────────────

  async findFavoritesByUser(userId: string): Promise<Favorite[]> {
    const snap = await this.favCol.where('user_id', '==', userId).get()
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Favorite))
  }

  async findFavoriteByUserAndInstitution(
    userId: string,
    institutionId: string,
  ): Promise<Favorite | null> {
    const snap = await this.favCol
      .where('user_id', '==', userId)
      .where('institution_id', '==', institutionId)
      .limit(1)
      .get()
    if (snap.empty) return null
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as Favorite
  }

  async createFavorite(userId: string, institutionId: string): Promise<void> {
    await this.favCol.doc(randomUUID()).set({
      user_id: userId,
      institution_id: institutionId,
      created_at: new Date().toISOString(),
    })
  }

  async deleteFavorite(favId: string): Promise<void> {
    await this.favCol.doc(favId).delete()
  }

  async getFavoriteInstitutionIds(userId: string): Promise<string[]> {
    const snap = await this.favCol.where('user_id', '==', userId).get()
    return snap.docs.map((d) => d.data().institution_id as string)
  }

  // ── Reseñas ────────────────────────────────────────────────────────────

  async findReviewsByInstitution(institutionId: string): Promise<Review[]> {
    const snap = await this.revCol
      .where('institution_id', '==', institutionId)
      .orderBy('created_at', 'desc')
      .get()
    return snap.docs.map((d) => this.reviewToDomain(d.id, d.data()))
  }

  async findReviewByUserAndInstitution(
    userId: string,
    institutionId: string,
  ): Promise<Review | null> {
    const snap = await this.revCol
      .where('user_id', '==', userId)
      .where('institution_id', '==', institutionId)
      .limit(1)
      .get()
    if (snap.empty) return null
    return this.reviewToDomain(snap.docs[0].id, snap.docs[0].data())
  }

  async findReviewById(id: string): Promise<Review | null> {
    const doc = await this.revCol.doc(id).get()
    if (!doc.exists) return null
    return this.reviewToDomain(doc.id, doc.data()!)
  }

  async createReview(data: CreateReviewData): Promise<Review> {
    const id = randomUUID()
    const now = new Date().toISOString()
    const review: Review = {
      id,
      user_id: data.user_id,
      institution_id: data.institution_id,
      rating: data.rating,
      comment: data.comment,
      created_at: now,
    }
    await this.revCol.doc(id).set(review)
    return review
  }

  async updateReview(id: string, rating: number, comment: string): Promise<void> {
    await this.revCol.doc(id).update({ rating, comment })
  }

  async findReviewsByUser(userId: string): Promise<Review[]> {
    const snap = await this.revCol
      .where('user_id', '==', userId)
      .orderBy('created_at', 'desc')
      .get()
    return snap.docs.map((d) => this.reviewToDomain(d.id, d.data()))
  }

  async findAllReviews(limit = 100): Promise<Review[]> {
    const snap = await this.revCol.orderBy('created_at', 'desc').limit(limit).get()
    return snap.docs.map((d) => this.reviewToDomain(d.id, d.data()))
  }

  async deleteReview(id: string): Promise<void> {
    await this.revCol.doc(id).delete()
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private reviewToDomain(
    id: string,
    data: FirebaseFirestore.DocumentData,
  ): Review {
    return {
      id,
      user_id: data.user_id ?? '',
      institution_id: data.institution_id ?? '',
      rating: data.rating ?? 0,
      comment: data.comment ?? '',
      created_at: data.created_at ?? '',
    }
  }
}
