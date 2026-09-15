/**
 * Helpers de acceso a la "base de datos" en memoria y siembra de fixtures
 * para los specs E2E. La instancia es la expuesta en test/setup-e2e.ts.
 */

export function dbE2E(): any {
  return (globalThis as any).__E2E__.db
}

export function authE2E(): any {
  return (globalThis as any).__E2E__.auth
}

export function limpiarDb(): void {
  ;(globalThis as any).__E2E__.limpiar()
  // La validación automática por IA (ValidationService) se dispara en
  // background desde el registro y la subida de documentos. Para que los
  // specs existentes sigan siendo deterministas, cada spec arranca con la
  // validación IA DESHABILITADA; validacion-ia.e2e-spec.ts la habilita
  // explícitamente cuando prueba ese flujo.
  // La escritura del mock en memoria es síncrona, no hace falta await.
  void dbE2E().collection('configuraciones').doc('validacionIAHabilitada').set({ clave: 'validacionIAHabilitada', valor: 'false' })
}

export async function sembrarPerfil(datos: any): Promise<void> {
  await dbE2E().collection('perfiles').doc(datos.id).set(datos)
}

export async function sembrarInstitucion(datos: any): Promise<void> {
  await dbE2E().collection('instituciones').doc(datos.id).set(datos)
}

/** Siembra una interacción con id determinista para poder verificarla después */
export async function sembrarInteraccion(datos: any): Promise<void> {
  const id = datos.id ?? `inter-${datos.usuarioId}-${datos.tipo}-${datos.categoria}-${datos.createdAt}`
  await dbE2E().collection('interacciones').doc(id).set({ ...datos, id })
}

export async function leerDoc(coleccion: string, id: string): Promise<any> {
  const snap = await dbE2E().collection(coleccion).doc(id).get()
  return snap.exists ? snap.data() : null
}

export function token(uid: string): string {
  return `Bearer ${uid}`
}
