import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { E2eTestModule } from './helpers/e2e-module'
import { CsfQrService } from '../src/modules/institutions/csf-qr.service'
import { sembrarPerfil, sembrarInstitucion, limpiarDb, token } from './helpers/fixtures'

// ─── Mock del CsfQrService ─────────────────────────────────────────────────
const mockCsfQrService = {
  extraerUrlSatFromCsf: jest.fn(),
}

const mockCsfQrServiceError = {
  extraerUrlSatFromCsf: jest.fn(),
}

// ─── Fixtures ──────────────────────────────────────────────────────────────
const inst = {
  id: 'inst-qr',
  nombre: 'Centro QR',
  categoria: 'funcional',
  ciudad: 'Mérida',
  activa: true,
  verificada: true,
  creadoPor: 'uid-usr',
  calificacionPromedio: 0,
  cantidadCalificaciones: 0,
  fechaCreacion: '2026-01-01T00:00:00.000Z',
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Crea una aplicación NestJS con el mock del CsfQrService que retorna URL válida.
 */
async function crearAppConMock() {
  const moduleRef = await Test.createTestingModule({ imports: [E2eTestModule] })
    .overrideProvider(CsfQrService)
    .useValue(mockCsfQrService)
    .compile()

  const app = moduleRef.createNestApplication()
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )
  app.setGlobalPrefix('api')
  await app.init()
  return app
}

/**
 * Crea una aplicación NestJS con un mock que lanza errores.
 */
