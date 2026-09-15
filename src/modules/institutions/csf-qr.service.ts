import { Injectable, BadRequestException, Logger } from '@nestjs/common'
import sharp from 'sharp'
import jsQR from 'jsqr'

// pdfjs-dist v3 (build legacy CommonJS). Internamente requiere el módulo 'canvas',
// que en este proyecto está aliado a @napi-rs/canvas (package.json):
//   "canvas": "npm:@napi-rs/canvas@^0.1.100"
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js') as {
  getDocument: (params: { data: Uint8Array; disableFontFace?: boolean; verbosity?: number }) => {
    promise: Promise<{
      getPage: (n: number) => Promise<{
        getViewport: (opts: { scale: number }) => { width: number; height: number }
        render: (params: { canvasContext: unknown; viewport: { width: number; height: number } }) => { promise: Promise<unknown> }
      }>
      destroy: () => Promise<void>
    }>
  }
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createCanvas } = require('canvas') as { createCanvas: (w: number, h: number) => { getContext: (kind: '2d') => unknown; toBuffer: (mime?: string) => Buffer } }

/** Dominios oficiales del SAT aceptados en el QR de la CSF */
const DOMINIOS_SAT = ['siat.sat.gob.mx', 'sat.gob.mx'] as const

/** Tipos MIME de imagen soportados */
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'] as const

export interface ResultadoLecturaCsf {
  urlSat: string
  rfc?: string
  razonSocial?: string
}

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
   * @returns URL del SAT y datos fiscales (RFC / razón social) si la URL los contiene
   * @throws BadRequestException si no se detecta QR o el dominio no es del SAT
   */
  async extraerUrlSatFromCsf(fileBuffer: Buffer, mimeType: string): Promise<ResultadoLecturaCsf> {
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

    this.logger.log('URL SAT extraída del CSF correctamente')
    return {
      urlSat: url,
      ...this.extraerDatosFiscales(url),
    }
  }

  // ─── Métodos privados ────────────────────────────────────────────────

  /**
   * Convierte un PDF a imagen (primera página) o retorna el buffer tal cual si ya es imagen.
   */
  private async obtenerBufferImagen(fileBuffer: Buffer, mimeType: string): Promise<Buffer> {
    if (mimeType === 'application/pdf') {
      return this.convertirPdfAImagen(fileBuffer)
    }

    if (IMAGE_MIMES.includes(mimeType as (typeof IMAGE_MIMES)[number])) {
      return fileBuffer
    }

    throw new BadRequestException(
      `Tipo de archivo no soportado: "${mimeType}". `
      + `Solo se aceptan PDF e imágenes (PNG, JPEG, GIF, WebP, BMP).`,
    )
  }

  /**
   * Convierte la primera página del PDF a un buffer PNG usando pdfjs-dist + Canvas
   * (todo el stack usa paquetes precompilados, sin compilación nativa).
   */
  private async convertirPdfAImagen(pdfBuffer: Buffer): Promise<Buffer> {
    try {
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(pdfBuffer),
        disableFontFace: true,
        verbosity: 0,
      })
      const pdfDocument = await loadingTask.promise

      try {
        const page = await pdfDocument.getPage(1)
        const viewport = page.getViewport({ scale: 2 }) // Mayor escala = mejor resolución para QR

        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
        const context = canvas.getContext('2d')

        await page.render({ canvasContext: context, viewport }).promise

        return canvas.toBuffer('image/png')
      } finally {
        await pdfDocument.destroy()
      }
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
  private async procesarImagen(
    imagenBuffer: Buffer,
  ): Promise<{ data: Buffer; info: { width: number; height: number; channels: number; size: number } }> {
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

  /**
   * Intenta extraer RFC y razón social desde los parámetros de la URL del SAT
   * (best-effort: las URLs oficiales suelen incluir `rfc` o un segmento con el RFC).
   */
  private extraerDatosFiscales(url: string): { rfc?: string; razonSocial?: string } {
    const datos: { rfc?: string; razonSocial?: string } = {}

    try {
      const parsed = new URL(url)
      const rfcParam = parsed.searchParams.get('rfc') ?? parsed.searchParams.get('RFC')
      if (rfcParam) {
        const rfc = rfcParam.trim().toUpperCase()
        if (/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) {
          datos.rfc = rfc
        }
      }

      const razonParam = parsed.searchParams.get('razonSocial') ?? parsed.searchParams.get('nombre')
      if (razonParam) {
        datos.razonSocial = razonParam.trim()
      }
    } catch {
      // Sin datos adicionales disponibles: se ignoran
    }

    return datos
  }
}