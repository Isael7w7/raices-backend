import { Firestore, FieldPath } from 'firebase-admin/firestore'

/**
 * Helpers reutilizables para interactuar con Firestore de forma segura.
 */

/**
 * Límite máximo de IDs por consulta Firestore `in` (Firestore limita a 30).
 */
const BATCH_LIMIT = 30

/**
 * Obtiene documentos por sus IDs usando consultas `in` en lotes de 30.
 * Retorna un Map<string, Record<string, any>> con el ID como clave y el documento como valor.
 *
 * @param db        Instancia de Firestore
n * @param coleccion Nombre de la colección
 * @param ids       Array de IDs a buscar
 * @returns Map con ID → datos del documento
 */
export async function obtenerDocumentosPorIds(
  db: Firestore,
  coleccion: string,
  ids: string[],
): Promise<Map<string, Record<string, any>>> {
  const mapa = new Map<string, Record<string, any>>()
  if (ids.length === 0) return mapa

  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const lote = ids.slice(i, i + BATCH_LIMIT)
    const snap = await db.collection(coleccion)
      .where(FieldPath.documentId(), 'in', lote)
      .get()
    snap.docs.forEach(doc => mapa.set(doc.id, doc.data()))
  }

  return mapa
}

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
