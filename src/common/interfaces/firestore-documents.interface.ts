import { FeatureFlags, FEATURES_POR_DEFECTO, PermisosDependiente } from './feature-flags.interface'

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
  /** Permisos del tutor (modal "Permisos de acceso"): módulos y acciones */
  permisos?: Partial<PermisosDependiente>
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
  /** Permisos del tutor (modal "Permisos de acceso") para cuentas PCD vinculadas */
  permisos?: Partial<PermisosDependiente>
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
  certificadoDiscapacidad?: boolean
  estadoAcreditacionTutor?: string
  fechaNacimiento?: string
  domicilio?: string
  tonoContextual?: string
  // ── Cierre del onboarding (consolidación) ──
  /** `true` cuando el usuario confirmó el cierre del formulario. */
  onboardingCompleto?: boolean
  /** Avance consolidado: 100 al cerrar el formulario. */
  porcentajeProgreso?: number
  /** ISO 8601 del cierre confirmado del onboarding. */
  fechaOnboardingCompletado?: string
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
  servicios?: string[] | string
  tiposDiscapacidad?: string[] | string
  creadoPor?: string
  usuarioId?: string
  activa?: boolean
  verificada?: boolean
  /**
   * Constancia de Situación Fiscal (CSF) de la persona moral: URL del
   * documento. Es el requisito INDISPENSABLE de verificación para cuentas
   * institucionales/empresariales (la CURP no aplica a personas morales).
   */
  documentoCsf?: string | null
  /** Fecha de subida/actualización de la CSF */
  fechaDocumentoCsf?: string
  calificacionPromedio?: number
  cantidadCalificaciones?: number
  ciudad?: string
  estado?: string
  urlLogo?: string
  fechaCreacion?: string
  /**
   * Subtipo de la entidad: `'empresa'` cuando la cuenta se registró con rol
   * 'empresa' (misma colección que las instituciones, pero se oculta de las
   * vistas de directorio/descubrimiento/recomendaciones). Ausente en
   * instituciones y documentos legados.
   */
  tipo?: string
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
  condiciones?: string
  /** Observaciones libres del formulario de onboarding (campo opcional). */
  observacionesGenerales?: string
  // ── Cierre del onboarding (consolidación) ──
  onboardingCompleto?: boolean
  porcentajeProgreso?: number
}

/**
 * Borrador del formulario de onboarding (colección `borradoresOnboarding`).
 * Documento único por usuario/tutor: guarda solo las respuestas enviadas
 * (guardado parcial) más el progreso recalculado en cada guardado.
 */
export interface BorradorOnboardingDoc {
  id?: string
  usuarioId?: string
  // ── Respuestas del formulario (todas opcionales: payloads parciales) ──
  observacionesGenerales?: string
  fechaNacimiento?: string
  curp?: string
  ciudad?: string
  tiposDiscapacidad?: string[]
  necesidades?: string[]
  metasActuales?: string[]
  escalasVida?: Record<string, number>
  preferenciasAcompanamiento?: string
  tonoContextual?: string
  areasInteres?: string[]
  historialEducacion?: string[]
  etapaVida?: string
  historialTerapia?: string[]
  tieneDiagnostico?: boolean
  // ── Progreso recalculado en cada guardado ──
  porcentajeProgreso?: number
  ultimoPasoCompletado?: number
  onboardingCompleto?: boolean
  pasosPendientes?: string[]
  /** Secciones pendientes con etiqueta amigable (contrato de la UI). */
  seccionesFaltantes?: { clave: string; etiqueta: string; camposFaltantes: string[] }[]
  /** `true` cuando el borrador ya fue promovido a `perfilesExtendidos`. */
  consolidado?: boolean
  fechaConsolidacion?: string
  fechaCreacion?: string
  fechaActualizacion?: string
}

/**
 * Documento de la colección `foros` (foros institucionales tipo Classroom).
 */
export interface ForoDoc {
  id?: string
  titulo?: string
  descripcion?: string
  institucionId?: string
  creadorId?: string
  preguntasDetonantes?: string[]
  exclusivoPadres?: boolean
  activo?: boolean
  fechaCreacion?: string
}

/**
 * Documento de la colección `respuestasForo` (respuestas a preguntas detonantes).
 */
