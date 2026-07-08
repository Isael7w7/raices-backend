import { Injectable, Inject } from '@nestjs/common'
import { Firestore, CollectionReference, Query, FieldValue } from 'firebase-admin/firestore'
import { randomUUID } from 'crypto'
import { FIRESTORE } from '../../database/firebase.provider'
import type {
  CommunityGroup,
  Post,
  Comment,
  PostLike,
  CreatePostData,
  CreateCommentData,
  ICommunityRepository,
} from '../interfaces/community.repository.interface'

@Injectable()
export class FirestoreCommunityRepository implements ICommunityRepository {
  private readonly groupsCol: CollectionReference
  private readonly postsCol: CollectionReference
  private readonly commentsCol: CollectionReference
  private readonly likesCol: CollectionReference

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {
    this.groupsCol = this.db.collection('u_groups')
    this.postsCol = this.db.collection('u_posts')
    this.commentsCol = this.db.collection('u_comments')
    this.likesCol = this.db.collection('u_post_likes')
  }

  // ── Grupos ────────────────────────────────────────────────────────────

  async findPublicGroups(): Promise<CommunityGroup[]> {
    const snap = await this.groupsCol
      .where('is_public', '==', true)
      .orderBy('member_count', 'desc')
      .get()
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommunityGroup))
  }

  // ── Publicaciones ─────────────────────────────────────────────────────

  async findPosts(groupId?: string, limit = 20): Promise<Post[]> {
    let q: Query = this.postsCol
    if (groupId) {
      q = q.where('group_id', '==', groupId)
    }
    const snap = await q.orderBy('created_at', 'desc').limit(limit).get()
    return snap.docs.map((d) => this.postToDomain(d.id, d.data()))
  }

  async findPostById(id: string): Promise<Post | null> {
    const doc = await this.postsCol.doc(id).get()
    if (!doc.exists) return null
    return this.postToDomain(doc.id, doc.data()!)
  }

  async createPost(data: CreatePostData): Promise<Post> {
    const id = randomUUID()
    const now = new Date().toISOString()
    const post: Post = {
      id,
      author_id: data.author_id,
      content: data.content,
      group_id: data.group_id ?? null,
      like_count: 0,
      created_at: now,
    }
    await this.postsCol.doc(id).set(post)
    return post
  }

  async incrementPostLikeCount(postId: string): Promise<void> {
    await this.postsCol.doc(postId).update({
      like_count: FieldValue.increment(1),
    })
  }

  async decrementPostLikeCount(postId: string): Promise<void> {
    await this.postsCol.doc(postId).update({
      like_count: FieldValue.increment(-1),
    })
  }

  async countAllPosts(): Promise<number> {
    const snap = await this.postsCol.get()
    return snap.size
  }

  // ── Comentarios ───────────────────────────────────────────────────────

  async findCommentsByPost(postId: string): Promise<Comment[]> {
    const snap = await this.commentsCol
      .where('post_id', '==', postId)
      .orderBy('created_at', 'asc')
      .get()
    return snap.docs.map((d) => this.commentToDomain(d.id, d.data()))
  }

  async createComment(data: CreateCommentData): Promise<Comment> {
    const id = randomUUID()
    const now = new Date().toISOString()
    const comment: Comment = {
      id,
      post_id: data.post_id,
      author_id: data.author_id,
      content: data.content,
      created_at: now,
    }
    await this.commentsCol.doc(id).set(comment)
    return comment
  }

  // ── Likes ─────────────────────────────────────────────────────────────

  async findLikesByUser(userId: string): Promise<PostLike[]> {
    const snap = await this.likesCol.where('user_id', '==', userId).get()
    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as PostLike[]
  }

  async findLikeByUserAndPost(
    userId: string,
    postId: string,
  ): Promise<PostLike | null> {
    const snap = await this.likesCol
      .where('user_id', '==', userId)
      .where('post_id', '==', postId)
      .limit(1)
      .get()
    if (snap.empty) return null
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as PostLike
  }

  async createLike(userId: string, postId: string): Promise<void> {
    await this.likesCol.doc(randomUUID()).set({
      user_id: userId,
      post_id: postId,
    })
  }

  async deleteLikeById(likeId: string): Promise<void> {
    await this.likesCol.doc(likeId).delete()
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private postToDomain(
    id: string,
    data: FirebaseFirestore.DocumentData,
  ): Post {
    return {
      id,
      author_id: data.author_id ?? '',
      content: data.content ?? '',
      group_id: data.group_id ?? null,
      like_count: data.like_count ?? 0,
      created_at: data.created_at ?? '',
    }
  }

  private commentToDomain(
    id: string,
    data: FirebaseFirestore.DocumentData,
  ): Comment {
    return {
      id,
      post_id: data.post_id ?? '',
      author_id: data.author_id ?? '',
      content: data.content ?? '',
      created_at: data.created_at ?? '',
    }
  }
}
