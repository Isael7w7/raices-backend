/**
 * Interfaz para los registros de auditoría.
 * Cada entrada captura quién hizo qué, cuándo, sobre qué recurso y el resultado.
 */
export interface AuditLog {
  /** ID del documento Firestore (auto-generado) */
  id?: string

  /** Timestamp ISO 8601 de la acción */
  timestamp: string

  /** ID del usuario que realizó la acción */
  usuarioId: string

  /** Email del usuario (para consultas rápidas sin JOIN) */
  usuarioEmail?: string

  /** Rol del usuario al momento de la acción */
  usuarioRol?: string

  /** Acción realizada (ej: 'aprobar_institucion', 'eliminar_usuario') */
  accion: string

  /** Descripción legible de la acción */
  descripcion: string

  /** Tipo de recurso afectado (ej: 'institucion', 'usuario', 'resena', 'configuracion') */
  recurso: string

  /** ID del recurso afectado (si aplica) */
  recursoId?: string

  /** Nombre/título del recurso afectado (para consultas legibles) */
  recursoNombre?: string

  /** Estado del resultado: 'exito' | 'error' | 'denegado' */
  resultado: 'exito' | 'error' | 'denegado'

  /** Detalles adicionales (cambios aplicados, error message, etc.) */
  metadatos?: Record<string, any>

  /** IP del cliente (si está disponible) */
  ip?: string

  /** User-Agent del cliente */
  userAgent?: string
}

/**
 * Acciones predefinidas de auditoría para el módulo admin.
 */
export const AUDIT_ACCIONES = {
  // Instituciones
  APROBAR_INSTITUCION: 'aprobar_institucion',
  RECHAZAR_INSTITUCION: 'rechazar_institucion',
  TOGGLE_VERIFICACION: 'toggle_verificacion_institucion',

  // Usuarios
  TOGGLE_USUARIO_ACTIVO: 'toggle_usuario_activo',
  CAMBIAR_ROL_USUARIO: 'cambiar_rol_usuario',
  ELIMINAR_USUARIO: 'eliminar_usuario',

  // Reseñas
  ELIMINAR_RESENA: 'eliminar_resena',

  // Configuración
  ACTUALIZAR_CONFIGURACION: 'actualizar_configuracion',

  // Genérico
  ACCION_ADMIN: 'accion_admin',
} as const

export type AuditAccion = (typeof AUDIT_ACCIONES)[keyof typeof AUDIT_ACCIONES]
