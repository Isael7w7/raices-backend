import { Firestore, FieldPath } from 'firebase-admin/firestore'
import { FEATURES_POR_DEFECTO } from '../interfaces/feature-flags.interface'

/**
 * Helpers reutilizables para interactuar con Firestore de forma segura.
 * Firestore es dinámico por naturaleza (DocumentData), así que las funciones
 * de parseo aceptan `unknown` y retornan tipos concretos ya verificados.
 */

/**
 * Límite máximo de IDs por consulta Firestore `in` (Firestore limita a 30).
 */
const BATCH_LIMIT = 30

/**
 * Obtiene documentos por sus IDs usando consultas `in` en lotes de 30.
 * Retorna un Map con el ID como clave y el documento tipado como valor.
 *
 * @example
 * const mapa = await obtenerDocumentosPorIds<PerfilDoc>(db, 'perfiles', ids)
 *
 * @param db        Instancia de Firestore
 * @param coleccion Nombre de la colección
 * @param ids       Array de IDs a buscar
 * @returns Map con ID → documento tipado
 */
export async function obtenerDocumentosPorIds<T = Record<string, unknown>>(
  db: Firestore,
  coleccion: string,
  ids: string[],
): Promise<Map<string, T>> {
  const mapa = new Map<string, T>()
  if (ids.length === 0) return mapa

  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const lote = ids.slice(i, i + BATCH_LIMIT)
    const snap = await db.collection(coleccion)
      .where(FieldPath.documentId(), 'in', lote)
      .get()
    snap.docs.forEach(doc => mapa.set(doc.id, doc.data() as T))
  }

  return mapa
}

/**
 * Obtiene documentos por un campo con valor `in` (lotes de 30).
 * Retorna un Map con el valor del campo como clave y el documento tipado como
 * valor (si hay varios docs con el mismo valor, se conserva el primero).
 *
 * @example
 * const mapa = await obtenerDocumentosPorCampo<PerfilExtendidoDoc>(db, 'perfilesExtendidos', 'usuarioId', ids)
 *
 * @param db        Instancia de Firestore
 * @param coleccion Nombre de la colección
 * @param campo     Campo sobre el que se filtra (ej. 'usuarioId')
 * @param valores   Valores a buscar
 */
export async function obtenerDocumentosPorCampo<T = Record<string, unknown>>(
  db: Firestore,
  coleccion: string,
  campo: string,
  valores: string[],
): Promise<Map<string, T>> {
  const mapa = new Map<string, T>()
  if (valores.length === 0) return mapa

  for (let i = 0; i < valores.length; i += BATCH_LIMIT) {
    const lote = valores.slice(i, i + BATCH_LIMIT)
    const snap = await db.collection(coleccion)
      .where(campo, 'in', lote)
      .get()
    snap.docs.forEach(doc => {
      const datos = doc.data() as T
      const clave = (datos as Record<string, unknown>)[campo]
      if (typeof clave === 'string' && !mapa.has(clave)) mapa.set(clave, datos)
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

/** Extrae los strings válidos de un array desconocido. */
function filtrarStrings(valor: unknown[]): string[] {
  return valor.filter((v): v is string => typeof v === 'string')
}

/**
 * Parsea un valor que puede venir como array nativo de Firestore,
 * como string JSON serializado, o como cualquier otro tipo.
 * Siempre retorna un string[] válido (solo elementos string).
 */
export function parsearTiposDiscapacidad(valor: unknown): string[] {
  if (!valor) return []
  if (Array.isArray(valor)) return filtrarStrings(valor)
  if (typeof valor === 'string') {
    try {
      const parsed: unknown = JSON.parse(valor)
      return Array.isArray(parsed) ? filtrarStrings(parsed) : []
    } catch {
      return []
    }
  }
  return []
}

/**
 * Parsea un campo JSON genérico que puede venir como string o como valor nativo.
 * Si viene como string válido, retorna el objeto parseado; si no, retorna el
 * valor tal cual. Retorna `unknown`: el consumidor debe verificar el tipo.
 *
 * @example
 * const parsed: unknown = parsearCampoJson(valor)
 * if (Array.isArray(parsed)) { ... }
 */
export function parsearCampoJson(valor: unknown): unknown {
  if (typeof valor === 'string') {
    try { return JSON.parse(valor) as unknown }
    catch { return valor }
  }
  return valor
}

/**
 * Parsea un objeto JSON embebido (como datosPerfil). Acepta string JSON u
 * objeto nativo. Siempre retorna un Record; {} si el valor no es un objeto.
 */
export function parsearObjeto(valor: unknown): Record<string, unknown> {
  if (!valor) return {}
  if (typeof valor === 'object' && !Array.isArray(valor)) {
    return valor as Record<string, unknown>
  }
  if (typeof valor === 'string') {
    try {
      const parsed: unknown = JSON.parse(valor)
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }
  return {}
}
