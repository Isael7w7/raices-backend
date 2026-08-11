/**
 * Utilidades de cookies de sesión.
 *
 * El token de acceso viaja como cookie httpOnly (invisible para JavaScript),
 * lo que elimina el vector de robo de tokens por XSS que implica guardarlos
 * en localStorage. El FirebaseAuthGuard sigue aceptando el header
 * `Authorization: Bearer <token>` para mantener compatibilidad con clientes
 * existentes mientras migran al flujo de cookies.
 */

/** Cookie httpOnly que transporta el ID token de acceso (expira en ~1h). */
export const NOMBRE_COOKIE_ACCESO = 'token_acceso'

/** Cookie httpOnly que transporta el refresh token de Firebase (~30 días). */
export const NOMBRE_COOKIE_REFRESCO = 'token_refresco'

/**
 * Parseo manual del header `Cookie` (sin depender de cookie-parser).
 * Devuelve un mapa nombre → valor decodificado.
 */
export function parseCookies(cookieHeader?: string): Record<string, string> {
  const resultado: Record<string, string> = {}
  if (!cookieHeader) return resultado

  for (const parte of cookieHeader.split(';')) {
    const idx = parte.indexOf('=')
    if (idx === -1) continue

    const nombre = parte.slice(0, idx).trim()
    const valor = parte.slice(idx + 1).trim()
    if (!nombre) continue

    // Express codifica el valor con encodeURIComponent al usar res.cookie();
    // un JWT (base64url) casi no se ve afectado, pero se decodifica por robustez.
    try {
      resultado[nombre] = decodeURIComponent(valor)
    } catch {
      resultado[nombre] = valor
    }
  }

  return resultado
}
