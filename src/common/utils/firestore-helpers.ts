import { Firestore, FieldPath } from 'firebase-admin/firestore'
import { FEATURES_POR_DEFECTO } from '../interfaces/feature-flags.interface'

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
 * Obtiene documentos por un campo con valor `in` (lotes de 30).
 * Retorna un Map con el valor del campo como clave y el documento como valor
 * (si hay varios docs con el mismo valor, se conserva el primero).
 *
 * @param db        Instancia de Firestore
 * @param coleccion Nombre de la colección
 * @param campo     Campo sobre el que se filtra (ej. 'usuarioId')
 * @param valores   Valores a buscar
 */
export async function obtenerDocumentosPorCampo(
  db: Firestore,
  coleccion: string,
  campo: string,
  valores: string[],
): Promise<Map<string, Record<string, any>>> {
  const mapa = new Map<string, Record<string, any>>()
  if (valores.length === 0) return mapa

  for (let i = 0; i < valores.length; i += BATCH_LIMIT) {
    const lote = valores.slice(i, i + BATCH_LIMIT)
    const snap = await db.collection(coleccion)
      .where(campo, 'in', lote)
      .get()
    snap.docs.forEach(doc => {
      const datos = doc.data()
      const clave = datos[campo] as string | undefined
      if (clave && !mapa.has(clave)) mapa.set(clave, datos)
    })
  }

  return mapa
}

/**
 * Registra la relación tutor ↔ PCD en 'dependientes' evitando duplicados:
 *
 * 1. Si ya existe el registro canónico (doc id = pcdUserId), solo se actualiza.
 * 2. Si el tutor ya tiene un dependiente plano con el mismo nombre, se
 *    promociona ese documento (se le asignan pcdUserId y esCuentaVinculada).
 * 3. En caso contrario, se crea el registro canónico.
 *
 * @returns 'ya_vinculado' | 'promovido' | 'creado'
 */
export async function registrarDependienteVinculado(
  db: Firestore,
  coleccion: string,
  tutorId: string,
  pcdUserId: string,
  nombreCompleto?: string,
): Promise<'ya_vinculado' | 'promovido' | 'creado'> {
  const nombre = nombreCompleto ?? 'Sin nombre'
  const col = db.collection(coleccion)

  // Idempotencia: si ya existe el registro canónico, solo mantenerlo actualizado
  const canonico = await col.doc(pcdUserId).get()
  if (canonico.exists) {
    await canonico.ref.update({
      tutorId,
      pcdUserId,
      esCuentaVinculada: true,
      rol: 'pcd',
      nombreCompleto: nombre,
    })
    return 'ya_vinculado'
  }

  // Promoción: si el tutor ya tenía un dependiente plano con ese nombre,
  // promocionarlo en lugar de crear un documento duplicado
  const previos = await col
    .where('tutorId', '==', tutorId)
    .where('nombreCompleto', '==', nombre)
    .limit(1)
    .get()
  if (!previos.empty) {
    const previo = previos.docs[0]
    await previo.ref.update({
      pcdUserId,
      esCuentaVinculada: true,
      rol: 'pcd',
      nombreCompleto: nombre,
    })
    return 'promovido'
  }

  // Nuevo registro canónico (esquema unificado: features inicializados por defecto;
  // para cuentas vinculadas la fuente de verdad de features es perfiles/{pcdUid})
  await col.doc(pcdUserId).set({
    id: pcdUserId,
    tutorId,
    pcdUserId,
    esCuentaVinculada: true,
    rol: 'pcd',
    nombreCompleto: nombre,
    parentesco: null,
    datosPerfil: '{}',
    features: { ...FEATURES_POR_DEFECTO },
    fechaCreacion: new Date().toISOString(),
  })
  return 'creado'
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
