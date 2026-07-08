// ─── Grupos de comunidad (u_groups) ──────────────────────────────────────
export interface CommunityGroup {
  id: string
  name: string
  description: string
  is_public: boolean
  member_count: number
  created_at: string
  [key: string]: any
}

// ─── Publicaciones (u_posts) ─────────────────────────────────────────────
export interface Post {
  id: string
  author_id: string
  content: string
  group_id: string | null
  like_count: number
  created_at: string
}

// ─── Comentarios (u_comments) ────────────────────────────────────────────
export interface Comment {
  id: string
  post_id: string
  author_id: string
  content: string
  created_at: string
}

// ─── Likes (u_post_likes) ────────────────────────────────────────────────
export interface PostLike {
  id?: string
  user_id: string
  post_id: string
}

// ─── DTOs ────────────────────────────────────────────────────────────────
export interface CreatePostData {
  author_id: string
  content: string
  group_id?: string | null
}

export interface CreateCommentData {
  post_id: string
  author_id: string
  content: string
}

// ─── Token de inyección ──────────────────────────────────────────────────
export const COMMUNITY_REPOSITORY = 'COMMUNITY_REPOSITORY'

// ─── Interfaz del repositorio ────────────────────────────────────────────
export interface ICommunityRepository {
  // ── Grupos ───────────────────────────────────────────────────────────

  /** Lista grupos públicos ordenados por miembros descendente */
  findPublicGroups(): Promise<CommunityGroup[]>

  // ── Publicaciones ────────────────────────────────────────────────────

  /** Lista publicaciones, opcionalmente filtradas por grupo, con límite */
  findPosts(groupId?: string, limit?: number): Promise<Post[]>

  /** Busca una publicación por ID */
  findPostById(id: string): Promise<Post | null>

  /** Crea una nueva publicación */
  createPost(data: CreatePostData): Promise<Post>

  /** Incrementa el contador de likes de una publicación */
  incrementPostLikeCount(postId: string): Promise<void>

  /** Decrementa el contador de likes de una publicación */
  decrementPostLikeCount(postId: string): Promise<void>

  /** Cuenta total de publicaciones */
  countAllPosts(): Promise<number>

  // ── Comentarios ──────────────────────────────────────────────────────

  /** Lista comentarios de una publicación, orden ascendente */
  findCommentsByPost(postId: string): Promise<Comment[]>

  /** Crea un nuevo comentario */
  createComment(data: CreateCommentData): Promise<Comment>

  // ── Likes ────────────────────────────────────────────────────────────

  /** Obtiene todos los likes de un usuario (para saber qué posts le gustan) */
  findLikesByUser(userId: string): Promise<PostLike[]>

  /** Busca un like específico (para toggle) */
  findLikeByUserAndPost(userId: string, postId: string): Promise<PostLike | null>

  /** Crea un like */
  createLike(userId: string, postId: string): Promise<void>

  /** Elimina un like por su ID de documento */
  deleteLikeById(likeId: string): Promise<void>
}
