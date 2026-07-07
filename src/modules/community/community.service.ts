import { Injectable, Inject } from '@nestjs/common'
import { Firestore, FieldValue, Query } from 'firebase-admin/firestore'
import { v4 as uuid } from 'uuid'
import { FIRESTORE } from '../../database/firebase.provider'

@Injectable()
export class CommunityService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async getGroups() {
    const snap = await this.db.collection('u_groups')
      .where('is_public', '==', true).orderBy('member_count', 'desc').get()
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  }

  async getPosts(groupId?: string, userId?: string, limit = 20) {
    let q: Query = this.db.collection('u_posts')
    if (groupId) q = q.where('group_id', '==', groupId)
    const postSnap = await q.orderBy('created_at', 'desc').limit(limit).get()
    const posts = postSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    // Enrich with author profiles
    const authorIds = [...new Set(posts.map(p => p.author_id))]
    const authorMap = new Map<string, any>()
    for (const aid of authorIds) {
      const doc = await this.db.collection('u_profiles').doc(aid).get()
      if (doc.exists) authorMap.set(aid, doc.data())
    }

    const enriched = posts.map(p => ({
      ...p,
      full_name: authorMap.get(p.author_id)?.full_name ?? null,
      avatar_url: authorMap.get(p.author_id)?.avatar_url ?? null,
    }))

    if (userId) {
      const likedSnap = await this.db.collection('u_post_likes')
        .where('user_id', '==', userId).get()
      const likedSet = new Set(likedSnap.docs.map(l => l.data().post_id))
      return enriched.map(p => ({ ...p, user_liked: likedSet.has(p.id) }))
    }

    return enriched.map(p => ({ ...p, user_liked: false }))
  }

  async getComments(postId: string) {
    const snap = await this.db.collection('u_comments')
      .where('post_id', '==', postId).orderBy('created_at', 'asc').get()
    const comments = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    const authorIds = [...new Set(comments.map(c => c.author_id))]
    const authorMap = new Map<string, any>()
    for (const aid of authorIds) {
      const doc = await this.db.collection('u_profiles').doc(aid).get()
      if (doc.exists) authorMap.set(aid, doc.data())
    }

    return comments.map(c => ({
      ...c,
      full_name: authorMap.get(c.author_id)?.full_name ?? null,
      avatar_url: authorMap.get(c.author_id)?.avatar_url ?? null,
    }))
  }

  async createPost(authorId: string, content: string, groupId?: string) {
    const id = uuid()
    await this.db.collection('u_posts').doc(id).set({
      id, author_id: authorId, content, group_id: groupId ?? null,
      like_count: 0, created_at: new Date().toISOString(),
    })

    const authorDoc = await this.db.collection('u_profiles').doc(authorId).get()
    const author = authorDoc.data()
    return { id, author_id: authorId, content, group_id: groupId ?? null, like_count: 0,
      created_at: new Date().toISOString(), full_name: author?.full_name ?? null,
      avatar_url: author?.avatar_url ?? null, user_liked: false }
  }

  async createComment(postId: string, authorId: string, content: string) {
    const id = uuid()
    await this.db.collection('u_comments').doc(id).set({
      id, post_id: postId, author_id: authorId, content,
      created_at: new Date().toISOString(),
    })

    const doc = await this.db.collection('u_comments').doc(id).get()
    const authorDoc = await this.db.collection('u_profiles').doc(authorId).get()
    const author = authorDoc.data()
    return { id: doc.id, ...doc.data()!, full_name: author?.full_name ?? null, avatar_url: author?.avatar_url ?? null }
  }

  async toggleLike(userId: string, postId: string) {
    const snap = await this.db.collection('u_post_likes')
      .where('user_id', '==', userId)
      .where('post_id', '==', postId)
      .limit(1).get()

    if (!snap.empty) {
      await snap.docs[0].ref.delete()
      await this.db.collection('u_posts').doc(postId).update({
        like_count: FieldValue.increment(-1),
      })
      return { liked: false }
    }

    await this.db.collection('u_post_likes').doc(uuid()).set({
      user_id: userId, post_id: postId,
    })
    await this.db.collection('u_posts').doc(postId).update({
      like_count: FieldValue.increment(1),
    })
    return { liked: true }
  }
}
