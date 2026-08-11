import { SetMetadata } from '@nestjs/common'

export const AUDIT_KEY = 'audit_config'

/**
 * Configuración del decorator @Audit().
 */
export interface AuditConfig {
  /** Acción a registrar (ej: AUDIT_ACCIONES.APROBAR_INSTITUCION) */
  accion: string

  /** Tipo de recurso afectado (ej: 'institucion', 'usuario') */
  recurso: string

  /**
   * Función extraer metadatos del resultado.
   * Se ejecuta después del handler y recibe el valor de retorno.
   */
  extraerMetadatos?: (resultado: any) => Record<string, any>

  /**
   * Función para obtener el ID del recurso afectado.
   * Por defecto busca en el parámetro 'id'.
   */
  obtenerRecursoId?: (...args: any[]) => string | undefined

  /**
   * Función para obtener el nombre del recurso afectado.
   * Se ejecuta con el resultado del handler.
   */
  obtenerRecursoNombre?: (resultado: any) => string | undefined
}

/**
 * Decorador @Audit() — marca un método del controller para que sea
 * registrado automáticamente en la colección de auditoría.
 *
 * @example
 * ```ts
 * @Post('instituciones/:id/aprobar')
 * @Audit({
 *   accion: AUDIT_ACCIONES.APROBAR_INSTITUCION,
 *   recurso: 'institucion',
 *   obtenerRecursoId: (id) => id,
 *   obtenerRecursoNombre: (resultado) => resultado?.nombre,
 * })
 * async approve(@Param('id') id: string) {
 *   return this.svc.approveInstitution(id)
 * }
 * ```
 */
export const Audit = (config: AuditConfig) => SetMetadata(AUDIT_KEY, config)
