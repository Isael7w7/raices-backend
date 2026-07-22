/**
 * Helpers reutilizables para interactuar con Firestore de forma segura.
 */

/**
 * Parsea un valor que puede venir como array nativo de Firestore,
 * como string JSON serializado, o como cualquier otro tipo.
 * Siempre retorna un string[] válido.
 */
export function parsearTiposDiscapacidad(valor: any): string[] {
  if (!valor) return []
  if (Array.isArray(valor)) return valor
  if (typeof valor === 'string') {
    try {
      const parsed = JSON.parse(valor)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

/**
 * Parsea un campo JSON genérico que puede venir como string o como valor nativo.
 * Si viene como string válido, retorna el objeto parseado.
 * Si no, retorna el valor tal cual.
 */
export function parsearCampoJson(valor: any): any {
  if (typeof valor === 'string') {
    try { return JSON.parse(valor) }
    catch { return valor }
  }
  return valor
}

/**
 * Parsea un objeto JSON embebido (como datosPerfil).
 * Retorna un objeto vacío si falla el parseo.
 */
export function parsearObjeto(valor: any): Record<string, any> {
  if (!valor) return {}
  try {
    const p = JSON.parse(valor)
    return p && typeof p === 'object' ? p : {}
  } catch {
    return {}
  }
}
