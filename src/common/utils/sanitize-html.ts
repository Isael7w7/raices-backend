/**
 * Escapa caracteres HTML especiales para prevenir ataques XSS.
 *
 * Convierte:
 *   < → &lt;
 *   > → &gt;
 *   & → &amp;
 *   " → &quot;
 *   ' → &#x27;
 *   / → &#x2F;
 *
 * NOTA: Esta función es para sanitización de salida en campos de texto plano.
 * Si necesitas renderizar HTML seguro, usa una librería como DOMPurify.
 */
export function sanitizeHtml(value: string): string {
  if (typeof value !== 'string') return value

  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

/**
 * Sanitiza recursivamente todos los strings en un objeto.
 * Útil para sanitizar objetos complejos como el historial de chat.
 */
export function sanitizeObject<T>(obj: T): T {
  if (typeof obj === 'string') return sanitizeHtml(obj) as T
  if (Array.isArray(obj)) return obj.map(sanitizeObject) as T
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeObject(value)
    }
    return result as T
  }
  return obj
}
