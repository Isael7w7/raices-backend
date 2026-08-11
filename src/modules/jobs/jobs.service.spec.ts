import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { JobsService } from './jobs.service'
import { FIRESTORE } from '../../database/firebase.provider'
import { NotificationsService } from '../notifications/notifications.service'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { FEATURES_POR_DEFECTO } from '../../common/interfaces/feature-flags.interface'

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

// ─── Mock CurrentUserPayload helper ────────────────────────────────────

function mockUser(overrides: Partial<CurrentUserPayload> = {}): CurrentUserPayload {
  return {
    id: 'user1',
    email: 'test@test.com',
    rol: 'institucion',
    nombreCompleto: 'Test User',
    verificado: true,
    features: { ...FEATURES_POR_DEFECTO },
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('JobsService', () => {
  let service: JobsService
  let firestoreMock: Record<string, any>

  let mockNotif: Record<string, any>

  beforeEach(async () => {
    firestoreMock = { collection: jest.fn() }
    mockNotif = { crear: jest.fn().mockResolvedValue(undefined) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: FIRESTORE, useValue: firestoreMock },
        { provide: NotificationsService, useValue: mockNotif },
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

  // ── postulantesDeMiInstitucion ───────────────────────────────────────

  describe('postulantesDeMiInstitucion', () => {
    it('should return applicants of the user institution with profile and vacancy data', async () => {
      const instSnap = { empty: false, docs: [{ id: 'inst1', data: () => ({}) }] }
      const vacantesSnap = {
        docs: [
          { id: 'v1', data: () => ({ id: 'v1', titulo: 'Terapeuta', modalidad: 'presencial', institucionId: 'inst1' }) },
        ],
        size: 1,
      }
      const postulacionesSnap = {
        docs: [
          { id: 'p1', data: () => ({ id: 'p1', vacanteId: 'v1', usuarioId: 'user1', cartaPresentacion: 'Hola', estado: 'pendiente', fechaCreacion: '2024-01-02' }) },
        ],
        size: 1,
      }
      const perfilesSnap = {
        docs: [
          { id: 'user1', data: () => ({ nombreCompleto: 'María Pérez', email: 'maria@correo.mx', urlAvatar: 'https://foto.png' }) },
        ],
        size: 1,
      }

      const chainable = (resultado: any) => ({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(resultado) })

      firestoreMock.collection
        .mockReturnValueOnce(chainable(instSnap))
        .mockReturnValueOnce(chainable(vacantesSnap))
        .mockReturnValueOnce(chainable(postulacionesSnap))
        .mockReturnValueOnce(chainable(perfilesSnap))

      const result = await service.postulantesDeMiInstitucion(mockUser({ id: 'owner1', rol: 'institucion' }))

      expect(result.total).toBe(1)
      expect(result.datos[0]).toMatchObject({
        id: 'p1',
        vacanteId: 'v1',
        tituloVacante: 'Terapeuta',
        modalidad: 'presencial',
        nombrePostulante: 'María Pérez',
        emailPostulante: 'maria@correo.mx',
        cartaPresentacion: 'Hola',
        estado: 'pendiente',
      })
    })

    it('should throw NotFoundException when institution user has no institution', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ empty: true, docs: [] as never[] }) })

      await expect(service.postulantesDeMiInstitucion(mockUser({ id: 'user1', rol: 'institucion' })))
        .rejects.toThrow(NotFoundException)
    })

    it('should throw ForbiddenException for non-institution users', async () => {
      await expect(service.postulantesDeMiInstitucion(mockUser({ id: 'user1', rol: 'pcd' })))
        .rejects.toThrow(ForbiddenException)
    })

    it('should throw BadRequestException when admin omits institucionId', async () => {
      await expect(service.postulantesDeMiInstitucion(mockUser({ id: 'admin1', rol: 'admin' })))
        .rejects.toThrow(BadRequestException)
    })

    it('should return empty page when the institution has no vacancies', async () => {
      const chainable = (resultado: any) => ({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(resultado) })

      firestoreMock.collection
        .mockReturnValueOnce(chainable({ empty: false, docs: [{ id: 'inst1', data: () => ({}) }] }))
        .mockReturnValueOnce(chainable({ docs: [] as never[], size: 0 }))

      const result = await service.postulantesDeMiInstitucion(mockUser({ id: 'admin1', rol: 'admin' }), { institucionId: 'inst1' })
      expect(result.datos).toHaveLength(0)
      expect(result.total).toBe(0)
    })

    it('should filter by estado', async () => {
      const instSnap = { empty: false, docs: [{ id: 'inst1', data: () => ({}) }] }
      const vacantesSnap = {
        docs: [{ id: 'v1', data: () => ({ id: 'v1', titulo: 'A', institucionId: 'inst1' }) }],
        size: 1,
      }
      const postulacionesSnap = {
        docs: [
          { id: 'p1', data: () => ({ id: 'p1', vacanteId: 'v1', usuarioId: 'user1', estado: 'pendiente', fechaCreacion: '2024-01-01' }) },
          { id: 'p2', data: () => ({ id: 'p2', vacanteId: 'v1', usuarioId: 'user2', estado: 'aceptada', fechaCreacion: '2024-01-02' }) },
        ],
        size: 2,
      }
      const perfilesSnap = {
        docs: [
          { id: 'user1', data: () => ({ nombreCompleto: 'A' }) },
          { id: 'user2', data: () => ({ nombreCompleto: 'B' }) },
        ],
        size: 2,
      }

      const chainable = (resultado: any) => ({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(resultado) })

      firestoreMock.collection
        .mockReturnValueOnce(chainable(instSnap))
        .mockReturnValueOnce(chainable(vacantesSnap))
        .mockReturnValueOnce(chainable(postulacionesSnap))
        .mockReturnValueOnce(chainable(perfilesSnap))

      const result = await service.postulantesDeMiInstitucion(mockUser({ id: 'owner1', rol: 'institucion' }), { estado: 'aceptada' })
      expect(result.datos).toHaveLength(1)
      expect(result.datos[0].id).toBe('p2')
    })
  })

  // ── actualizarEstadoPostulacion ─────────────────────────────────────

  describe('actualizarEstadoPostulacion', () => {
    const chainable = (resultado: any) => ({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(resultado) })
    const postDoc = (estado = 'pendiente') => mockDoc({ id: 'p1', vacanteId: 'v1', usuarioId: 'user1', estado, fechaCreacion: '2024-01-01' }, true, 'p1')
    const vacanteDoc = () => mockDoc({ id: 'v1', titulo: 'Terapeuta', institucionId: 'inst1' }, true, 'v1')
    const instSnap = (instId = 'inst1') => ({ empty: false, docs: [{ id: instId, data: () => ({}) }] })

    it('should accept a postulation and notify the applicant', async () => {
      const pDoc = postDoc()
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(pDoc) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(vacanteDoc()) }) })
        .mockReturnValueOnce(chainable(instSnap()))

      const result = await service.actualizarEstadoPostulacion('p1', mockUser({ id: 'owner1', rol: 'institucion' }), { estado: 'aceptada' } as any)

      expect(result).toMatchObject({ id: 'p1', estado: 'aceptada' })
      expect(pDoc.ref.update).toHaveBeenCalledWith({ estado: 'aceptada', fechaActualizacion: expect.any(String) })
      expect(mockNotif.crear).toHaveBeenCalledWith('user1', 'postulacion_aceptada', '¡Tu postulación fue aceptada!', expect.any(String), 'p1')
    })

    it('should reject a postulation and notify the applicant', async () => {
      const pDoc = postDoc()
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(pDoc) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(vacanteDoc()) }) })
        .mockReturnValueOnce(chainable(instSnap()))

      const result = await service.actualizarEstadoPostulacion('p1', mockUser({ id: 'owner1', rol: 'institucion' }), { estado: 'rechazada' } as any)

      expect(result.estado).toBe('rechazada')
      expect(mockNotif.crear).toHaveBeenCalledWith('user1', 'postulacion_rechazada', 'Actualización de tu postulación', expect.any(String), 'p1')
    })

    it('should allow admin to change any postulation state', async () => {
      const pDoc = postDoc()
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(pDoc) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(vacanteDoc()) }) })

      const result = await service.actualizarEstadoPostulacion('p1', mockUser({ id: 'admin1', rol: 'admin' }), { estado: 'aceptada' } as any)
      expect(result.estado).toBe('aceptada')
      expect(mockNotif.crear).toHaveBeenCalled()
    })

    it('should throw NotFoundException when postulation does not exist', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }) })

      await expect(service.actualizarEstadoPostulacion('ghost', mockUser({ id: 'admin1', rol: 'admin' }), { estado: 'aceptada' } as any))
        .rejects.toThrow(NotFoundException)
    })

    it('should throw NotFoundException when the vacancy does not exist', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(postDoc()) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }) })

      await expect(service.actualizarEstadoPostulacion('p1', mockUser({ id: 'admin1', rol: 'admin' }), { estado: 'aceptada' } as any))
        .rejects.toThrow(NotFoundException)
    })

    it('should throw ForbiddenException when the user does not own the vacancy institution', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(postDoc()) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(vacanteDoc()) }) })
        .mockReturnValueOnce(chainable(instSnap('inst2')))

      await expect(service.actualizarEstadoPostulacion('p1', mockUser({ id: 'owner1', rol: 'institucion' }), { estado: 'aceptada' } as any))
        .rejects.toThrow(ForbiddenException)
    })

    it('should throw ForbiddenException when institution user has no institution', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(postDoc()) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(vacanteDoc()) }) })
        .mockReturnValueOnce(chainable({ empty: true, docs: [] as never[] }))

      await expect(service.actualizarEstadoPostulacion('p1', mockUser({ id: 'owner1', rol: 'institucion' }), { estado: 'aceptada' } as any))
        .rejects.toThrow(ForbiddenException)
    })

    it('should not notify the applicant when estado is reset to pendiente', async () => {
      const pDoc = postDoc('aceptada')
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(pDoc) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(vacanteDoc()) }) })
        .mockReturnValueOnce(chainable(instSnap()))

      const result = await service.actualizarEstadoPostulacion('p1', mockUser({ id: 'owner1', rol: 'institucion' }), { estado: 'pendiente' } as any)

      expect(result.estado).toBe('pendiente')
      expect(pDoc.ref.update).toHaveBeenCalledWith({ estado: 'pendiente', fechaActualizacion: expect.any(String) })
      expect(mockNotif.crear).not.toHaveBeenCalled()
    })

    it('should return early without update or notification when estado is unchanged', async () => {
      const pDoc = postDoc('aceptada')
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(pDoc) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(vacanteDoc()) }) })
        .mockReturnValueOnce(chainable(instSnap()))

      const result = await service.actualizarEstadoPostulacion('p1', mockUser({ id: 'owner1', rol: 'institucion' }), { estado: 'aceptada' } as any)

      expect(result.estado).toBe('aceptada')
      expect(pDoc.ref.update).not.toHaveBeenCalled()
      expect(mockNotif.crear).not.toHaveBeenCalled()
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

      const result = await service.createForUser(mockUser({ id: 'user1', rol: 'institucion' }), { titulo: 'Test' } as any)
      expect(result.titulo).toBe('Test')
    })

    it('should throw ForbiddenException for non-institution users', async () => {
      await expect(service.createForUser(mockUser({ id: 'user1', rol: 'pcd' }), { titulo: 'Test' } as any)).rejects.toThrow(ForbiddenException)
    })

    it('should throw NotFoundException when institution user has no institution', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ empty: true, docs: [] as never[] }) })

      await expect(service.createForUser(mockUser({ id: 'user1', rol: 'institucion' }), { titulo: 'Test' } as any)).rejects.toThrow(NotFoundException)
    })

    it('should throw ForbiddenException when the institution is not approved (verificada false)', async () => {
      const instSnap = { empty: false, docs: [{ id: 'inst1', data: () => ({}) }] }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(instSnap) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc({ activa: true, verificada: false }, true, 'inst1')) }) })

      await expect(service.createForUser(mockUser({ id: 'user1', rol: 'institucion' }), { titulo: 'Test' } as any))
        .rejects.toThrow('La institución debe estar aprobada por un administrador para publicar vacantes')
    })

    it('should throw ForbiddenException when the institution is inactive', async () => {
      const instSnap = { empty: false, docs: [{ id: 'inst1', data: () => ({}) }] }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(instSnap) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc({ activa: false, verificada: true }, true, 'inst1')) }) })

      await expect(service.createForUser(mockUser({ id: 'user1', rol: 'institucion' }), { titulo: 'Test' } as any))
        .rejects.toThrow('La institución se encuentra inactiva')
    })

    it('should throw NotFoundException when the admin references a nonexistent institution', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false, 'ghost')) }) })

      await expect(service.createForUser(mockUser({ id: 'admin1', rol: 'admin' }), { titulo: 'Test', institucionId: 'ghost' } as any))
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

      const result = await service.update('v1', mockUser({ id: 'user1', rol: 'institucion' }), { titulo: 'New Title' } as any)
      expect(result).toBeDefined()
    })

    it('should allow admin to update any vacancy', async () => {
      const vacanteDoc = mockDoc({ id: 'v1', institucionId: 'inst1', titulo: 'Old' }, true, 'v1')
      const instDoc = mockDoc({ nombre: 'Centro', activa: true, verificada: true }, true, 'inst1')

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(vacanteDoc), update: jest.fn().mockResolvedValue(undefined) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(vacanteDoc) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(instDoc) }) })

      const result = await service.update('v1', mockUser({ id: 'admin1', rol: 'admin' }), { titulo: 'Admin Update' } as any)
      expect(result).toBeDefined()
    })

    it('should throw NotFoundException when vacancy does not exist', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }) })

      await expect(service.update('nonexistent', mockUser({ id: 'user1', rol: 'institucion' }), { titulo: 'X' } as any)).rejects.toThrow(NotFoundException)
    })

    it('should throw ForbiddenException when user does not own vacancy', async () => {
      const vacanteDoc = mockDoc({ id: 'v1', institucionId: 'inst2' }, true, 'v1')
      const instSnap = { empty: false, docs: [{ id: 'inst1', data: () => ({}) }] }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(vacanteDoc) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(instSnap) })

      await expect(service.update('v1', mockUser({ id: 'user1', rol: 'institucion' }), { titulo: 'X' } as any)).rejects.toThrow(ForbiddenException)
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

      const result = await service.remove('v1', mockUser({ id: 'user1', rol: 'institucion' }))
      expect(result.eliminado).toBe(true)
    })

    it('should throw NotFoundException when vacancy does not exist', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }) })

      await expect(service.remove('nonexistent', mockUser({ id: 'user1', rol: 'institucion' }))).rejects.toThrow(NotFoundException)
    })
  })
})
