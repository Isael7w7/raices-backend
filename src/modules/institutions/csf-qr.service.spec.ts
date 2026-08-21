import { BadRequestException } from '@nestjs/common'
import { CsfQrService } from './csf-qr.service'

// Mock de las dependencias pesadas
jest.mock('sharp', () => {
  const mockSharpInstance = {
    ensureAlpha: jest.fn().mockReturnThis(),
    raw: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue({
      data: Buffer.alloc(4), // 1x1 pixel RGBA
      info: { width: 1, height: 1, channels: 4, size: 4 },
    }),
  }
  const sharpFn = jest.fn(() => mockSharpInstance)
  return Object.assign(sharpFn, { __esModule: true, default: sharpFn })
})

jest.mock('jsqr', () => {
  const mockFn = jest.fn()
  return { __esModule: true, default: mockFn }
})

jest.mock('pdf-img-convert', () => ({
  convert: jest.fn(),
}))

// Importar mocks después de declararlos
import jsQR from 'jsqr'
import * as pdfImgConvert from 'pdf-img-convert'

describe('CsfQrService', () => {
  let service: CsfQrService
  const mockJsQR = jsQR as jest.MockedFunction<typeof jsQR>
  const mockPdfConvert = (pdfImgConvert as any).convert as jest.MockedFunction<typeof pdfImgConvert.convert>

  beforeEach(() => {
    service = new CsfQrService()
    jest.clearAllMocks()

    // Restaurar el mock de sharp a su comportamiento por defecto
    const sharp = require('sharp')
    sharp.mockImplementation(() => ({
      ensureAlpha: jest.fn().mockReturnThis(),
      raw: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue({
        data: Buffer.alloc(4),
        info: { width: 1, height: 1, channels: 4, size: 4 },
      }),
    }))
  })

  // ── Casos exitosos ─────────────────────────────────────────────────

  describe('extraerUrlSatFromCsf', () => {
    it('should extract SAT URL from a PNG image with valid QR', async () => {
      mockJsQR.mockReturnValue({ data: 'https://siat.sat.gob.mx/consultaPublica' } as any)

      const result = await service.extraerUrlSatFromCsf(Buffer.from('fake-png'), 'image/png')

      expect(result).toBe('https://siat.sat.gob.mx/consultaPublica')
      expect(mockJsQR).toHaveBeenCalled()
    })

    it('should extract SAT URL from a JPEG image', async () => {
      mockJsQR.mockReturnValue({ data: 'https://sat.gob.mx/app/consultaCsf' } as any)

      const result = await service.extraerUrlSatFromCsf(Buffer.from('fake-jpeg'), 'image/jpeg')

      expect(result).toBe('https://sat.gob.mx/app/consultaCsf')
    })

    it('should accept URL with subdomain of SAT domain', async () => {
      mockJsQR.mockReturnValue({ data: 'https://www.siat.sat.gob.mx/consulta' } as any)

      const result = await service.extraerUrlSatFromCsf(Buffer.from('fake-png'), 'image/png')

      expect(result).toBe('https://www.siat.sat.gob.mx/consulta')
    })

    it('should trim whitespace from URL', async () => {
      mockJsQR.mockReturnValue({ data: '  https://siat.sat.gob.mx/consulta  ' } as any)

      const result = await service.extraerUrlSatFromCsf(Buffer.from('fake-png'), 'image/png')

      expect(result).toBe('https://siat.sat.gob.mx/consulta')
    })

    it('should convert PDF to image before QR extraction', async () => {
      const pdfImageBuffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47]) // PNG header
      mockPdfConvert.mockResolvedValue([pdfImageBuffer])
      mockJsQR.mockReturnValue({ data: 'https://siat.sat.gob.mx/csf' } as any)

      const result = await service.extraerUrlSatFromCsf(Buffer.from('fake-pdf'), 'application/pdf')

      expect(mockPdfConvert).toHaveBeenCalledWith(Buffer.from('fake-pdf'), {
        page_numbers: [1],
        scale: 2,
      })
      expect(result).toBe('https://siat.sat.gob.mx/csf')
    })
  })

  // ── Casos de error: sin QR ────────────────────────────────────────

  describe('when no QR is detected', () => {
    it('should throw BadRequestException when jsQR returns null', async () => {
      mockJsQR.mockReturnValue(null)

      await expect(
        service.extraerUrlSatFromCsf(Buffer.from('no-qr'), 'image/png'),
      ).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when jsQR returns empty data', async () => {
      mockJsQR.mockReturnValue({ data: '' } as any)

      await expect(
        service.extraerUrlSatFromCsf(Buffer.from('empty-qr'), 'image/png'),
      ).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException with descriptive message', async () => {
      mockJsQR.mockReturnValue(null)

      try {
        await service.extraerUrlSatFromCsf(Buffer.from('no-qr'), 'image/png')
        fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException)
        expect((error as BadRequestException).message).toContain('código QR válido')
      }
    })
  })

  // ── Casos de error: dominio no válido ──────────────────────────────

  describe('when QR domain is not SAT', () => {
    it('should throw BadRequestException when URL is from a non-SAT domain', async () => {
      mockJsQR.mockReturnValue({ data: 'https://www.google.com' } as any)

      await expect(
        service.extraerUrlSatFromCsf(Buffer.from('fake-png'), 'image/png'),
      ).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when URL has no valid domain', async () => {
      mockJsQR.mockReturnValue({ data: 'not-a-url' } as any)

      await expect(
        service.extraerUrlSatFromCsf(Buffer.from('fake-png'), 'image/png'),
      ).rejects.toThrow(BadRequestException)
    })

    it('should throw with message showing the detected URL', async () => {
      mockJsQR.mockReturnValue({ data: 'https://fake-sat.com/consulta' } as any)

      try {
        await service.extraerUrlSatFromCsf(Buffer.from('fake-png'), 'image/png')
        fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException)
        expect((error as BadRequestException).message).toContain('fake-sat.com')
      }
    })

    it('should reject URL that only contains "sat" but not official domain', async () => {
      mockJsQR.mockReturnValue({ data: 'https://sat-informal.com.mx/csf' } as any)

      await expect(
        service.extraerUrlSatFromCsf(Buffer.from('fake-png'), 'image/png'),
      ).rejects.toThrow(BadRequestException)
    })
  })

  // ── Casos de error: tipo de archivo ────────────────────────────────

  describe('when file type is unsupported', () => {
    it('should throw BadRequestException for unsupported MIME type', async () => {
      await expect(
        service.extraerUrlSatFromCsf(Buffer.from('fake'), 'application/msword'),
      ).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException for video files', async () => {
      await expect(
        service.extraerUrlSatFromCsf(Buffer.from('fake'), 'video/mp4'),
      ).rejects.toThrow(BadRequestException)
    })

    it('should throw descriptive error for unsupported type', async () => {
      try {
        await service.extraerUrlSatFromCsf(Buffer.from('fake'), 'text/plain')
        fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException)
        expect((error as BadRequestException).message).toContain('Tipo de archivo no soportado')
      }
    })
  })

  // ── Casos de error: PDF corrupto ───────────────────────────────────

  describe('when PDF conversion fails', () => {
    it('should throw BadRequestException when PDF conversion returns empty array', async () => {
      mockPdfConvert.mockResolvedValue([])

      await expect(
        service.extraerUrlSatFromCsf(Buffer.from('corrupt-pdf'), 'application/pdf'),
      ).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when PDF conversion throws', async () => {
      mockPdfConvert.mockRejectedValue(new Error('Invalid PDF'))

      await expect(
        service.extraerUrlSatFromCsf(Buffer.from('invalid-pdf'), 'application/pdf'),
      ).rejects.toThrow(BadRequestException)
    })
  })

  // ── Casos de error: imagen corrupta ────────────────────────────────

  describe('when image processing fails', () => {
    it('should throw BadRequestException when sharp fails', async () => {
      const sharp = require('sharp')
      sharp.mockImplementationOnce(() => ({
        ensureAlpha: jest.fn().mockReturnThis(),
        raw: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Invalid image')),
      }))

      mockJsQR.mockReturnValue(null) // Para que no llegue al dominio check

      await expect(
        service.extraerUrlSatFromCsf(Buffer.from('corrupt-image'), 'image/png'),
      ).rejects.toThrow(BadRequestException)
    })
  })

  // ── Soporte de múltiples formatos de imagen ────────────────────────

  describe('image format support', () => {
    it.each(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'])(
      'should accept %s and attempt QR extraction',
      async (mimeType) => {
        mockJsQR.mockReturnValue({ data: 'https://siat.sat.gob.mx/test' } as any)

        const result = await service.extraerUrlSatFromCsf(Buffer.from('fake'), mimeType)

        expect(result).toBe('https://siat.sat.gob.mx/test')
      },
    )
  })
})
