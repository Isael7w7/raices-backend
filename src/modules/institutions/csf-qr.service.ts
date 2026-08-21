import { Injectable, BadRequestException, Logger } from '@nestjs/common'
import sharp from 'sharp'
import jsQR from 'jsqr'
import { convert as pdfToImage } from 'pdf-img-convert'

/** Dominios oficiales del SAT aceptados en el QR de la CSF */
const DOMINIOS_SAT = ['siat.sat.gob.mx', 'sat.gob.mx'] as const

/** Tipos MIME de imagen soportados */
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'] as const

@Injectable()
export class CsfQrService {
  private readonly logger = new Logger('CsfQrService')

  /**
   * Extrae la URL del SAT desde el código QR de una Constancia de Situación Fiscal.
   *
   * Acepta PDFs (primera página convertida a imagen) o imágenes directas.
   * Valida que la URL extraída pertenezca a un dominio oficial del SAT.
   *
   * @param fileBuffer - Buffer del archivo subido (PDF o imagen)
   * @param mimeType  - Tipo MIME del archivo (e.g. "application/pdf", "image/png")
   * @returns La URL del SAT contenida en el código QR
   * @throws BadRequestException si no se detecta QR o el dominio no es del SAT
   */
  async extraerUrlSatFromCsf(fileBuffer: Buffer, mimeType: string): Promise<string> {
    const imagenBuffer = await this.obtenerBufferImagen(fileBuffer, mimeType)
    const { data, info } = await this.procesarImagen(imagenBuffer)

    const codigoQR = jsQR(new Uint8ClampedArray(data), info.width, info.height)

    if (!codigoQR?.data) {
      throw new BadRequestException(
        'No se detectó un código QR válido en el documento. '
        + 'Asegúrese de que el archivo contenga un código QR legible.',
      )
    }

    const url = codigoQR.data.trim()

    if (!this.esUrlSatValida(url)) {
      throw new BadRequestException(
        `El código QR no contiene una URL válida del SAT. URL detectada: "${url}". `
        + `Solo se aceptan dominios oficiales: ${DOMINIOS_SAT.join(', ')}.`,
      )
    }

    this.logger.log(`URL SAT extraída del CSF correctamente`)
    return url
  }

  // ─── Métodos privados ────────────────────────────────────────────────

  /**
   * Convierte un PDF a imagen (primera página) o retorna el buffer tal cual si ya es imagen.
   */
  private async obtenerBufferImagen(fileBuffer: Buffer, mimeType: string): Promise<Buffer> {
    if (mimeType === 'application/pdf') {
      return this.convertirPdfAImagen(fileBuffer)
    }

    if (IMAGE_MIMES.includes(mimeType as any)) {
      return fileBuffer
    }

    throw new BadRequestException(
      `Tipo de archivo no soportado: "${mimeType}". `
      + `Solo se aceptan PDF e imágenes (PNG, JPEG, GIF, WebP, BMP).`,
    )
  }

  /**
   * Convierte la primera página del PDF a un buffer PNG usando pdf-img-convert.
   */
  private async convertirPdfAImagen(pdfBuffer: Buffer): Promise<Buffer> {
    try {
      const imagenes = await pdfToImage(pdfBuffer, {
        page_numbers: [1],
        scale: 2, // Mayor escala = mejor resolución para QR
      })

      if (!imagenes || imagenes.length === 0) {
        throw new BadRequestException(
          'No se pudo convertir el PDF a imagen. Verifique que el archivo no esté corrupto.',
        )
      }

      // pdf-img-convert retorna Uint8Array; sharp acepta ambos
      return Buffer.from(imagenes[0] as Uint8Array)
    } catch (error) {
      if (error instanceof BadRequestException) throw error

      this.logger.error(`Error al convertir PDF a imagen: ${(error as Error).message}`)
      throw new BadRequestException(
        'Error al procesar el PDF. Asegúrese de que sea un archivo válido y no esté protegido.',
      )
    }
  }

  /**
   * Procesa un buffer de imagen con sharp para obtener los píxeles crudos en RGBA.
   */
  private async procesarImagen(imagenBuffer: Buffer): Promise<{ data: Buffer; info: { width: number; height: number; channels: number; size: number } }> {
    try {
      const resultado = await sharp(imagenBuffer)
        .ensureAlpha()       // Garantizar canal alfa (RGBA)
        .raw()               // Obtener píxeles crudos
        .toBuffer({ resolveWithObject: true })

      return resultado
    } catch (error) {
      this.logger.error(`Error al procesar imagen con sharp: ${(error as Error).message}`)
      throw new BadRequestException(
        'No se pudo procesar la imagen del documento. Verifique que el archivo no esté corrupto.',
      )
    }
  }

  /**
   * Valida que la URL extraída contenga un dominio oficial del SAT.
   */
  private esUrlSatValida(url: string): boolean {
    try {
      const parsed = new URL(url)
      return DOMINIOS_SAT.some(dominio => parsed.hostname === dominio || parsed.hostname.endsWith(`.${dominio}`))
    } catch {
      // Si no es una URL válida, no pertenece al SAT
      return false
    }
  }
}
