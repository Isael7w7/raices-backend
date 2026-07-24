import { Test, TestingModule } from '@nestjs/testing'
import { InstitutionsController } from './institutions.controller'
import { InstitutionsService } from './institutions.service'
import { FIRESTORE } from '../../database/firebase.provider'

describe('InstitutionsController', () => {
  let controller: InstitutionsController
  let service: InstitutionsService

  const mockService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findMine: jest.fn(),
    create: jest.fn(),
    updateMine: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  }

  const mockFirestore = { collection: jest.fn() }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InstitutionsController],
      providers: [
        { provide: InstitutionsService, useValue: mockService },
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
      const expected = { datos: [], paginacion: { total: 0, pagina: 1, limite: 20, totalPaginas: 0 } }
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

  // ── findMine ────────────────────────────────────────────────────────

  describe('findMine', () => {
    it('should return user institution', async () => {
      const inst = { id: 'inst-1', nombre: 'Mi Centro', creadoPor: 'user1' }
      mockService.findMine.mockResolvedValue(inst)

      const result = await controller.findMine({ id: 'user1' })

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

      const result = await controller.create(dto as any, { id: 'user1' })

      expect(mockService.create).toHaveBeenCalledWith(dto, 'user1')
      expect(result).toEqual(created)
    })
  })

  // ── updateMine ──────────────────────────────────────────────────────

  describe('updateMine', () => {
    it('should update user institution', async () => {
      const dto = { nombre: 'Actualizado' }
      const updated = { id: 'inst-1', nombre: 'Actualizado', creadoPor: 'user1' }
      mockService.updateMine.mockResolvedValue(updated)

      const result = await controller.updateMine({ id: 'user1' }, dto as any)

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

      const result = await controller.update('inst-1', dto as any, { id: 'user1', rol: 'institucion' })

      expect(mockService.update).toHaveBeenCalledWith('inst-1', dto, 'user1', 'institucion')
      expect(result).toEqual(updated)
    })
  })

  // ── remove ──────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should remove institution by id with user context', async () => {
      const removed = { exito: true, mensaje: 'Institución eliminada correctamente' }
      mockService.remove.mockResolvedValue(removed)

      const result = await controller.remove('inst-1', { id: 'user1', rol: 'admin' })

      expect(mockService.remove).toHaveBeenCalledWith('inst-1', 'user1', 'admin')
      expect(result).toEqual(removed)
    })
  })
})
