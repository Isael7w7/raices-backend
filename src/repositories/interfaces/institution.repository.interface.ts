// ─── Institución (dominio) ────────────────────────────────────────────────
// Representa un documento de la colección Firestore 'p_institutions',
// con disability_types ya parseado de JSON string → string[].
export interface Institution {
  id: string
  name: string
  description: string
  category: string
  city: string
  state: string
  phone: string
  email: string
  website: string
  /** Tipos de discapacidad que atiende (ya parseados) */
  disability_types: string[]
  age_min: number | null
  age_max: number | null
  rating_avg: number
  rating_count: number
  is_active: boolean
  is_verified: boolean
  created_by: string
  created_at: string
  contact_email?: string
}

// ─── Filtros de búsqueda ──────────────────────────────────────────────────
export interface InstitutionFilters {
  category?: string
  city?: string
  /** Búsqueda de texto libre sobre nombre, descripción, ciudad, estado */
  search?: string
  disability_type?: string
  /** Edad del usuario para filtrar por rango etario */
  age?: number
}

// ─── DTO de creación ──────────────────────────────────────────────────────
export interface CreateInstitutionData {
  name: string
  description?: string
  category: string
  city?: string
  state?: string
  phone?: string
  email?: string
  website?: string
  disability_types?: string[]
  age_min?: number
  age_max?: number
  contact_email?: string
}

// ─── Token de inyección ──────────────────────────────────────────────────
export const INSTITUTION_REPOSITORY = 'INSTITUTION_REPOSITORY'

// ─── Interfaz del repositorio ────────────────────────────────────────────
export interface IInstitutionRepository {
  /** Lista instituciones activas con filtros opcionales */
  findAll(filters?: InstitutionFilters): Promise<Institution[]>

  /** Busca una institución por su ID */
  findById(id: string): Promise<Institution | null>

  /** Batch lookup por IDs (útil para favoritos, reseñas, etc.) */
  findByIds(ids: string[]): Promise<Institution[]>

  /** Crea una nueva institución (queda pendiente de verificación) */
  create(data: CreateInstitutionData, userId: string): Promise<Institution>

  /** Actualiza campos de una institución */
  update(id: string, data: Partial<Institution>): Promise<void>

  /** Desactiva una institución (soft delete) */
  softDelete(id: string): Promise<void>

  /** Cuenta instituciones activas */
  countActive(): Promise<number>
}
