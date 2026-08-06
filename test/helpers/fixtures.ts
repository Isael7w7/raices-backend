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
}

export async function sembrarPerfil(datos: any): Promise<void> {
  await dbE2E().collection('perfiles').doc(datos.id).set(datos)
}

export async function sembrarInstitucion(datos: any): Promise<void> {
  await dbE2E().collection('instituciones').doc(datos.id).set(datos)
}

export async function leerDoc(coleccion: string, id: string): Promise<any> {
  const snap = await dbE2E().collection(coleccion).doc(id).get()
  return snap.exists ? snap.data() : null
}

export function token(uid: string): string {
  return `Bearer ${uid}`
}
