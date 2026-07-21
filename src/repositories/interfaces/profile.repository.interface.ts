// ─── Perfil de usuario (u_profiles) ──────────────────────────────────────
export interface UserProfile {
  id: string
  email: string
  full_name: string
  role: string
  city: string
  state: string
  avatar_url: string | null
  is_active: boolean
  is_verified: boolean
  created_at: string
}

// ─── Perfil extendido de necesidades (u_user_profiles) ──────────────────
// Todos los campos array se almacenan como JSON string en Firestore
// y se parsean al leer.
export interface UserProfiling {
  id: string
  user_id: string
  disability_types: string[]
  disability_severity: string | null
  communication_modes: string[]
  mobility_needs: string[]
  tech_access: string[]
  preferred_zones: string[]
  needs: string[]
  current_goals: string[]
  support_areas: string[]
  education_history: string[]
  therapy_history: string[]
  life_stage: string | null
  current_concerns: string | null
  support_level: string | null
}

// ─── DTOs ────────────────────────────────────────────────────────────────
export interface CreateUserProfileData {
  id: string
  email: string
  full_name: string
  role: string
  city?: string
  state?: string
}

export interface UpdateUserProfileData {
  full_name?: string
  city?: string
  state?: string
  avatar_url?: string | null
}

export interface UpsertProfilingData {
  disability_types?: string[]
  disability_severity?: string
  communication_modes?: string[]
  mobility_needs?: string[]
  tech_access?: string[]
  preferred_zones?: string[]
  needs?: string[]
  current_goals?: string[]
  support_areas?: string[]
  education_history?: string[]
  therapy_history?: string[]
  life_stage?: string
  current_concerns?: string
  support_level?: string
}

// ─── Token de inyección ──────────────────────────────────────────────────
export const PROFILE_REPOSITORY = 'PROFILE_REPOSITORY'

// ─── Interfaz del repositorio ────────────────────────────────────────────
export interface IProfileRepository {
  // ── Perfiles de usuario (u_profiles) ──

  /** Busca un perfil por ID */
  findById(id: string): Promise<UserProfile | null>

  /** Busca un perfil por email */
  findByEmail(email: string): Promise<UserProfile | null>

  /** Crea un nuevo perfil de usuario */
  create(data: CreateUserProfileData): Promise<UserProfile>

  /** Actualiza campos del perfil (nombre, ciudad, avatar, etc.) */
  update(id: string, data: UpdateUserProfileData): Promise<void>

  /** Actualiza campos arbitrarios (is_active, role, etc. — admin) */
  updateFields(id: string, fields: Record<string, any>): Promise<void>

  /** Desactiva un perfil (soft delete) */
  softDelete(id: string): Promise<void>

  /** Verifica si un email ya está registrado */
  existsByEmail(email: string): Promise<boolean>

  /** Lista todos los perfiles (admin) */
  findAll(orderByField?: string): Promise<UserProfile[]>

  /** Cuenta perfiles activos */
  countActive(): Promise<number>

  /** Cuenta total de perfiles */
  countAll(): Promise<number>

  /** Busca perfiles por rol */
  findByRole(role: string): Promise<UserProfile[]>

  // ── Perfiles extendidos de necesidades (u_user_profiles) ──

  /** Busca el perfil extendido de un usuario */
  findProfilingByUserId(userId: string): Promise<UserProfiling | null>

  /** Crea o actualiza el perfil extendido */
  upsertProfiling(userId: string, data: UpsertProfilingData): Promise<UserProfiling>

  /** Cuenta cuántos usuarios tienen perfil extendido */
  countProfiling(): Promise<number>

  /** Obtiene todos los perfiles extendidos (para analytics) */
  findAllProfiling(): Promise<UserProfiling[]>
}
