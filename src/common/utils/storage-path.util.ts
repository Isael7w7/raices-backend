/**
 * Extrae el path del archivo de una URL de Firebase Storage o fallback local.
 *
 * GCS:   https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?alt=media&token=...
 * Local: http://localhost:7000/uploads/{path}
 */
export function extractStoragePath(url: string): string | null {
  try {
    const gcsMatch = url.match(/\/o\/([^?]+)/)
    if (gcsMatch) return decodeURIComponent(gcsMatch[1])

    const localMatch = url.match(/\/uploads\/(.+)/)
    if (localMatch) return decodeURIComponent(localMatch[1])
  } catch {}
  return null
}