export interface RespuestaForoDoc {
  id?: string
  foroId?: string
  preguntaIndex?: number
  autorId?: string
  contenido?: string
  fechaCreacion?: string
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
  categoriaCreativa?: string | null
  exclusivoPadres?: boolean
  cantidadMeGustas?: number
  fechaCreacion?: string
  fechaActualizacion?: string
  /** Adjuntos visuales (imágenes / dibujos / banners). Pueden venir vacíos. */
  imagenes?: (string | null)[]
  /** Adjuntos multimedia mixtos (imágenes y videos). Pueden venir vacíos. */
  multimedia?: (string | null)[]
  /** Adjuntos de archivo: pueden contener documentos no gráficos (PDF, TXT...). */
  archivos?: (string | null)[]
  /** Miniatura dedicada del feed (si el cliente la generó/alimentó). */
  urlThumbnail?: string | null
  /** Alias alternativo de miniatura usado por clientes antiguos. */
  thumbnailUrl?: string | null
}

/** Categorías permitidas para los eventos de la comunidad. */
export const CATEGORIAS_EVENTO = ['taller', 'deporte', 'cultural', 'encuentro', 'voluntariado', 'otro'] as const

export type CategoriaEvento = (typeof CATEGORIAS_EVENTO)[number]

/**
 * Documento de la colección `eventos` (sección "Eventos" de la comunidad).
 */
export interface EventoDoc {
  id?: string
  creadorId?: string
  titulo?: string
  descripcion?: string | null
  categoria?: CategoriaEvento | string
  /** ISO 8601 (acecha fecha simple `YYYY-MM-DD`). */
  fechaInicio?: string
  fechaFin?: string | null
  ubicacion?: string | null
  urlImagen?: string | null
  cantidadAsistentes?: number
  activo?: boolean
  fechaCreacion?: string
}

/**
 * Documento de la colección `asistenciasEvento` (participación de un usuario
 * en un evento). ID determinista `eventoId_usuarioId`.
 */
export interface AsistenciaEventoDoc {
  id?: string
  eventoId?: string
  usuarioId?: string
  fechaCreacion?: string
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
  exclusivoPadres?: boolean
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
 * Documento de la colección `especialistas`.
 */
export interface EspecialistaDoc {
  id?: string
  nombre?: string
  especialidad?: string
  tiposDiscapacidad?: string[] | string
  edadMinima?: number | null
  edadMaxima?: number | null
  ciudad?: string
  estado?: string
  modalidad?: string
  urlFoto?: string | null
  descripcion?: string
  calificacionPromedio?: number
  cantidadCalificaciones?: number
  activo?: boolean
  fechaCreacion?: string
}

/**
 * Documento de la colección `interacciones`.
 * Registra eventos de comportamiento del usuario con instituciones
 * (guardar, ver detalle, click en tarjeta) para calcular pesos de
 * recomendación por categoría.
 */
export interface InteraccionDoc {
  id?: string
  usuarioId?: string
  institucionId?: string
  tipo?: 'guardar' | 'ver_detalle' | 'click_card'
  categoria?: string | null
  createdAt?: string // ISO string
}

/**
 * Documento de identidad (colección `documentosIdentidad`).
 */
export interface DocumentoIdentidadDoc {
  id?: string
  usuarioId?: string
  tipo?: 'curp' | 'identificacion_oficial' | 'certificado_discapacidad'
  urlDocumento?: string
  numeroCurp?: string | null
  estado?: 'pendiente' | 'aprobado' | 'rechazado'
  motivoRechazo?: string | null
  fechaSubida?: string
  fechaRevision?: string | null
}

/**
 * Resumen de institución para listados admin.
 * Útil como referencia de tipo para sort/map callbacks en admin.service.
 */
export interface InstitucionResumen {
  id?: string
  nombre?: string
  categoria?: string
  ciudad?: string
  activa?: boolean
  verificada?: boolean
  calificacionPromedio?: number
  cantidadCalificaciones?: number
  fechaCreacion?: string
  usuarioId?: string
  creadoPor?: string
  tiposDiscapacidad?: string[] | string
}

/**
 * Alerta de riesgo para el panel admin.
 */
export interface AlertaRiesgo {
  id?: string
  severidad: 'critica' | 'media' | 'info'
  tipo: string
  titulo: string
  descripcion: string
  accion?: string
  tipoEntidad: string
  idEntidad?: string
}

/**
 * Resena con datos enriquecidos para moderación admin.
 */
export interface ResenaAdmin {
  id?: string
  calificacion?: number
  comentario?: string
  fechaCreacion?: string
  usuarioId?: string
  institucionId?: string
  nombreUsuario?: string | null
  emailUsuario?: string | null
  nombreInstitucion?: string | null
}

/**
 * Documento de usuario para listados admin.
 */
export interface UsuarioAdmin {
  id?: string
  email?: string
  nombreCompleto?: string
  rol?: string
  ciudad?: string
  activo?: boolean
  verificado?: boolean
  fechaCreacion?: string
}

/** Default features constant for convenience */
export const DEFAULT_FEATURES: FeatureFlags = { ...FEATURES_POR_DEFECTO }
