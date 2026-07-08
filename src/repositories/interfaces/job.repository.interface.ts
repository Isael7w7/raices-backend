// ─── Vacante (dominio) ────────────────────────────────────────────────────
// Representa un documento de la colección Firestore 'p_jobs',
// con disability_types ya parseado de JSON string → string[].
export interface Job {
  id: string
  institution_id: string
  title: string
  description: string
  requirements: string
  modality: string
  schedule: string
  salary_range: string
  city: string
  state: string
  disability_inclusive: boolean
  /** Tipos de discapacidad a los que está dirigida (ya parseados) */
  disability_types: string[]
  is_active: boolean
  created_at: string
}

// ─── Postulación (dominio) ────────────────────────────────────────────────
export interface JobApplication {
  id: string
  job_id: string
  user_id: string
  cover_letter: string
  status: string
  created_at: string
}

// ─── Filtros de búsqueda ──────────────────────────────────────────────────
export interface JobFilters {
  city?: string
  modality?: string
  disability_type?: string
}

// ─── DTOs de creación ─────────────────────────────────────────────────────
export interface CreateJobData {
  institution_id: string
  title: string
  description?: string
  requirements?: string
  modality?: string
  schedule?: string
  salary_range?: string
  city?: string
  state?: string
  disability_inclusive?: boolean
  disability_types?: string[]
}

export interface CreateJobApplicationData {
  job_id: string
  user_id: string
  cover_letter: string
}

// ─── Tokens de inyección ──────────────────────────────────────────────────
export const JOB_REPOSITORY = 'JOB_REPOSITORY'

// ─── Interfaz del repositorio ────────────────────────────────────────────
export interface IJobRepository {
  // ── Vacantes ──────────────────────────────────────────────────────────

  /** Lista vacantes activas con filtros opcionales */
  findAll(filters?: JobFilters): Promise<Job[]>

  /** Busca una vacante por su ID */
  findById(id: string): Promise<Job | null>

  /** Batch lookup por IDs */
  findByIds(ids: string[]): Promise<Job[]>

  /** Crea una nueva vacante */
  create(data: CreateJobData): Promise<Job>

  /** Actualiza campos de una vacante */
  update(id: string, data: Partial<Job>): Promise<void>

  /** Desactiva una vacante (soft delete) */
  softDelete(id: string): Promise<void>

  /** Cuenta vacantes activas */
  countActive(): Promise<number>

  // ── Postulaciones ─────────────────────────────────────────────────────

  /** Crea una postulación */
  createApplication(data: CreateJobApplicationData): Promise<JobApplication>

  /** Postulaciones de un usuario, ordenadas por fecha descendente */
  findApplicationsByUser(userId: string): Promise<JobApplication[]>

  /** Busca una postulación específica (para evitar duplicados) */
  findApplicationByUserAndJob(userId: string, jobId: string): Promise<JobApplication | null>

  /** IDs de vacantes a las que un usuario ya se postuló */
  getAppliedJobIds(userId: string): Promise<string[]>
}
