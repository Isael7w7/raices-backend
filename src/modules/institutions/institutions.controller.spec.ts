// Mock de dependencias pesadas que usan ESM (pdf-img-convert → pdfjs-dist)
jest.mock('pdf-img-convert', () => ({ convert: jest.fn().mockResolvedValue([]) }))
jest.mock('sharp', () => {
  const mock = jest.fn(() => ({
    ensureAlpha: jest.fn().mockReturnThis(),
    raw: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue({ data: Buffer.alloc(4), info: { width: 1, height: 1, channels: 4, size: 4 } }),
  }))
  return Object.assign(mock, { __esModule: true, default: mock })
})
jest.mock('jsqr', () => ({ __esModule: true, default: jest.fn() }))

import { Test, TestingModule } from '@nestjs/testing'
import { InstitutionsController } from './institutions.controller'
import { InstitutionsService } from './institutions.service'
import { CsfQrService } from './csf-qr.service'
import { FIRESTORE } from '../../database/firebase.provider'
import { BadRequestException, NotFoundException, RequestMethod } from '@nestjs/common'
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RolesGuard } from '../../common/guards/roles.guard'

describe('InstitutionsController', () => {
  let controller: InstitutionsController

  const mockService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findOneProtegido: jest.fn(),
    findMine: jest.fn(),
    create: jest.fn(),
    updateMine: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    removeMine: jest.fn(),
    subirDocumentoVerificacion: jest.fn(),
    getEstadoVerificacion: jest.fn(),
  }

  const mockCsfQrService = {
    extraerUrlSatFromCsf: jest.fn(),
  }

  const mockFirestore = { collection: jest.fn() }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InstitutionsController],
      providers: [
        { provide: InstitutionsService, useValue: mockService },
        { provide: CsfQrService, useValue: mockCsfQrService },
        { provide: FIRESTORE, useValue: mockFirestore },
      ],
    }).compile()

    controller = module.get<InstitutionsController>(InstitutionsController)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // ── findAll ─────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should call service.findAll with query params', async () => {
      const expected: { datos: never[]; paginacion: { total: number; pagina: number; limite: number; totalPaginas: number } } = { datos: [], paginacion: { total: 0, pagina: 1, limite: 20, totalPaginas: 0 } }
      mockService.findAll.mockResolvedValue(expected)

      const result = await controller.findAll(1, 20, 'merida', 'funcional', 'Mérida')

      expect(mockService.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        busqueda: 'merida',
        categoria: 'funcional',
        ciudad: 'Mérida',
      })
      expect(result).toEqual(expected)
    })

    it('should handle undefined params', async () => {
      mockService.findAll.mockResolvedValue({ datos: [], paginacion: {} })

      await controller.findAll(undefined, undefined, undefined, undefined, undefined)

      expect(mockService.findAll).toHaveBeenCalledWith({
        page: undefined,
        limit: undefined,
        busqueda: undefined,
        categoria: undefined,
        ciudad: undefined,
      })
    })
  })

  // ── findOne ─────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return institution by id', async () => {
      const inst = { id: 'inst-1', nombre: 'Centro Test' }
      mockService.findOne.mockResolvedValue(inst)

      const result = await controller.findOne('inst-1')

      expect(mockService.findOne).toHaveBeenCalledWith('inst-1')
      expect(result).toEqual(inst)
    })
  })

  // ── findOneProtegido ────────────────────────────────────────────────

  describe('findOneProtegido', () => {
    it('should call service.findOneProtegido with id and user context', async () => {
      const inst = { id: 'inst-1', nombre: 'Centro', verificada: false, creadoPor: 'user1' }
      mockService.findOneProtegido.mockResolvedValue(inst)

      const result = await controller.findOneProtegido('inst-1', { id: 'user1', email: 'user1@test.com', rol: 'institucion', nombreCompleto: 'User 1', verificado: false, tutorId: null, features: { chat: true, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true } })

      expect(mockService.findOneProtegido).toHaveBeenCalledWith('inst-1', 'user1', 'institucion')
      expect(result).toEqual(inst)
    })
  })

  // ── findMine ────────────────────────────────────────────────────────

  describe('findMine', () => {
    it('should return user institution', async () => {
      const inst = { id: 'inst-1', nombre: 'Mi Centro', creadoPor: 'user1' }
      mockService.findMine.mockResolvedValue(inst)

      const result = await controller.findMine({ id: 'user1', email: 'user1@test.com', rol: 'pcd', nombreCompleto: 'User 1', verificado: false, tutorId: null, features: { chat: true, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true } })

      expect(mockService.findMine).toHaveBeenCalledWith('user1')
      expect(result).toEqual(inst)
    })
  })

  // ── create ──────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create institution with dto and user', async () => {
      const dto = { nombre: 'Nueva', categoria: 'funcional' }
      const created = { id: 'new-id', ...dto, creadoPor: 'user1' }
      mockService.create.mockResolvedValue(created)

      const result = await controller.create(dto as any, { id: 'user1', email: 'user1@test.com', rol: 'institucion', nombreCompleto: 'User 1', verificado: false, tutorId: null, features: { chat: true, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true } })

      expect(mockService.create).toHaveBeenCalledWith(dto, 'user1', 'institucion')
      expect(result).toEqual(created)
    })
  })

  // ── updateMine ──────────────────────────────────────────────────────

  describe('updateMine', () => {
    it('should update user institution', async () => {
      const dto = { nombre: 'Actualizado' }
      const updated = { id: 'inst-1', nombre: 'Actualizado', creadoPor: 'user1' }
      mockService.updateMine.mockResolvedValue(updated)

      const result = await controller.updateMine({ id: 'user1', email: 'user1@test.com', rol: 'institucion', nombreCompleto: 'User 1', verificado: false, tutorId: null, features: { chat: true, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true } }, dto as any)

      expect(mockService.updateMine).toHaveBeenCalledWith('user1', dto)
      expect(result).toEqual(updated)
    })
  })

  // ── update ──────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update institution by id with user context', async () => {
      const dto = { nombre: 'Actualizado' }
      const updated = { id: 'inst-1', nombre: 'Actualizado' }
      mockService.update.mockResolvedValue(updated)

      const result = await controller.update('inst-1', dto as any, { id: 'user1', email: 'user1@test.com', rol: 'institucion', nombreCompleto: 'User 1', verificado: false, tutorId: null, features: { chat: true, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true } })

      expect(mockService.update).toHaveBeenCalledWith('inst-1', dto, 'user1', 'institucion')
      expect(result).toEqual(updated)
    })
  })

  // ── validarCsfQr ──────────────────────────────────────────────────

  describe('validarCsfQr', () => {
    it('should return URL SAT when QR is valid', async () => {
      mockCsfQrService.extraerUrlSatFromCsf.mockResolvedValue('https://siat.sat.gob.mx/consultaPublica')

      const file = {
        buffer: Buffer.from('fake-pdf'),
        mimetype: 'application/pdf',
        originalname: 'csf.pdf',
      } as Express.Multer.File

      const result = await controller.validarCsfQr(file)

      expect(mockCsfQrService.extraerUrlSatFromCsf).toHaveBeenCalledWith(file.buffer, file.mimetype)
      expect(result).toEqual({
        exito: true,
        mensaje: 'Código QR de la CSF leído correctamente',
        urlSat: 'https://siat.sat.gob.mx/consultaPublica',
      })
    })

    it('should throw BadRequestException when no file is provided', async () => {
      await expect(controller.validarCsfQr(undefined as any)).rejects.toThrow(BadRequestException)
    })

    it('should propagate service errors for invalid QR', async () => {
      mockCsfQrService.extraerUrlSatFromCsf.mockRejectedValue(
        new BadRequestException('No se detectó un código QR válido'),
      )

      const file = {
        buffer: Buffer.from('fake-image'),
        mimetype: 'image/png',
        originalname: 'csf.png',
      } as Express.Multer.File

      await expect(controller.validarCsfQr(file)).rejects.toThrow(BadRequestException)
    })
  })

  // ── remove ──────────────────────────────────────────────────────────

  // ── removeMine ──────────────────────────────────────────────────────

  describe('removeMine', () => {
    it('should soft-delete the user institution', async () => {
      mockService.removeMine.mockResolvedValue(undefined)

      const result = await controller.removeMine({ id: 'user1', email: 'user1@test.com', rol: 'institucion', nombreCompleto: 'User 1', verificado: false, tutorId: null, features: { chat: true, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true } })

      expect(mockService.removeMine).toHaveBeenCalledWith('user1')
      expect(result).toBeUndefined()
    })
  })

  // ── remove ───────────────────────────────────────────────────────

  describe('remove', () => {
    it('should remove institution by id with user context', async () => {
      const removed = { exito: true, mensaje: 'Institución eliminada correctamente' }
      mockService.remove.mockResolvedValue(removed)

      const result = await controller.remove('inst-1', { id: 'user1', email: 'user1@test.com', rol: 'admin', nombreCompleto: 'User 1', verificado: false, tutorId: null, features: { chat: true, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true } })

      expect(mockService.remove).toHaveBeenCalledWith('inst-1', 'user1', 'admin')
      expect(result).toEqual(removed)
    })
  })

  // ── POST verificacion/documentos ────────────────────────────────────

  const userInstitucion = { id: 'inst-1', email: 'i@test.com', rol: 'institucion', nombreCompleto: 'Institución', verificado: false, tutorId: null, features: { chat: true, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true } }

  describe('subirDocumentoVerificacion', () => {
    it('registers POST verificacion/documentos with guards and roles BEFORE the :id routes', () => {
      const handler = (InstitutionsController.prototype as any).subirDocumentoVerificacion

      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('verificacion/documentos')
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST)

      const guards = Reflect.getMetadata('__guards__', handler) ?? []
      expect(guards).toContain(JwtAuthGuard)
      expect(guards).toContain(RolesGuard)

      // La empresa comparte la entidad institución y se registra con `rol: 'empresa'`
      // (auth.service.registrar). Si no se admitiera aquí, su CSF no tendría
      // ningún endpoint: /usuarios/documento-identidad rechaza 'csf' con 400 y no
      // escribe `documentoCsf`, que es lo que el admin revisa para aprobar.
      expect(Reflect.getMetadata('roles', handler)).toEqual(['institucion', 'empresa', 'admin'])

      const metodos = Object.getOwnPropertyNames(InstitutionsController.prototype)
      expect(metodos.indexOf('subirDocumentoVerificacion')).toBeLessThan(metodos.indexOf('update'))
      expect(metodos.indexOf('subirDocumentoVerificacion')).toBeLessThan(metodos.indexOf('findOne'))
    })

    it('delegates to the service passing only user id, tipo and file (numeroCurp ignored)', async () => {
      const file = { buffer: Buffer.from('%PDF-1.4'), originalname: 'csf.pdf' } as Express.Multer.File
      const resultado = { tipo: 'csf', urlDocumento: 'https://storage/csf.pdf', estado: 'pendiente', fechaSubida: '2026-10-01T00:00:00.000Z' }
      mockService.subirDocumentoVerificacion.mockResolvedValue(resultado)

      const result = await controller.subirDocumentoVerificacion(
        userInstitucion as any,
        { tipo: 'csf', numeroCurp: 'GOME850101HDFXXX01' } as any,
        file,
      )

      expect(mockService.subirDocumentoVerificacion).toHaveBeenCalledWith('inst-1', 'csf', file)
      expect(result).toEqual(resultado)
    })

    it('delegates the optional representative identification without CURP', async () => {
      const file = { buffer: Buffer.from('img'), originalname: 'ine.png' } as Express.Multer.File
      const resultado = { tipo: 'identificacion_representante', urlDocumento: 'https://storage/ine.png', estado: 'pendiente', fechaSubida: '2026-10-01T00:00:00.000Z' }
      mockService.subirDocumentoVerificacion.mockResolvedValue(resultado)

      const result = await controller.subirDocumentoVerificacion(userInstitucion as any, { tipo: 'identificacion_representante' } as any, file)

      expect(mockService.subirDocumentoVerificacion).toHaveBeenCalledWith('inst-1', 'identificacion_representante', file)
      expect(result).toEqual(resultado)
    })

    it('propagates service errors (404 sin institución, 400 sin archivo)', async () => {
      mockService.subirDocumentoVerificacion.mockRejectedValue(new BadRequestException('Debe adjuntar un archivo'))

      await expect(
        controller.subirDocumentoVerificacion(userInstitucion as any, { tipo: 'csf' } as any, undefined as any),
      ).rejects.toThrow(BadRequestException)
    })
  })

  // ── GET mi-institucion/estado-verificacion ──────────────────────────

  describe('getEstadoVerificacion', () => {
    it('registers GET mi-institucion/estado-verificacion with JwtAuthGuard and no RolesGuard', () => {
      const handler = (InstitutionsController.prototype as any).getEstadoVerificacion

      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('mi-institucion/estado-verificacion')
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET)

      const guards = Reflect.getMetadata('__guards__', handler) ?? []
      expect(guards).toContain(JwtAuthGuard)
      expect(guards).not.toContain(RolesGuard)
      expect(Reflect.getMetadata('roles', handler)).toBeUndefined()
    })

    it('delegates to the service with the authenticated user id', async () => {
      const estado = {
        institucionId: 'inst-1',
        nombre: 'Centro',
        verificada: false,
        porcentaje: 50,
        pasos: [
          { clave: 'csf', etiqueta: 'Constancia de Situación Fiscal', obligatorio: true, completado: true },
          { clave: 'aprobacion_admin', etiqueta: 'Aprobación del Administrador', obligatorio: true, completado: false },
          { clave: 'identificacion_representante', etiqueta: 'Identificación del Representante Legal', obligatorio: false, completado: false },
        ],
        pasosPendientes: ['aprobacion_admin'],
        documentosFaltantes: [] as string[],
      }
      mockService.getEstadoVerificacion.mockResolvedValue(estado)

      const result = await controller.getEstadoVerificacion(userInstitucion as any)

      expect(mockService.getEstadoVerificacion).toHaveBeenCalledWith('inst-1')
      expect(result).toEqual(estado)
      // La CURP no forma parte de los pasos de verificación
      expect(result.pasos.some(p => p.clave === 'curp')).toBe(false)
    })

    it('propagates 404 when the user has no institution', async () => {
      mockService.getEstadoVerificacion.mockRejectedValue(new NotFoundException('No tienes una institución registrada'))

      await expect(controller.getEstadoVerificacion(userInstitucion as any)).rejects.toThrow(NotFoundException)
    })
  })
})
