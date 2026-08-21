/**
 * Validador de CURP (Clave Única de Registro de Población) mexicana.
 *
 * Formato oficial (18 caracteres):
 * - Posiciones 1-4: Iniciales del nombre (H para hombrE, M para Mujer)
 * - Posiciones 5-10: Fecha de nacimiento (AAMMDD)
 * - Posiciones 11-13: Entidad federativa de nacimiento (2 letras + H/M)
 * - Posiciones 14-16: Iniciales de las primeras consonantes del nombre y paterno
 * - Posición 17: Primera vocal interna del apellido paterno
 * - Posición 18: Diferenciador (número o letra)
 *
 * Referencia: http://www.gob.mx/curp/
 */

// Expresión regular oficial de la CURP
const CURP_REGEX = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/i

// Entidades federativas válidas (posiciones 12-13)
const ENTIDADES_FEDERATIVAS = new Set([
  'AS', 'BC', 'BS', 'CC', 'CS', 'CH', 'CL', 'CM', 'DF', 'DG',
  'GT', 'HG', 'JC', 'MC', 'MN', 'MS', 'NT', 'NL', 'OC', 'PL',
  'QT', 'QR', 'SP', 'SL', 'SR', 'TC', 'TS', 'TL', 'VZ', 'YN', 'ZS',
])

/**
 * Valida si una cadena tiene el formato válido de CURP mexicana.
 * @param curp - Cadena a validar (se convierte a mayúsculas automáticamente)
 * @returns true si la CURP es válida, false en caso contrario
 */
export function esCurpValida(curp: string): boolean {
  if (!curp || typeof curp !== 'string') return false

  const curpUpper = curp.toUpperCase().trim()

  // Debe tener exactamente 18 caracteres
  if (curpUpper.length !== 18) return false

  // Debe coincidir con la regex oficial
  if (!CURP_REGEX.test(curpUpper)) return false

  // Validar que la posición 11 sea H (hombre) o M (mujer)
  const sexo = curpUpper[10]
  if (sexo !== 'H' && sexo !== 'M') return false

  // Validar que la entidad federativa (posiciones 12-13) sea válida
  const entidad = curpUpper.substring(11, 13)
  if (!ENTIDADES_FEDERATIVAS.has(entidad)) return false

  return true
}

/**
 * Valida si una CURP tiene el formato correcto y retorna errores descriptivos.
 * @param curp - Cadena a validar
 * @returns null si es válida, o un string con el mensaje de error
 */
export function validarCurp(curp: string): string | null {
  if (!curp || typeof curp !== 'string') {
    return 'La CURP es requerida'
  }

  const curpUpper = curp.toUpperCase().trim()

  if (curpUpper.length !== 18) {
    return `La CURP debe tener exactamente 18 caracteres (actual: ${curpUpper.length})`
  }

  if (!CURP_REGEX.test(curpUpper)) {
    return 'La CURP no tiene un formato válido. Debe contener solo letras y números en el formato oficial'
  }

  const sexo = curpUpper[10]
  if (sexo !== 'H' && sexo !== 'M') {
    return 'La posición 11 (sexo) debe ser H (hombre) o M (mujer)'
  }

  const entidad = curpUpper.substring(11, 13)
  if (!ENTIDADES_FEDERATIVAS.has(entidad)) {
    return `La entidad federativa "${entidad}" no es válida`
  }

  return null
}
