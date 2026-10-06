import type { InstitucionDoc } from '../interfaces/firestore-documents.interface'

/**
 * Reglas de verificación para PERSONAS MORALES (instituciones y empresas).
 *
 * La CURP es un dato de personas FÍSICAS: no aplica a una persona moral. Por
 * eso el único documento exigible para operar es la Constancia de Situación
 * Fiscal (CSF), y el resto de la validación (aprobación del administrador)
 * sigue siendo un camino alternativo válido, no un requisito adicional.
 *
 * Regla: una entidad moral puede operar si tiene CSF cargada **o** si ya fue
 * aprobada por un administrador. Exigir ambos dejaba a toda cuenta nueva
 * bloqueada hasta la revisión manual, sin salida visible para el usuario.
 *
 * Estas funciones son la ÚNICA fuente de verdad: las usan tanto el
 * {@link InstitucionVerificadaGuard} como `JobsService.createJob`, para que el
 * mensaje de rechazo y el criterio de bloqueo nunca se desincronicen.
 */

/** Roles que representan una persona moral (empresa es subtipo de institución). */
export const ROLES_PERSONA_MORAL = ['institucion', 'institution', 'empresa'] as const

/**
 * Mensaje único de bloqueo para personas morales. NO menciona la CURP porque
 * no aplica a personas morales: exigirla era el error de negocio que
 * reportaba el frontend como motivo del 403.
 */
export const MENSAJE_CSF_REQUERIDO =
  'Tu cuenta requiere cargar la Constancia de Situación Fiscal (CSF) para publicar vacantes.'

/** ¿El rol corresponde a una persona moral (institución o empresa)? */
export function esPersonaMoral(rol: string | undefined | null): boolean {
  return !!rol && (ROLES_PERSONA_MORAL as readonly string[]).includes(rol)
}

/**
 * ¿La entidad tiene CSF cargada? Se acepta `documentoCsf` como string con
 * contenido (los espacios en blanco no cuentan) y se rechaza `null`/`''`.
 */
export function tieneCsf(institucion: Partial<InstitucionDoc> | null | undefined): boolean {
  const doc = institucion?.documentoCsf
  return typeof doc === 'string' && doc.trim().length > 0
}

/**
 * Criterio de bloqueo para publicar vacantes como persona moral:
 * CSF cargada **o** aprobación del administrador.
 *
 * @param institucion Documento de la entidad moral (puede ser `undefined` si
 *   la entidad aún no existe; en ese caso no cumple y se bloquea).
 */
export function puedeOperarComoPersonaMoral(institucion: Partial<InstitucionDoc> | null | undefined): boolean {
  if (!institucion) return false
  return institucion.verificada === true || tieneCsf(institucion)
}