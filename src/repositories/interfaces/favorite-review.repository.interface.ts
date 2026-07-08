// ─── Reseña (u_reviews) ──────────────────────────────────────────────────
export interface Review {
  id: string
  user_id: string
  institution_id: string
  rating: number
  comment: string
  created_at: string
}

// ─── Favorito (u_favorites) ──────────────────────────────────────────────
export interface Favorite {
  id: string
  user_id: string
  institution_id: string
  created_at: string
}

// ─── DTOs ────────────────────────────────────────────────────────────────
export interface CreateReviewData {
  user_id: string
  institution_id: string
  rating: number
  comment: string
}

// ─── Token de inyección ──────────────────────────────────────────────────
export const FAVORITE_REVIEW_REPOSITORY = 'FAVORITE_REVIEW_REPOSITORY'

// ─── Interfaz del repositorio ────────────────────────────────────────────
export interface IFavoriteReviewRepository {
  // ── Favoritos ──────────────────────────────────────────────────────────

  /** Obtiene todos los favoritos de un usuario */
  findFavoritesByUser(userId: string): Promise<Favorite[]>

  /** Busca un favorito específico (para toggle) */
  findFavoriteByUserAndInstitution(userId: string, institutionId: string): Promise<Favorite | null>

  /** Agrega un favorito */
  createFavorite(userId: string, institutionId: string): Promise<void>

  /** Elimina un favorito por ID de documento */
  deleteFavorite(favId: string): Promise<void>

  /** Obtiene solo los IDs de instituciones favoritas de un usuario */
  getFavoriteInstitutionIds(userId: string): Promise<string[]>

  // ── Reseñas ────────────────────────────────────────────────────────────

  /** Reseñas de una institución, ordenadas por fecha descendente */
  findReviewsByInstitution(institutionId: string): Promise<Review[]>

  /** Busca reseña de un usuario sobre una institución (para evitar duplicados) */
  findReviewByUserAndInstitution(userId: string, institutionId: string): Promise<Review | null>

  /** Busca una reseña por su ID */
  findReviewById(id: string): Promise<Review | null>

  /** Crea una nueva reseña */
  createReview(data: CreateReviewData): Promise<Review>

  /** Actualiza rating y comment de una reseña existente */
  updateReview(id: string, rating: number, comment: string): Promise<void>

  /** Reseñas escritas por un usuario */
  findReviewsByUser(userId: string): Promise<Review[]>

  /** Todas las reseñas (admin/moderación) con límite opcional */
  findAllReviews(limit?: number): Promise<Review[]>

  /** Elimina una reseña */
  deleteReview(id: string): Promise<void>
}
