/**
 * Detección de tipo de archivo por magic bytes (firmas binarias) para el
 * upload de multimedia. Complementa la validación de mimetype declarado:
 * el mimetype que envía el cliente es fácil de falsear, pero las primeras
 * bytes del archivo no.
 */

/** Regex de tipos multimedia permitidos (mimetype declarado por el cliente) */
export const REGEX_TIPOS_MULTIMEDIA = /^image\/(jpeg|png|webp|gif|heic|heif)$|^video\/(mp4|webm|quicktime|x-msvideo)$/

/**
 * Brands de la caja 'ftyp' que identifican HEIC/HEIF (fotos de iPhone).
 * HEIC y HEIF comparten contenedor ISO BMFF con MP4; el brand distingue
 * si la imagen pertenece a la familia imagen (heic/mif1/...) o video (isom/qt).
 * Se incluyen también los brands de secuencia de imágenes (heim/heis/hevm/hevs,
 * usados por Live Photos). AVIF (avif/avis) queda fuera de forma intencional:
 * no se soporta como imagen, por lo que cae al fallback de video/mp4.
 */
const BRANDS_HEIC = ['heic', 'heix', 'mif1', 'msf1', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']

/**
 * Detecta el tipo real de un archivo a partir de sus primeras bytes.
 *
 * @param buffer Contenido del archivo
 * @returns Mime canónico detectado ('image/jpeg', 'video/mp4', etc.) o null
 *          si la firma no corresponde a ningún tipo permitido.
 */
export function detectarTipoMultimediaPorBytes(buffer: Buffer | undefined | null): string | null {
  if (!buffer || buffer.length < 3) return null

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'

  // GIF: 'GIF87a' o 'GIF89a'
  const gif = buffer.subarray(0, 6).toString('ascii')
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif'

  // Contenedores RIFF: WebP (RIFF....WEBP) y AVI (RIFF....AVI )
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF') {
    const riffTipo = buffer.subarray(8, 12).toString('ascii')
    if (riffTipo === 'WEBP') return 'image/webp'
    if (riffTipo === 'AVI ') return 'video/x-msvideo'
    return null
  }

  // WebM / Matroska: cabecera EBML 1A 45 DF A3
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return 'video/webm'

  // Contenedor ISO BMFF (MP4 / QuickTime / HEIC / HEIF): primera caja con
  // brand 'ftyp' en el offset 4. El brand en offset 8-12 decide la familia:
  // los brands HEIC/HEIF son imágenes; el resto (isom, qt, mp41...) video.
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii')
    if (BRANDS_HEIC.includes(brand)) return 'image/heic'
    return 'video/mp4'
  }

  return null
}
