/**
 * Orígenes permitidos para CORS y validación CSRF.
 *
 * Se centralizan aquí para que main.ts (CORS) y FirebaseAuthGuard
 * (defensa CSRF sobre peticiones autenticadas por cookie) usen la misma
 * lista, evitando divergencias.
 */

const ORIGENES_BASE = [
  // Swagger UI (mismo servidor)
  'http://localhost:7000',
  'https://localhost:7000',
  // Frontend dev server (Vite)
  'http://localhost:3000',
  'http://localhost:5173',
  // Frontend producción
  'https://raices.techmaleon.com.mx',
  'http://raices.techmaleon.com.mx',
]

/** Devuelve la lista de orígenes permitidos (base + CORS_ORIGINS). */
export function obtenerOrigenesPermitidos(config: { get(key: string): string | undefined }): string[] {
  const extra = (config.get('CORS_ORIGINS') ?? '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
  return [...ORIGENES_BASE, ...extra]
}

/**
 * Verifica si un header `Origin` es aceptable.
 * - Sin Origin (curl, Postman, server-to-server) → permitido.
 * - En la lista de orígenes → permitido.
 * - Cualquier dominio Cloud Run (*.run.app, exclusivo de GCP) → permitido.
 */
export function esOrigenPermitido(origin: string | undefined, permitidos: string[]): boolean {
  if (!origin) return true
  if (permitidos.includes(origin)) return true
  return /^https?:\/\/.+\..+\.run\.app$/.test(origin)
}
