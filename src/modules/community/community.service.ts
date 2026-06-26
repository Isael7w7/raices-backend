import { Injectable, Inject } from '@nestjs/common'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'
import { KNEX_CONNECTION } from '../../database/knex.provider'

@Injectable()
export class CommunityService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}

  async getGroups() {
    return this.db('u_groups').where({ is_public: true }).orderBy('member_count', 'desc')
  }

  async getPosts(groupId?: string, userId?: string, limit = 20) {
    let q = this.db('u_posts as p')
      .join('u_profiles as u', 'p.author_id', 'u.id')
      .select('p.id', 'p.content', 'p.like_count', 'p.created_at', 'p.group_id',
              'u.full_name', 'u.avatar_url', 'p.author_id')
      .orderBy('p.created_at', 'desc')
      .limit(limit)
    if (groupId) q = q.where({ 'p.group_id': groupId })

    const posts = await q

    if (userId) {
      const likedIds = await this.db('u_post_likes').where({ user_id: userId }).select('post_id')
      const likedSet = new Set(likedIds.map((r: any) => r.post_id))
      return posts.map((p: any) => ({ ...p, user_liked: likedSet.has(p.id) }))
    }

    return posts.map((p: any) => ({ ...p, user_liked: false }))
  }

  async getComments(postId: string) {
    return this.db('u_comments as c')
      .join('u_profiles as u', 'c.author_id', 'u.id')
      .where({ 'c.post_id': postId })
      .select('c.*', 'u.full_name', 'u.avatar_url')
      .orderBy('c.created_at', 'asc')
  }

  async createPost(authorId: string, content: string, groupId?: string) {
    const id = uuid()
    await this.db('u_posts').insert({ id, author_id: authorId, content, group_id: groupId ?? null })
    const post = await this.db('u_posts as p')
      .join('u_profiles as u', 'p.author_id', 'u.id')
      .where({ 'p.id': id })
      .select('p.*', 'u.full_name', 'u.avatar_url')
      .first()
    return { ...post, user_liked: false }
  }

  async createComment(postId: string, authorId: string, content: string) {
    const id = uuid()
    await this.db('u_comments').insert({ id, post_id: postId, author_id: authorId, content })
    return this.db('u_comments as c')
      .join('u_profiles as u', 'c.author_id', 'u.id')
      .where({ 'c.id': id })
      .select('c.*', 'u.full_name', 'u.avatar_url')
      .first()
  }

  async toggleLike(userId: string, postId: string) {
    const exists = await this.db('u_post_likes').where({ user_id: userId, post_id: postId }).first()
    if (exists) {
      await this.db('u_post_likes').where({ user_id: userId, post_id: postId }).delete()
      await this.db('u_posts').where({ id: postId }).decrement('like_count', 1)
      return { liked: false }
    }
    await this.db('u_post_likes').insert({ user_id: userId, post_id: postId })
    await this.db('u_posts').where({ id: postId }).increment('like_count', 1)
    return { liked: true }
  }
}
