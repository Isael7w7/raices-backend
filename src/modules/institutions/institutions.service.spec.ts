import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, ForbiddenException } from '@nestjs/common'
import { InstitutionsService } from './institutions.service'
import { FIRESTORE } from '../../database/firebase.provider'

// ─── Mock helpers ────────────────────────────────────────────────────────

function mockDoc(data: Record<string, any> | null, exists = true, docId = 'mock-doc-id') {
  return {
    exists,
    id: docId,
    data: () => data,
  }
}

function mockCollection(opts: {
  docResult?: any
  empty?: boolean
  docs?: any[]
  docId?: string
  docData?: Record<string, any> | null
} = {}) {
  const { docResult, empty = false, docs = [], docId = 'mock-doc-id', docData } = opts
  return {
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(docResult ?? mockDoc(docData ?? null, docData !== null, docId)),
      set: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    }),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ empty, docs, size: docs.length }),
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('InstitutionsService', () => {
  let service: InstitutionsService
  let firestoreMock: Record<string, any>

  beforeEach(async () => {
    firestoreMock = { collection: jest.fn() }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstitutionsService,
        { provide: FIRESTORE, useValue: firestoreMock },
      ],
    }).compile()

    service = module.get<InstitutionsService>(InstitutionsService)
  })

  // ── findAll ─────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated institutions', async () => {
      const institutions = [
        { id: '1', nombre: 'Centro A', activa: true, calificacionPromedio: 4.5 },
        { id: '2', nombre: 'Centro B', activa: true, calificacionPromedio: 3.8 },
      ]
      const docs = institutions.map(i => ({ id: i.id, data: () => i }))

      firestoreMock.collection.mockReturnValue(mockCollection({ empty: false, docs }))

      const result: any = await service.findAll({ page: 1, limit: 10 })

      expect(result.datos).toHaveLength(2)
      expect(result.paginacion.total).toBe(2)
      expect(result.paginacion.pagina).toBe(1)
      expect(result.paginacion.limite).toBe(10)
    })

    it('should filter by busqueda', async () => {
      const institutions = [
        { id: '1', nombre: 'Centro Rehabilitación', ciudad: 'Mérida', activa: true, calificacionPromedio: 4.5 },
        { id: '2', nombre: 'Escuela Especial', ciudad: 'Cancún', activa: true, calificacionPromedio: 3.8 },
      ]
      const docs = institutions.map(i => ({ id: i.id, data: () => i }))

      firestoreMock.collection.mockReturnValue(mockCollection({ empty: false, docs }))

      const result: any = await service.findAll({ busqueda: 'rehabilitación' })

      expect(result.datos).toHaveLength(1)
      expect(result.datos[0].nombre).toBe('Centro Rehabilitación')
    })

    it('should filter by ciudad', async () => {
      const institutions = [
        { id: '1', nombre: 'Centro A', ciudad: 'Mérida', activa: true, calificacionPromedio: 4.5 },
        { id: '2', nombre: 'Centro B', ciudad: 'Cancún', activa: true, calificacionPromedio: 3.8 },
      ]
      const docs = institutions.map(i => ({ id: i.id, data: () => i }))

      firestoreMock.collection.mockReturnValue(mockCollection({ empty: false, docs }))

      const result: any = await service.findAll({ ciudad: 'Mérida' })

      expect(result.datos).toHaveLength(1)
      expect(result.datos[0].ciudad).toBe('Mérida')
    })

    it('should return empty results when no institutions exist', async () => {
      firestoreMock.collection.mockReturnValue(mockCollection({ empty: true, docs: [] }))

      const result: any = await service.findAll()

      expect(result.datos).toHaveLength(0)
      expect(result.paginacion.total).toBe(0)
    })

    it('should sort by calificacionPromedio descending', async () => {
      const institutions = [
        { id: '1', nombre: 'A', activa: true, calificacionPromedio: 3.0 },
        { id: '2', nombre: 'B', activa: true, calificacionPromedio: 5.0 },
        { id: '3', nombre: 'C', activa: true, calificacionPromedio: 4.0 },
      ]
      const docs = institutions.map(i => ({ id: i.id, data: () => i }))

      firestoreMock.collection.mockReturnValue(mockCollection({ empty: false, docs }))

      const result: any = await service.findAll()

      expect(result.datos[0].nombre).toBe('B')
      expect(result.datos[1].nombre).toBe('C')
      expect(result.datos[2].nombre).toBe('A')
    })
  })

  // ── findOne ─────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return institution by id', async () => {
      const instData = { nombre: 'Centro Test', activa: true }

      firestoreMock.collection.mockReturnValue(
        mockCollection({ docData: instData, docId: 'test-id' })
      )

      const result: any = await service.findOne('test-id')

      expect(result.nombre).toBe('Centro Test')
      expect(result.id).toBe('test-id')
    })

    it('should throw NotFoundException if institution does not exist', async () => {
      firestoreMock.collection.mockReturnValue(
        mockCollection({ docData: null, docId: 'nonexistent' })
      )

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException)
    })
  })

  // ── findMine ────────────────────────────────────────────────────────

  describe('findMine', () => {
    it('should return the institution created by the user', async () => {
      const instData = { nombre: 'Mi Centro', creadoPor: 'user1', activa: true }
      const mockDocRef = { id: 'inst-1', data: () => instData }

      const orderByMock = jest.fn().mockReturnThis()

      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: orderByMock,
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: false, docs: [mockDocRef] }),
      })

      const result: any = await service.findMine('user1')

      expect(result.nombre).toBe('Mi Centro')
      expect(result.id).toBe('inst-1')
      expect(orderByMock).toHaveBeenCalledWith('fechaCreacion', 'desc')
    })

    it('should throw NotFoundException if user has no institution', async () => {
      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      })

      await expect(service.findMine('user-no-inst')).rejects.toThrow(NotFoundException)
    })

    it('should order by fechaCreacion descending to get the most recent', async () => {
      const oldest = { nombre: 'Centro Viejo', creadoPor: 'user1', activa: true, fechaCreacion: '2024-01-01T00:00:00Z' }
      const newest = { nombre: 'Centro Nuevo', creadoPor: 'user1', activa: true, fechaCreacion: '2025-01-01T00:00:00Z' }
      const docs = [
        { id: 'inst-old', data: () => oldest },
        { id: 'inst-new', data: () => newest },
      ]

      // Simular que Firestore ordena y devuelve primero el más reciente
      const dbQueryMock = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: false, docs: [docs[1]] }),
      }

      firestoreMock.collection.mockReturnValue(dbQueryMock)

      const result: any = await service.findMine('user1')

      expect(result.nombre).toBe('Centro Nuevo')
      expect(dbQueryMock.orderBy).toHaveBeenCalledWith('fechaCreacion', 'desc')
    })

    it('should fall back to in-memory sort when Firestore index is not ready', async () => {
      // Simular el error que Firestore devuelve cuando falta el índice compuesto
      const indexError = new Error('The query requires an index. You can create it here: ...')
      ;(indexError as any).code = 'failed-precondition'

      const oldest = { nombre: 'Centro Viejo', creadoPor: 'user1', activa: true, fechaCreacion: '2024-01-01T00:00:00Z' }
      const newest = { nombre: 'Centro Nuevo', creadoPor: 'user1', activa: true, fechaCreacion: '2025-01-01T00:00:00Z' }

      const collectionMock = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        // 1ra llamada (con orderBy) → error de índice
        // 2da llamada (fallback, sin orderBy) → éxito
        get: jest.fn()
          .mockRejectedValueOnce(indexError)
          .mockResolvedValueOnce({
            empty: false,
            docs: [
              { id: 'inst-old', data: () => oldest },
              { id: 'inst-new', data: () => newest },
            ],
          }),
      }

      firestoreMock.collection.mockReturnValue(collectionMock)

      const result: any = await service.findMine('user1')

      // Debe devolver el más reciente (ordenado en memoria por fechaCreacion)
      expect(result.nombre).toBe('Centro Nuevo')
      // Verificar que el fallback ejecutó dos queries
      expect(collectionMock.get).toHaveBeenCalledTimes(2)
    })
  })

  // ── create ──────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a new institution', async () => {
      const dto = {
        nombre: 'Nueva Institución',
        categoria: 'funcional',
        descripcion: 'Una institución de prueba',
      }

      const setMock = jest.fn().mockResolvedValue(undefined)
      const createdDocData = {
        id: 'new-id',
        nombre: 'Nueva Institución',
        categoria: 'funcional',
        descripcion: 'Una institución de prueba',
        activa: true,
        verificada: false,
        creadoPor: 'user1',
      }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          set: setMock,
          get: jest.fn().mockResolvedValue(mockDoc({ id: 'new-id', ...createdDocData })),
        }),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: false, docs: [{ id: 'new-id', data: () => createdDocData }] }),
      })

      const result: any = await service.create(dto, 'user1')

      expect(setMock).toHaveBeenCalled()
      expect(result.nombre).toBe('Nueva Institución')
      expect(result.creadoPor).toBe('user1')
    })
  })

  // ── updateMine ──────────────────────────────────────────────────────

  describe('updateMine', () => {
    it('should update the user institution', async () => {
      const existingData = { nombre: 'Mi Centro', creadoPor: 'user1', activa: true }
      const updateMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [{ id: 'inst-1', data: () => existingData }],
        }),
        doc: jest.fn().mockReturnValue({
          update: updateMock,
          get: jest.fn().mockResolvedValue(mockDoc({ nombre: 'Centro Actualizado', creadoPor: 'user1', activa: true }, true, 'inst-1')),
        }),
      })

      const result: any = await service.updateMine('user1', { nombre: 'Centro Actualizado' })

      expect(updateMock).toHaveBeenCalled()
    })

    it('should throw NotFoundException if user has no institution', async () => {
      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      })

      await expect(service.updateMine('user-no-inst', { nombre: 'Test' })).rejects.toThrow(NotFoundException)
    })
  })

  // ── update ──────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update institution by id when owner', async () => {
      const existingData = { nombre: 'Centro Viejo', activa: true, creadoPor: 'user1' }
      const updateMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn()
            .mockResolvedValueOnce(mockDoc(existingData, true, 'inst-1'))
            .mockResolvedValueOnce(mockDoc({ nombre: 'Centro Nuevo', activa: true, creadoPor: 'user1' }, true, 'inst-1')),
          update: updateMock,
        }),
      })

      const result: any = await service.update('inst-1', { nombre: 'Centro Nuevo' }, 'user1', 'institucion')

      expect(updateMock).toHaveBeenCalled()
      expect(result.nombre).toBe('Centro Nuevo')
    })

    it('should update institution by id when admin', async () => {
      const existingData = { nombre: 'Centro Viejo', activa: true, creadoPor: 'other-user' }
      const updateMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn()
            .mockResolvedValueOnce(mockDoc(existingData, true, 'inst-1'))
            .mockResolvedValueOnce(mockDoc({ nombre: 'Centro Nuevo', activa: true }, true, 'inst-1')),
          update: updateMock,
        }),
      })

      const result: any = await service.update('inst-1', { nombre: 'Centro Nuevo' }, 'admin-id', 'admin')

      expect(updateMock).toHaveBeenCalled()
      expect(result.nombre).toBe('Centro Nuevo')
    })

    it('should throw ForbiddenException when non-owner non-admin tries to update', async () => {
      const existingData = { nombre: 'Centro', activa: true, creadoPor: 'owner-id' }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc(existingData, true, 'inst-1')),
        }),
      })

      await expect(
        service.update('inst-1', { nombre: 'Hack' }, 'intruder-id', 'institucion')
      ).rejects.toThrow(ForbiddenException)
    })

    it('should throw NotFoundException if institution does not exist', async () => {
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc(null, false, 'nonexistent')),
        }),
      })

      await expect(service.update('nonexistent', { nombre: 'Test' }, 'user1', 'admin')).rejects.toThrow(NotFoundException)
    })

    it('should return existing institution when no fields to update', async () => {
      const existingData = { nombre: 'Centro Test', activa: true, creadoPor: 'user1' }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc(existingData, true, 'inst-1')),
        }),
      })

      const result: any = await service.update('inst-1', {}, 'user1', 'institucion')

      expect(result.nombre).toBe('Centro Test')
    })
  })

  // ── remove ──────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should soft-delete an institution when owner', async () => {
      const updateMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc({ nombre: 'Centro', activa: true, creadoPor: 'user1' }, true, 'inst-1')),
          update: updateMock,
        }),
      })

      const result: any = await service.remove('inst-1', 'user1', 'institucion')

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ activa: false })
      )
      expect(result).toBeUndefined()
    })

    it('should soft-delete an institution when admin', async () => {
      const updateMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc({ nombre: 'Centro', activa: true, creadoPor: 'other' }, true, 'inst-1')),
          update: updateMock,
        }),
      })

      const result: any = await service.remove('inst-1', 'admin-id', 'admin')

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ activa: false })
      )
      expect(result).toBeUndefined()
    })

    it('should throw ForbiddenException when non-owner non-admin tries to delete', async () => {
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc({ nombre: 'Centro', activa: true, creadoPor: 'owner' }, true, 'inst-1')),
        }),
      })

      await expect(service.remove('inst-1', 'intruder', 'institucion')).rejects.toThrow(ForbiddenException)
    })

    it('should throw NotFoundException if institution does not exist', async () => {
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc(null, false, 'nonexistent')),
        }),
      })

      await expect(service.remove('nonexistent', 'user1', 'admin')).rejects.toThrow(NotFoundException)
    })
  })
})
