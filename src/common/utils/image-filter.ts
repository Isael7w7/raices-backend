/**
 * FileFilter para Multer que acepta solo imágenes (JPEG, PNG, WebP, GIF).
 * Se usa en FileInterceptor para rechazar archivos inválidos antes de
 * que se carguen completamente en memoria.
 *
 * @example
 * ```ts
 * @UseInterceptors(FileInterceptor('avatar', {
 *   limits: { fileSize: 5 * 1024 * 1024 },
 *   fileFilter: imageFileFilter,
 * }))
 * ```
 */
export function imageFileFilter(
  req: any,
  file: { fieldname: string; originalname: string; encoding: string; mimetype: string; size: number; destination: string; filename: string; path: string; buffer: Buffer },
  callback: (error: Error | null, acceptFile: boolean) => void,
): void {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

  if (allowedMimes.includes(file.mimetype)) {
    callback(null, true)
  } else {
    callback(
      new Error(
        `Tipo de archivo no permitido: "${file.mimetype}". Solo se aceptan imágenes (JPEG, PNG, WebP, GIF).`,
      ),
      false,
    )
  }
}

/**
 * FileFilter para Multer que acepta imágenes y videos multimedia.
 * Se usa en el endpoint de multimedia general.
 *
 * @example
 * ```ts
 * @UseInterceptors(FileInterceptor('archivo', {
 *   limits: { fileSize: 10 * 1024 * 1024 },
 *   fileFilter: multimediaFileFilter,
 * }))
 * ```
 */
const MULTIMEDIA_MIMES = [
  // Imágenes
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  // Videos
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
]

export function multimediaFileFilter(
  req: any,
  file: { fieldname: string; originalname: string; encoding: string; mimetype: string; size: number; destination: string; filename: string; path: string; buffer: Buffer },
  callback: (error: Error | null, acceptFile: boolean) => void,
): void {
  if (MULTIMEDIA_MIMES.includes(file.mimetype)) {
    callback(null, true)
  } else {
    callback(
      new Error(
        `Tipo de archivo no permitido: "${file.mimetype}". Solo se aceptan imágenes o videos.`,
      ),
      false,
    )
  }
}
