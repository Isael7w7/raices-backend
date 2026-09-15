import { FileValidator } from '@nestjs/common'
import { REGEX_TIPOS_MULTIMEDIA, detectarTipoMultimediaPorBytes } from '../utils/magic-bytes'

/**
 * Valida un archivo multimedia combinando dos fuentes de verdad:
 *
 * 1. El mimetype declarado por el cliente debe estar dentro de los tipos
 *    permitidos (JPEG, PNG, WebP, GIF, MP4, WebM, AVI/QuickTime).
 * 2. Las magic bytes reales del archivo deben corresponder a uno de esos
 *    tipos y pertenecer a la misma familia (imagen/video) que el declarado.
 *
 * Esto impide subir contenido arbitrario (HTML, ejecutables, scripts) con
 * un mimetype falseado. QuickTime y MP4 comparten la misma caja 'ftyp',
 * por lo que se permiten ambos nombres dentro de la familia video.
 */
export class MultimediaMagicBytesValidator extends FileValidator {
  constructor() {
    super({})
  }

  isValid(file?: Express.Multer.File): boolean {
    if (!file) return false
    if (!REGEX_TIPOS_MULTIMEDIA.test(file.mimetype)) return false

    const detectado = detectarTipoMultimediaPorBytes(file.buffer)
    if (!detectado) return false

    const familia = (mime: string) => mime.split('/')[0]
    if (familia(file.mimetype) !== familia(detectado)) return false

    return true
  }

  buildErrorMessage(): string {
    return 'El archivo debe ser una imagen o video válido (JPEG, PNG, WebP, GIF, HEIC, MP4, WebM o AVI)'
  }
}
