/**
 * Utilidades de búsqueda de texto compartidas por los endpoints que filtran
 * en memoria (Firestore no soporta ILIKE): normalizan el término y los campos
 * para comparar sin distinguir mayúsculas/minúsculas ni acentos/diéresis.
 */

/** Convierte un valor a minúsculas y sin acentos. Valores no-string → ''. */
export function normalizarBusqueda(valor: unknown): string {
  if (typeof valor !== 'string') return ''
  return valor
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}

/**
 * Coincidencia parcial: true si `termino` (ya normalizado o crudo) está
 * contenido en alguno de los `campos`. Término vacío → true (sin filtro).
 */
export function coincideBusqueda(termino: string, ...campos: (string | null | undefined)[]): boolean {
  const busqueda = normalizarBusqueda(termino)
  if (!busqueda) return true
  return campos.some(campo => normalizarBusqueda(campo).includes(busqueda))
}
