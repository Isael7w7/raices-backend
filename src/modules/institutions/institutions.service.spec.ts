import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { InstitutionsService } from './institutions.service'
import { UpdateInstitucionDto } from './dto/update-institucion.dto'
import { FIRESTORE } from '../../database/firebase.provider'
import { StorageService } from '../storage/storage.service'
import { UsersService } from '../users/users.service'

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
  const storageMock = { upload: jest.fn() }
  const usersMock = { subirDocumentoIdentidad: jest.fn() }

  beforeEach(async () => {
    firestoreMock = { collection: jest.fn() }
    storageMock.upload.mockClear()
    usersMock.subirDocumentoIdentidad.mockClear()
    storageMock.upload.mockResolvedValue('https://storage.googleapis.com/raices-bucket/instituciones/csf.pdf')
    usersMock.subirDocumentoIdentidad.mockResolvedValue({
      tipo: 'identificacion_oficial',
      urlDocumento: 'https://storage.googleapis.com/raices-bucket/identidad/ine.pdf',
      estado: 'pendiente',
      fechaSubida: '2026-08-13T00:00:00.000Z',
      numeroCurp: null,
    })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstitutionsService,
        { provide: FIRESTORE, useValue: firestoreMock },
        { provide: StorageService, useValue: storageMock },
        { provide: UsersService, useValue: usersMock },
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

    it('should exclude empresas (tipo: empresa) but keep legacy docs without tipo', async () => {
      const institutions = [
        { id: '1', nombre: 'Centro A', activa: true, verificada: true, calificacionPromedio: 4.5 },
        { id: '2', nombre: 'Empresa X', activa: true, verificada: true, calificacionPromedio: 5.0, tipo: 'empresa' },
        { id: '3', nombre: 'Doc legado sin tipo', activa: true, verificada: true, calificacionPromedio: 4.0 },
      ]
      const docs = institutions.map(i => ({ id: i.id, data: () => i }))

      firestoreMock.collection.mockReturnValue(mockCollection({ empty: false, docs }))

      const result: any = await service.findAll()

      // La empresa se oculta del directorio; los docs legados siguen visibles
      expect(result.datos.map((f: any) => f.id)).toEqual(['1', '3'])
      expect(result.paginacion.total).toBe(2)
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
    it('should return institution by id when active and verified', async () => {
      const instData = { nombre: 'Centro Test', activa: true, verificada: true }

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

    it('should throw NotFoundException when the institution is not verified', async () => {
      const instData = { nombre: 'Centro Pendiente', activa: true, verificada: false }

      firestoreMock.collection.mockReturnValue(
        mockCollection({ docData: instData, docId: 'test-id' })
      )

      await expect(service.findOne('test-id')).rejects.toThrow(NotFoundException)
    })

    it('should throw NotFoundException when the institution is inactive', async () => {
      const instData = { nombre: 'Centro Inactivo', activa: false, verificada: true }

      firestoreMock.collection.mockReturnValue(
        mockCollection({ docData: instData, docId: 'test-id' })
      )

      await expect(service.findOne('test-id')).rejects.toThrow(NotFoundException)
    })
  })

  // ── findOneProtegido ───────────────────────────────────────────────

  describe('findOneProtegido', () => {
    it('should return a pending institution for its owner', async () => {
      const instData = { nombre: 'Mi Centro', activa: true, verificada: false, creadoPor: 'user1' }

      firestoreMock.collection.mockReturnValue(
        mockCollection({ docData: instData, docId: 'inst-1' })
      )

      const result: any = await service.findOneProtegido('inst-1', 'user1', 'institucion')

      expect(result.nombre).toBe('Mi Centro')
      expect(result.verificada).toBe(false)
    })

    it('should return a pending institution for an admin', async () => {
      const instData = { nombre: 'Centro Ajeno', activa: true, verificada: false, creadoPor: 'other-user' }

      firestoreMock.collection.mockReturnValue(
        mockCollection({ docData: instData, docId: 'inst-1' })
      )

      const result: any = await service.findOneProtegido('inst-1', 'admin-id', 'admin')

      expect(result.nombre).toBe('Centro Ajeno')
    })

    it('should throw ForbiddenException for a non-owner non-admin user', async () => {
      const instData = { nombre: 'Centro Ajeno', activa: true, verificada: false, creadoPor: 'owner-id' }

      firestoreMock.collection.mockReturnValue(
        mockCollection({ docData: instData, docId: 'inst-1' })
      )

      await expect(service.findOneProtegido('inst-1', 'intruder', 'pcd')).rejects.toThrow(ForbiddenException)
    })

    it('should throw NotFoundException when the institution does not exist', async () => {
      firestoreMock.collection.mockReturnValue(
        mockCollection({ docData: null, docId: 'ghost' })
      )

      await expect(service.findOneProtegido('ghost', 'admin', 'admin')).rejects.toThrow(NotFoundException)
    })
  })

  // ── findMine ────────────────────────────────────────────────────────

  describe('findMine', () => {
    it('should return the canonical institution (doc id = UID) directly without extra queries', async () => {
      const instData = { nombre: 'Mi Centro', creadoPor: 'user1', activa: true }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(instData, true, 'user1')) }),
      })

      const result: any = await service.findMine('user1')

      expect(result.nombre).toBe('Mi Centro')
      expect(result.id).toBe('user1')
    })

    it('should fall back to the institution created by the user (creadoPor)', async () => {
      const instData = { nombre: 'Mi Centro', creadoPor: 'user1', activa: true }
      const mockDocRef = { id: 'inst-1', data: () => instData }

      const orderByMock = jest.fn().mockReturnThis()

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false, 'user1')) }),
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
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false, 'user-no-inst')) }),
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
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false, 'user1')) }),
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
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false, 'user1')) }),
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
    it('should create a new institution when the user has none', async () => {
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
        doc: jest.fn().mockImplementation((docId?: string) => {
          if (docId === 'user1') return { get: jest.fn().mockResolvedValue(mockDoc(null, false, 'user1')) }
          if (!docId) return { set: setMock, get: jest.fn().mockResolvedValue(mockDoc({ ...createdDocData, id: 'new-id' }, true, 'new-id')) }
          return { get: jest.fn().mockResolvedValue(mockDoc({ ...createdDocData, id: docId }, true, docId)) }
        }),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [], size: 0 }),
      })

      const result: any = await service.create(dto, 'user1', 'institucion')

      expect(setMock).toHaveBeenCalled()
      expect(result.nombre).toBe('Nueva Institución')
      expect(result.creadoPor).toBe('user1')
    })

    it('should throw ForbiddenException when the user role is not institucion or admin', async () => {
      const dto = { nombre: 'Nueva Institución', categoria: 'funcional' }

      await expect(service.create(dto, 'user1', 'pcd')).rejects.toThrow(ForbiddenException)
      await expect(service.create(dto, 'user1', 'tutor')).rejects.toThrow(ForbiddenException)
    })

    it('should throw BadRequestException when the user already has a canonical institution', async () => {
      const dto = { nombre: 'Otra Institución', categoria: 'funcional' }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc({ id: 'user1', nombre: 'Ya existente' }, true, 'user1')) }),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      })

      await expect(service.create(dto, 'user1', 'institucion')).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when the user already has an institution by creadoPor', async () => {
      const dto = { nombre: 'Otra Institución', categoria: 'funcional' }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false, 'user1')) }),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: false, docs: [{ id: 'inst-aleatoria', data: () => ({ nombre: 'Existente' }) }] }),
      })

      await expect(service.create(dto, 'user1', 'admin')).rejects.toThrow(BadRequestException)
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

      await service.updateMine('user1', { nombre: 'Centro Actualizado' })

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

    it('should ignore soft-deleted institutions (activa == true filter)', async () => {
      const whereMock = jest.fn().mockReturnThis()

      firestoreMock.collection.mockReturnValue({
        where: whereMock,
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      })

      await expect(service.updateMine('user1', { nombre: 'Test' })).rejects.toThrow(NotFoundException)

      // Debe filtrar tanto por creadoPor como por activa (no editar eliminadas)
      expect(whereMock).toHaveBeenCalledWith('creadoPor', '==', 'user1')
      expect(whereMock).toHaveBeenCalledWith('activa', '==', true)
    })
  })

  // ── update ──────────────────────────────────────────────────────────

  // ── removeMine ──────────────────────────────────────────────────────

  describe('removeMine', () => {
    it('should soft-delete the user institution (activa: false + fechaEliminacion)', async () => {
      const updateMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [{ id: 'inst-1', data: () => ({ nombre: 'Mi Centro', creadoPor: 'user1', activa: true }) }],
        }),
        doc: jest.fn().mockReturnValue({ update: updateMock }),
      })

      await service.removeMine('user1')

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ activa: false, fechaEliminacion: expect.any(String) }),
      )
    })

    it('should throw NotFoundException if user has no institution', async () => {
      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      })

      await expect(service.removeMine('user-no-inst')).rejects.toThrow(NotFoundException)
    })

    it('should ignore already soft-deleted institutions (activa == true filter)', async () => {
      const whereMock = jest.fn().mockReturnThis()

      firestoreMock.collection.mockReturnValue({
        where: whereMock,
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      })

      await expect(service.removeMine('user1')).rejects.toThrow(NotFoundException)

      expect(whereMock).toHaveBeenCalledWith('creadoPor', '==', 'user1')
      expect(whereMock).toHaveBeenCalledWith('activa', '==', true)
    })
  })

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

    it('should throw NotFoundException when updating a soft-deleted (inactive) institution', async () => {
      const updateMock = jest.fn()

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(
            mockDoc({ nombre: 'Centro Eliminado', activa: false, creadoPor: 'user1' }, true, 'inst-1')
          ),
          update: updateMock,
        }),
      })

      await expect(
        service.update('inst-1', { nombre: 'Revive' }, 'user1', 'admin')
      ).rejects.toThrow(NotFoundException)
      // No debe haber escrito nada en Firestore
      expect(updateMock).not.toHaveBeenCalled()
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

  // ── Verificación de personas morales (CSF, sin CURP) ───────────────

  describe('getEstadoVerificacion', () => {
    /** Monta instituciones (doc canónico) + documentosIdentidad del usuario */
    function mockInstitucion(data: Record<string, any> | null, docsIdentidad: any[] = []) {
      const updateMock = jest.fn().mockResolvedValue(undefined)
      firestoreMock.collection.mockImplementation((nombre: string) => {
        if (nombre === 'instituciones') {
          return {
            doc: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue(mockDoc(data, data !== null)),
              update: updateMock,
            }),
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ empty: true, docs: [], size: 0 }),
          }
        }
        return {
          doc: jest.fn(),
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({
            empty: docsIdentidad.length === 0,
            docs: docsIdentidad.map(d => ({ data: () => d })),
            size: docsIdentidad.length,
          }),
        }
      })
      return updateMock
    }

    it('should return CSF + admin approval steps without any CURP step', async () => {
      mockInstitucion({ nombre: 'Centro Vida', activa: true, documentoCsf: 'https://storage/csf.pdf', verificada: false })

      const res = await service.getEstadoVerificacion('inst-1')

      expect(res.institucionId).toBe('inst-1')
      expect(res.verificada).toBe(false)
      expect(res.pasos.map(p => p.clave)).toEqual(['csf', 'aprobacion_admin', 'identificacion_representante'])
      expect(res.pasos.some(p => p.clave === 'curp')).toBe(false)
      expect(res.pasos.find(p => p.clave === 'csf')?.completado).toBe(true)
      expect(res.pasos.find(p => p.clave === 'csf')?.obligatorio).toBe(true)
      expect(res.pasos.find(p => p.clave === 'aprobacion_admin')?.completado).toBe(false)
      expect(res.pasos.find(p => p.clave === 'identificacion_representante')?.obligatorio).toBe(false)
      expect(res.porcentaje).toBe(50)
      expect(res.pasosPendientes).toEqual(['aprobacion_admin'])
      expect(res.documentosFaltantes).toEqual([])
    })

    it('should require the CSF as the indispensable document (no CURP)', async () => {
      mockInstitucion({ nombre: 'Centro Vida', activa: true, verificada: false })

      const res = await service.getEstadoVerificacion('inst-1')

      expect(res.pasosPendientes).toEqual(['csf', 'aprobacion_admin'])
      expect(res.documentosFaltantes).toEqual(['csf'])
      expect(res.porcentaje).toBe(0)
      // La CURP jamás aparece como paso ni como requisito
      expect(res.pasos.map(p => p.clave)).not.toContain('curp')
      expect(res.documentosFaltantes).not.toContain('curp')
    })

    it('should reach 100% when the CSF is uploaded and the admin approves', async () => {
      mockInstitucion({ nombre: 'Centro Vida', activa: true, documentoCsf: 'https://storage/csf.pdf', verificada: true })

      const res = await service.getEstadoVerificacion('inst-1')

      expect(res.porcentaje).toBe(100)
      expect(res.pasosPendientes).toEqual([])
      expect(res.verificada).toBe(true)
    })

    it('should not count the optional representative identification in the percentage', async () => {
      mockInstitucion(
        { nombre: 'Centro Vida', activa: true, documentoCsf: 'https://storage/csf.pdf', verificada: false },
        [{ tipo: 'identificacion_oficial', estado: 'pendiente', usuarioId: 'inst-1' }],
      )

      const res = await service.getEstadoVerificacion('inst-1')

      expect(res.pasos.find(p => p.clave === 'identificacion_representante')?.completado).toBe(true)
      expect(res.porcentaje).toBe(50)
    })

    it('should throw NotFoundException when the user has no institution', async () => {
      mockInstitucion(null)

      await expect(service.getEstadoVerificacion('ghost')).rejects.toThrow(NotFoundException)
    })
  })

  describe('subirDocumentoVerificacion', () => {
    function mockInstitucion(data: Record<string, any> | null) {
      const updateMock = jest.fn().mockResolvedValue(undefined)
      firestoreMock.collection.mockImplementation((nombre: string) => {
        if (nombre === 'instituciones') {
          return {
            doc: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue(mockDoc(data, data !== null)),
              update: updateMock,
            }),
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ empty: true, docs: [], size: 0 }),
          }
        }
        return { doc: jest.fn(), where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ empty: true, docs: [], size: 0 }) }
      })
      return updateMock
    }

    const archivo = { buffer: Buffer.from('%PDF-1.4 csf'), originalname: 'csf.pdf' } as Express.Multer.File

    it('should upload the CSF (indispensable) and persist documentoCsf', async () => {
      const updateMock = mockInstitucion({ nombre: 'Centro Vida', activa: true, verificada: false })

      const res = await service.subirDocumentoVerificacion('inst-1', 'csf', archivo)

      expect(storageMock.upload).toHaveBeenCalledWith(archivo.buffer, 'csf.pdf', 'instituciones')
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
        documentoCsf: 'https://storage.googleapis.com/raices-bucket/instituciones/csf.pdf',
        fechaDocumentoCsf: expect.any(String),
      }))
      expect(res.tipo).toBe('csf')
      expect(res.estado).toBe('pendiente')
      expect(res.urlDocumento).toContain('csf.pdf')
    })

    it('should upload the optional representative identification without requiring CURP', async () => {
      mockInstitucion({ nombre: 'Centro Vida', activa: true })

      const res = await service.subirDocumentoVerificacion('inst-1', 'identificacion_representante', archivo)

      expect(usersMock.subirDocumentoIdentidad).toHaveBeenCalledWith('inst-1', 'identificacion_oficial', archivo)
      expect(res.tipo).toBe('identificacion_representante')
      expect(res.estado).toBe('pendiente')
      expect(res.urlDocumento).toContain('ine.pdf')
    })

    it('should throw BadRequestException when no file is provided', async () => {
      mockInstitucion({ nombre: 'Centro Vida', activa: true })

      await expect(service.subirDocumentoVerificacion('inst-1', 'csf', undefined as any)).rejects.toThrow(BadRequestException)
      expect(storageMock.upload).not.toHaveBeenCalled()
    })

    it('should throw NotFoundException when the user has no institution', async () => {
      mockInstitucion(null)

      await expect(service.subirDocumentoVerificacion('ghost', 'csf', archivo)).rejects.toThrow(NotFoundException)
    })
  })
})

// ── Sanitización XSS del DTO de actualización ───────────────────────────

describe('UpdateInstitucionDto (sanitización XSS)', () => {
  it('should sanitize HTML in nombre and descripcion via @Transform', () => {
    const dto = plainToInstance(UpdateInstitucionDto, {
      nombre: '<script>alert("xss")</script>',
      descripcion: "Texto con <b>negritas</b> y comillas '",
    })

    expect(dto.nombre).not.toContain('<')
    expect(dto.nombre).not.toContain('>')
    // <b> → &lt;b&gt;  |  </b> → &lt;&#x2F;b&gt;  |  ' → &#x27;
    expect(dto.descripcion).toBe(
      'Texto con &lt;b&gt;negritas&lt;&#x2F;b&gt; y comillas &#x27;'
    )
  })

  it('should not alter values without HTML special characters', () => {
    const dto = plainToInstance(UpdateInstitucionDto, {
      nombre: 'Centro de Rehabilitación DIF Mérida',
      ciudad: 'Mérida',
    })

    expect(dto.nombre).toBe('Centro de Rehabilitación DIF Mérida')
    expect(dto.ciudad).toBe('Mérida')
  })
})
