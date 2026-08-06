import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { JobsService } from './jobs.service'
import { FIRESTORE } from '../../database/firebase.provider'

// ─── Mock helpers ────────────────────────────────────────────────────────

function mockDoc(data: Record<string, any> | null, exists = true, docId = 'mock-doc-id') {
  return {
    exists,
    id: docId,
    data: () => data,
    ref: { update: jest.fn().mockResolvedValue(undefined) },
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

// ─── Tests ───────────────────────────────────────────────────────────────

describe('JobsService', () => {
  let service: JobsService
  let firestoreMock: Record<string, any>

  beforeEach(async () => {
    firestoreMock = { collection: jest.fn() }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: FIRESTORE, useValue: firestoreMock },
      ],
    }).compile()

    service = module.get<JobsService>(JobsService)
  })

  // ── findAll ─────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return active vacancies with institution data', async () => {
      const vacantes = [
        { id: 'v1', titulo: 'Terapeuta', activa: true, institucionId: 'inst1', fechaCreacion: '2024-01-02' },
        { id: 'v2', titulo: 'Psicólogo', activa: true, institucionId: 'inst1', fechaCreacion: '2024-01-01' },
      ]
      const instData = { id: 'inst1', nombre: 'Centro Test', activa: true, verificada: true }

      const vacantesSnap = { docs: vacantes.map(v => ({ id: v.id, data: () => v })), size: vacantes.length }
      const instSnap = { docs: [{ id: 'inst1', data: () => instData }], empty: false, size: 1 }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(vacantesSnap) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [{ id: 'inst1', data: () => instData }], size: 1 }) })

      const result = await service.findAll()

      expect(result.datos).toHaveLength(2)
      expect(result.total).toBe(2)
      expect(result.pagina).toBe(1)
      expect(result.limite).toBe(20)
      expect(result.totalPaginas).toBe(1)
      expect(result.datos[0].nombreInstitucion).toBe('Centro Test')
    })

    it('should filter by ciudad', async () => {
      const vacantes = [
        { id: 'v1', titulo: 'A', activa: true, institucionId: 'inst1', ciudad: 'Mérida', fechaCreacion: '2024-01-01' },
        { id: 'v2', titulo: 'B', activa: true, institucionId: 'inst1', ciudad: 'Cancún', fechaCreacion: '2024-01-01' },
      ]

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: vacantes.map(v => ({ id: v.id, data: () => v })), size: 2 }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [{ id: 'inst1', data: () => ({ id: 'inst1', nombre: 'C', activa: true, verificada: true }) }], size: 1 }) })

      const result = await service.findAll({ ciudad: 'Mérida' })

      expect(result.datos).toHaveLength(1)
      expect(result.datos[0].ciudad).toBe('Mérida')
    })

    it('should return empty array when no active vacancies', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [] as never[], size: 0 }) })

      const result = await service.findAll()
      expect(result.datos).toHaveLength(0)
      expect(result.total).toBe(0)
    })

    it('should filter out vacancies from inactive institutions', async () => {
      const vacantes = [
        { id: 'v1', titulo: 'A', activa: true, institucionId: 'inst1', fechaCreacion: '2024-01-01' },
      ]

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: vacantes.map(v => ({ id: v.id, data: () => v })), size: 1 }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [{ id: 'inst1', data: () => ({ id: 'inst1', activa: false, verificada: true }) }], size: 1 }) })

      const result = await service.findAll()
      expect(result.datos).toHaveLength(0)
    })

    it('should filter out vacancies from unverified institutions', async () => {
      const vacantes = [
        { id: 'v1', titulo: 'A', activa: true, institucionId: 'inst1', fechaCreacion: '2024-01-01' },
      ]

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: vacantes.map(v => ({ id: v.id, data: () => v })), size: 1 }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [{ id: 'inst1', data: () => ({ id: 'inst1', activa: true, verificada: false }) }], size: 1 }) })

      const result = await service.findAll()
      expect(result.datos).toHaveLength(0)
    })
  })

  // ── findOne ─────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return vacancy with institution data', async () => {
      const vacante = { id: 'v1', titulo: 'Terapeuta', institucionId: 'inst1' }
      const inst = { nombre: 'Centro', ciudad: 'Mérida', verificada: true }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(vacante, true, 'v1')) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(inst, true, 'inst1')) }) })

      const result = await service.findOne('v1')

      expect(result.titulo).toBe('Terapeuta')
      expect(result.nombreInstitucion).toBe('Centro')
    })

    it('should throw NotFoundException when vacancy does not exist', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }) })

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException)
    })
  })

  // ── apply ───────────────────────────────────────────────────────────

  describe('apply', () => {
    it('should create a postulation successfully', async () => {
      const vacanteDoc = mockDoc({ id: 'v1', activa: true }, true, 'v1')
      const emptySnap = { empty: true, docs: [] as never[], size: 0 }
      const postulacionDoc = { id: 'p1', set: jest.fn().mockResolvedValue(undefined) }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(vacanteDoc) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(emptySnap) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue(postulacionDoc) })

      const result = await service.apply('user1', 'v1', 'Carta de presentación')

      expect(result.id).toBeDefined()
      expect(result.estado).toBe('pendiente')
      expect(postulacionDoc.set).toHaveBeenCalled()
    })

    it('should throw NotFoundException when vacancy does not exist', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }) })

      await expect(service.apply('user1', 'nonexistent', '')).rejects.toThrow(NotFoundException)
    })

    it('should throw ConflictException when already applied', async () => {
      const vacanteDoc = mockDoc({ id: 'v1', activa: true }, true, 'v1')
      const existingSnap = { empty: false, docs: [{ id: 'existing' }], size: 1 }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(vacanteDoc) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(existingSnap) })

      await expect(service.apply('user1', 'v1', '')).rejects.toThrow(ConflictException)
    })
  })

  // ── getAppliedJobIds ────────────────────────────────────────────────

  describe('getAppliedJobIds', () => {
    it('should return array of vacancy IDs', async () => {
      const snap = {
        docs: [
          { data: () => ({ vacanteId: 'v1' }) },
          { data: () => ({ vacanteId: 'v2' }) },
        ],
      }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap) })

      const result = await service.getAppliedJobIds('user1')
      expect(result).toEqual(['v1', 'v2'])
    })
  })

  // ── createForUser ───────────────────────────────────────────────────

  describe('createForUser', () => {
    it('should create vacancy for institution user', async () => {
      const instSnap = { empty: false, docs: [{ id: 'inst1', data: () => ({}) }] }
      const chainable = { where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(instSnap) }
      const vacanteSet = jest.fn().mockResolvedValue(undefined)
      const vacanteGet = jest.fn().mockResolvedValue(mockDoc({ titulo: 'Test', institucionId: 'inst1' }, true, 'new-id'))
      const instGet = jest.fn().mockResolvedValue(mockDoc({ nombre: 'Centro', activa: true, ciudad: 'Mérida', verificada: true }, true, 'inst1'))

      // 1) createForUser -> where().limit().get() to find institution by creadoPor
      // 2) createJob -> doc(inst1).get() to validate institution approval
      // 3) createJob -> doc().set() to create vacancy
      // 4) findOne -> doc().get() to read vacancy back
      // 5) findOne -> doc().get() to read institution data
      firestoreMock.collection
        .mockReturnValueOnce(chainable)
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: instGet }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ set: vacanteSet, get: vacanteGet }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: vacanteGet }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: instGet }) })

      const result = await service.createForUser({ id: 'user1', rol: 'institucion' }, { titulo: 'Test' })
      expect(result.titulo).toBe('Test')
    })

    it('should throw ForbiddenException for non-institution users', async () => {
      await expect(service.createForUser({ id: 'user1', rol: 'pcd' }, { titulo: 'Test' })).rejects.toThrow(ForbiddenException)
    })

    it('should throw NotFoundException when institution user has no institution', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ empty: true, docs: [] as never[] }) })

      await expect(service.createForUser({ id: 'user1', rol: 'institucion' }, { titulo: 'Test' })).rejects.toThrow(NotFoundException)
    })

    it('should throw ForbiddenException when the institution is not approved (verificada false)', async () => {
      const instSnap = { empty: false, docs: [{ id: 'inst1', data: () => ({}) }] }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(instSnap) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc({ activa: true, verificada: false }, true, 'inst1')) }) })

      await expect(service.createForUser({ id: 'user1', rol: 'institucion' }, { titulo: 'Test' }))
        .rejects.toThrow('La institución debe estar aprobada por un administrador para publicar vacantes')
    })

    it('should throw ForbiddenException when the institution is inactive', async () => {
      const instSnap = { empty: false, docs: [{ id: 'inst1', data: () => ({}) }] }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(instSnap) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc({ activa: false, verificada: true }, true, 'inst1')) }) })

      await expect(service.createForUser({ id: 'user1', rol: 'institucion' }, { titulo: 'Test' }))
        .rejects.toThrow('La institución se encuentra inactiva')
    })

    it('should throw NotFoundException when the admin references a nonexistent institution', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false, 'ghost')) }) })

      await expect(service.createForUser({ id: 'admin1', rol: 'admin' }, { titulo: 'Test', institucionId: 'ghost' }))
        .rejects.toThrow(NotFoundException)
    })
  })

  // ── update ───────────────────────────────────────────────────────

  describe('update', () => {
    it('should update vacancy when user is institution owner', async () => {
      const vacanteDoc = mockDoc({ id: 'v1', institucionId: 'inst1', titulo: 'Old' }, true, 'v1')
      const instSnap = { empty: false, docs: [{ id: 'inst1', data: () => ({}) }] }
      const instDoc = mockDoc({ nombre: 'Centro', activa: true, verificada: true }, true, 'inst1')

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(vacanteDoc), update: jest.fn().mockResolvedValue(undefined) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(instSnap) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(vacanteDoc) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(instDoc) }) })

      const result = await service.update('v1', { id: 'user1', rol: 'institucion' } as any, { titulo: 'New Title' })
      expect(result).toBeDefined()
    })

    it('should allow admin to update any vacancy', async () => {
      const vacanteDoc = mockDoc({ id: 'v1', institucionId: 'inst1', titulo: 'Old' }, true, 'v1')
      const instDoc = mockDoc({ nombre: 'Centro', activa: true, verificada: true }, true, 'inst1')

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(vacanteDoc), update: jest.fn().mockResolvedValue(undefined) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(vacanteDoc) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(instDoc) }) })

      const result = await service.update('v1', { id: 'admin1', rol: 'admin' } as any, { titulo: 'Admin Update' })
      expect(result).toBeDefined()
    })

    it('should throw NotFoundException when vacancy does not exist', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }) })

      await expect(service.update('nonexistent', { id: 'user1', rol: 'institucion' } as any, { titulo: 'X' })).rejects.toThrow(NotFoundException)
    })

    it('should throw ForbiddenException when user does not own vacancy', async () => {
      const vacanteDoc = mockDoc({ id: 'v1', institucionId: 'inst2' }, true, 'v1')
      const instSnap = { empty: false, docs: [{ id: 'inst1', data: () => ({}) }] }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(vacanteDoc) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(instSnap) })

      await expect(service.update('v1', { id: 'user1', rol: 'institucion' } as any, { titulo: 'X' })).rejects.toThrow(ForbiddenException)
    })
  })

  // ── remove ───────────────────────────────────────────────────────

  describe('remove', () => {
    it('should deactivate vacancy when user is owner', async () => {
      const vacanteDoc = mockDoc({ id: 'v1', institucionId: 'inst1' }, true, 'v1')
      const instSnap = { empty: false, docs: [{ id: 'inst1', data: () => ({}) }] }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(vacanteDoc), update: jest.fn().mockResolvedValue(undefined) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(instSnap) })

      const result = await service.remove('v1', { id: 'user1', rol: 'institucion' } as any)
      expect(result.eliminado).toBe(true)
    })

    it('should throw NotFoundException when vacancy does not exist', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }) })

      await expect(service.remove('nonexistent', { id: 'user1', rol: 'institucion' } as any)).rejects.toThrow(NotFoundException)
    })
  })
})
