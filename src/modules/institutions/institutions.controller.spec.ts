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
import { BadRequestException } from '@nestjs/common'

describe('InstitutionsController', () => {
  let controller: InstitutionsController
  let service: InstitutionsService

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
    service = module.get<InstitutionsService>(InstitutionsService)
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
})