async function crearAppConMockError() {
  const moduleRef = await Test.createTestingModule({ imports: [E2eTestModule] })
    .overrideProvider(CsfQrService)
    .useValue(mockCsfQrServiceError)
    .compile()

  const app = moduleRef.createNestApplication()
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )
  app.setGlobalPrefix('api')
  await app.init()
  return app
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('POST /api/instituciones/validar-csf-qr (E2E)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await crearAppConMock()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    limpiarDb()
    await sembrarPerfil({ id: 'uid-usr', email: 'usr@test.com', rol: 'institucion', activo: true })
    await sembrarInstitucion(inst)
    mockCsfQrService.extraerUrlSatFromCsf.mockReset()
  })

  // ── Autenticación ──────────────────────────────────────────────────

  describe('autenticación', () => {
    it('401: sin token de autenticación', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/instituciones/validar-csf-qr')
        .attach('documento', Buffer.from('fake-pdf'), {
          filename: 'csf.pdf',
          contentType: 'application/pdf',
        })

      expect(res.status).toBe(401)
    })

    it('401: con token inválido', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/instituciones/validar-csf-qr')
        .set('Authorization', 'Bearer token-invalido')
        .attach('documento', Buffer.from('fake-pdf'), {
          filename: 'csf.pdf',
          contentType: 'application/pdf',
        })

      expect(res.status).toBe(401)
    })
  })

  // ── Validación de archivo ──────────────────────────────────────────

  describe('validación de archivo', () => {
    it('400: sin enviar archivo', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/instituciones/validar-csf-qr')
        .set('Authorization', token('uid-usr'))

      expect(res.status).toBe(400)
      expect(res.body.message).toContain('No se proporcionó ningún archivo')
    })

    it('400: tipo de archivo no permitido (audio)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/instituciones/validar-csf-qr')
        .set('Authorization', token('uid-usr'))
        .attach('documento', Buffer.from('fake-audio'), {
          filename: 'csf.mp3',
          contentType: 'audio/mpeg',
        })

      expect(res.status).toBe(400)
    })
  })

  // ── Extracción exitosa ─────────────────────────────────────────────

  describe('extracción exitosa', () => {
    it('200: retorna URL del SAT con formato correcto', async () => {
      const urlEsperada = 'https://siat.sat.gob.mx/consultaPublica'
      mockCsfQrService.extraerUrlSatFromCsf.mockResolvedValue(urlEsperada)

      const res = await request(app.getHttpServer())
        .post('/api/instituciones/validar-csf-qr')
        .set('Authorization', token('uid-usr'))
        .attach('documento', Buffer.from('fake-pdf-content'), {
          filename: 'csf.pdf',
          contentType: 'application/pdf',
        })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({
        exito: true,
        mensaje: 'Código QR de la CSF leído correctamente',
        urlSat: urlEsperada,
      })
      expect(mockCsfQrService.extraerUrlSatFromCsf).toHaveBeenCalledWith(
        expect.any(Buffer),
        'application/pdf',
      )
    })

    it('200: acepta imagen PNG', async () => {
      const urlEsperada = 'https://sat.gob.mx/app/consultaCsf'
      mockCsfQrService.extraerUrlSatFromCsf.mockResolvedValue(urlEsperada)

      const res = await request(app.getHttpServer())
        .post('/api/instituciones/validar-csf-qr')
        .set('Authorization', token('uid-usr'))
        .attach('documento', Buffer.from('fake-png-content'), {
          filename: 'csf.png',
          contentType: 'image/png',
        })

      expect(res.status).toBe(201)
      expect(res.body.exito).toBe(true)
      expect(res.body.urlSat).toBe(urlEsperada)
      expect(mockCsfQrService.extraerUrlSatFromCsf).toHaveBeenCalledWith(
        expect.any(Buffer),
        'image/png',
      )
    })

    it('200: acepta imagen JPEG', async () => {
      mockCsfQrService.extraerUrlSatFromCsf.mockResolvedValue('https://siat.sat.gob.mx/csf')

      const res = await request(app.getHttpServer())
        .post('/api/instituciones/validar-csf-qr')
        .set('Authorization', token('uid-usr'))
        .attach('documento', Buffer.from('fake-jpeg-content'), {
          filename: 'csf.jpg',
          contentType: 'image/jpeg',
        })

      expect(res.status).toBe(201)
      expect(res.body.exito).toBe(true)
    })
  })

  // ── Errores del servicio ───────────────────────────────────────────

  describe('errores del servicio', () => {
    let errorApp: INestApplication

    beforeAll(async () => {
      errorApp = await crearAppConMockError()
    })

    afterAll(async () => {
      await errorApp.close()
    })

    beforeEach(() => {
      mockCsfQrServiceError.extraerUrlSatFromCsf.mockReset()
    })

    it('400: cuando no se detecta código QR', async () => {
      const { BadRequestException } = require('@nestjs/common')
      mockCsfQrServiceError.extraerUrlSatFromCsf.mockRejectedValue(
        new BadRequestException('No se detectó un código QR válido en el documento.'),
      )

      const res = await request(errorApp.getHttpServer())
        .post('/api/instituciones/validar-csf-qr')
        .set('Authorization', token('uid-usr'))
        .attach('documento', Buffer.from('image-without-qr'), {
          filename: 'sin-qr.png',
          contentType: 'image/png',
        })

      expect(res.status).toBe(400)
      expect(res.body.message).toContain('código QR válido')
    })

    it('400: cuando el dominio del QR no pertenece al SAT', async () => {
      const { BadRequestException } = require('@nestjs/common')
      mockCsfQrServiceError.extraerUrlSatFromCsf.mockRejectedValue(
        new BadRequestException(
          'El código QR no contiene una URL válida del SAT. URL detectada: "https://www.google.com".',
        ),
      )

      const res = await request(errorApp.getHttpServer())
        .post('/api/instituciones/validar-csf-qr')
        .set('Authorization', token('uid-usr'))
        .attach('documento', Buffer.from('image-wrong-domain'), {
          filename: 'wrong.png',
          contentType: 'image/png',
        })

      expect(res.status).toBe(400)
      expect(res.body.message).toContain('URL válida del SAT')
    })

    it('400: cuando el tipo de archivo no es soportado', async () => {
      const { BadRequestException } = require('@nestjs/common')
      mockCsfQrServiceError.extraerUrlSatFromCsf.mockRejectedValue(
        new BadRequestException('Tipo de archivo no soportado: "application/msword".'),
      )

      const res = await request(errorApp.getHttpServer())
        .post('/api/instituciones/validar-csf-qr')
        .set('Authorization', token('uid-usr'))
        .attach('documento', Buffer.from('fake-doc'), {
          filename: 'csf.doc',
          contentType: 'application/msword',
        })

      // Este caso puede ser rechazado por el fileFilter del multer antes de llegar al servicio
      expect([400]).toContain(res.status)
    })
  })
})
