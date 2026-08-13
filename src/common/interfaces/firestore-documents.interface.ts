import { FeatureFlags, FEATURES_POR_DEFECTO } from './feature-flags.interface'

/**
 * Documento canónico de la colección `dependientes`.
 * Puede representar un dependiente "plano" (sin cuenta) o una cuenta PCD vinculada.
 */
export interface DependienteDoc {
  id: string
  tutorId?: string | null
  nombreCompleto?: string
  parentesco?: string
  rol?: string
  datosPerfil?: string // JSON string con tiposDiscapacidad, rangoEdad, etapaVida, notas
  features?: FeatureFlags
  esCuentaVinculada?: boolean
  pcdUserId?: string | null
  fechaCreacion?: string
  fechaActualizacion?: string
}

/**
 * Formato de salida de un dependiente (después de formatear para el cliente).
 */
export interface DependienteFormateado {
  id: string
  nombreCompleto: string | undefined
  parentesco: string | null
  tiposDiscapacidad: string[]
  rangoEdad: string | null
  etapaVida: string | null
  notas: string
  discapacidad: string | null
  esCuentaVinculada: boolean
  pcdUserId: string | null
  features: FeatureFlags
  fotoUrl?: string | null
  fechaCreacion: string | undefined
}

/**
 * Documento de la colección `perfiles`.
 */
export interface PerfilDoc {
  id?: string
  nombreCompleto?: string
  email?: string
  rol?: string
  activo?: boolean
  verificado?: boolean
  urlAvatar?: string
  institucionId?: string
  tutorId?: string | null
  features?: FeatureFlags
  ciudad?: string
  estado?: string
  profesion?: string
  bio?: string
  // ── Campos Spec MVP Raíces ──
  destinatarioRegistro?: string
  curp?: string
  telefonoContacto?: string
  preferenciasAcompanamiento?: string
  estadoValidacionIdentidad?: string
  fechaNacimiento?: string
  domicilio?: string
  tonoContextual?: string
}

/**
 * Documento de la colección `instituciones`.
 */
export interface InstitucionDoc {
  id?: string
  nombre?: string
  emailContacto?: string
  categoria?: string
  descripcion?: string
  telefono?: string
  tiposDiscapacidad?: string[] | string
  creadoPor?: string
  usuarioId?: string
  activa?: boolean
  verificada?: boolean
  calificacionPromedio?: number
  cantidadCalificaciones?: number
  ciudad?: string
  estado?: string
  urlLogo?: string
  fechaCreacion?: string
}

/**
 * Documento de la colección `vacantes`.
 */
export interface VacanteDoc {
  id?: string
  institucionId?: string
  titulo?: string
  descripcion?: string
  requisitos?: string
  modalidad?: string
  horario?: string
  rangoSalario?: string
  ciudad?: string
  estado?: string
  inclusivaDiscapacidad?: boolean
  tiposDiscapacidad?: string[] | string
  activa?: boolean
  fechaCreacion?: string
  fechaActualizacion?: string
}

/**
 * Documento de la colección `postulaciones`.
 */
export interface PostulacionDoc {
  id?: string
  vacanteId?: string
  usuarioId?: string
  cartaPresentacion?: string
  mensaje?: string // Legacy field
  estado?: string
  fechaCreacion?: string
  fechaActualizacion?: string
}

/**
 * Perfil extendido de la colección `perfilesExtendidos`.
 */
export interface PerfilExtendidoDoc {
  id?: string
  usuarioId?: string
  tiposDiscapacidad?: string
  severidadDiscapacidad?: string
  modosComunicacion?: string
  necesidadesMovilidad?: string
  accesoTecnologia?: string
  zonasPreferidas?: string
  necesidades?: string
  metasActuales?: string
  areasApoyo?: string
  historialEducacion?: string
  historialTerapia?: string
  etapaVida?: string
  preocupacionesActuales?: string
  nivelApoyo?: string
  // ── Campos requeridos por Spec MVP Raíces ──
  escalasVida?: Record<string, number>
  tieneDiagnostico?: boolean
  requiereEvaluacion?: boolean
  temporalidadOrigen?: string
  preferenciaFormato?: string
  areasInteres?: string
  viabilidadEconomica?: string
  historialInstituciones?: string
  tonoContextual?: string
}

/**
 * Documento de la colección `publicaciones`.
 */
export interface PublicacionDoc {
  id?: string
  autorId?: string
  contenido?: string
  grupoId?: string | null
  mediaUrl?: string | null
  cantidadMeGustas?: number
  fechaCreacion?: string
  fechaActualizacion?: string
}

/**
 * Documento de la colección `comentarios`.
 */
export interface ComentarioDoc {
  id?: string
  publicacionId?: string
  autorId?: string
  contenido?: string
  fechaCreacion?: string
}

/**
 * Documento de la colección `grupos`.
 */
export interface GrupoDoc {
  id?: string
  nombre?: string
  descripcion?: string
  esPublico?: boolean
  creadorId?: string
  cantidadMiembros?: number
  fechaCreacion?: string
}

/**
 * Documento de la colección `mensajesDirectos`.
 */
export interface MensajeDoc {
  id?: string
  emisorId?: string
  receptorId?: string
  contenido?: string
  mediaUrl?: string | null
  leido?: boolean
  fechaCreacion?: string
}

/**
 * Documento de la colección `notificaciones`.
 */
export interface NotificacionDoc {
  id?: string
  usuarioId?: string
  tipo?: string
  titulo?: string
  mensaje?: string
  entidadId?: string | null
  leida?: boolean
  fechaCreacion?: string
}

/**
 * Documento de identidad (colección `documentosIdentidad`).
 */
export interface DocumentoIdentidadDoc {
  id?: string
  usuarioId?: string
  tipo?: 'curp' | 'identificacion_oficial'
  urlDocumento?: string
  numeroCurp?: string | null
  estado?: 'pendiente' | 'aprobado' | 'rechazado'
  motivoRechazo?: string | null
  fechaSubida?: string
  fechaRevision?: string | null
}

/** Default features constant for convenience */
export const DEFAULT_FEATURES: FeatureFlags = { ...FEATURES_POR_DEFECTO }
