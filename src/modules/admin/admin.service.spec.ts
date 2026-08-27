import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, BadRequestException } from '@nestjs/common'
import { AdminService } from './admin.service'
import { FIRESTORE } from '../../database/firebase.provider'
import { NotificationsService } from '../notifications/notifications.service'
import { EmailService } from '../email/email.service'
import { StorageService } from '../storage/storage.service'

function mockDoc(data: Record<string, any> | null, exists = true, docId = 'mock-doc-id') {
  return {
    exists,
    id: docId,
    data: () => data,
    ref: { delete: jest.fn().mockResolvedValue(undefined), update: jest.fn().mockResolvedValue(undefined) },
  }
}

function chainCollection(opts: {
  docResult?: any
  whereResult?: { empty: boolean; docs: any[]; size: number }
} = {}) {
  const { docResult = mockDoc(null, false), whereResult = { empty: true, docs: [] as never[], size: 0 } } = opts
  return {
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(docResult),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    }),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue(whereResult),
  }
}

describe('AdminService', () => {
  let service: AdminService
  let firestoreMock: any
  let emailMock: { sendInstitutionApproved: jest.Mock }
  let storageMock: { delete: jest.Mock }

  beforeEach(async () => {
    storageMock = { delete: jest.fn().mockResolvedValue(undefined) }
    emailMock = { sendInstitutionApproved: jest.fn().mockResolvedValue(undefined) }
    firestoreMock = { collection: jest.fn(), batch: jest.fn() }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: FIRESTORE, useValue: firestoreMock },
        { provide: NotificationsService, useValue: {} },
        { provide: EmailService, useValue: emailMock },
        { provide: StorageService, useValue: storageMock },
      ],
    }).compile()

    service = module.get<AdminService>(AdminService)
  })

  function chainableSnap(docs: any[], empty = false) {
    return { empty, docs, size: docs.length }
  }

  // ── getStats ────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('should return aggregated stats', async () => {
      const emptySnap = { size: 0, docs: [] as never[], empty: true }
      const resenasSnap = {
        size: 3, empty: false,
        docs: [{ data: () => ({ calificacion: 4 }) }, { data: () => ({ calificacion: 5 }) }, { data: () => ({ calificacion: 3 }) }],
      }

      // 9 collection calls for getStats
      firestoreMock.collection
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue({ size: 10, docs: [] as never[] }) }) // usuarios
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ size: 8, docs: [] as never[] }) }) // activos
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue({ size: 5, docs: [] as never[] }) }) // instituciones
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ size: 3, docs: [] as never[] }) }) // verificadas
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ size: 2, docs: [] as never[] }) }) // pendientes
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue(resenasSnap) }) // resenas
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue(emptySnap) }) // publicaciones
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue(emptySnap) }) // grupos
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue({ size: 6, docs: [] as never[] }) }) // perfilesExtendidos

      const result = await service.getStats()

      expect(result.totalUsuarios).toBe(10)
      expect(result.usuariosActivos).toBe(8)
      expect(result.totalInstituciones).toBe(5)
      expect(result.totalResenas).toBe(3)
      expect(result.calificacionPromedio).toBe(4)
    })
  })

  // ── approveInstitution ──────────────────────────────────────────────

  describe('approveInstitution', () => {
    it('should approve and send email', async () => {
      const updateMock = jest.fn().mockResolvedValue(undefined)
      const getMock = jest.fn().mockResolvedValue(mockDoc({ nombre: 'Centro', emailContacto: 'c@test.com' }, true, 'inst1'))

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ update: updateMock, get: getMock }),
      })

      await service.approveInstitution('inst1')

      expect(updateMock).toHaveBeenCalledWith({ verificada: true, activa: true })
      expect(emailMock.sendInstitutionApproved).toHaveBeenCalledWith('c@test.com', 'Centro')
    })
  })

  // ── rejectInstitution ───────────────────────────────────────────────

  describe('rejectInstitution', () => {
    it('should delete the institution and its vacancies atomically', async () => {
      const vacantesSnap = { empty: false, docs: [{ ref: { id: 'v1' } }, { ref: { id: 'v2' } }], size: 2 }
      const batch = { delete: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) }
      firestoreMock.batch.mockReturnValue(batch)

      firestoreMock.collection.mockImplementation((name: string) => {
        if (name === 'vacantes') {
          return { where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(vacantesSnap) }
        }
        if (name === 'instituciones') {
          return { doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }) }
        }
        return {}
      })

      await service.rejectInstitution('inst1')

      expect(batch.commit).toHaveBeenCalled()
      // 2 vacantes + 1 institución
      expect(batch.delete).toHaveBeenCalledTimes(3)
    })

    it('should deactivate the linked user profile when rejecting a registered institution', async () => {
      const instDoc = mockDoc({ usuarioId: 'user-inst', nombre: 'Centro' }, true, 'inst1')
      const profileUpdate = jest.fn().mockResolvedValue(undefined)
      const batch = { delete: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) }
      firestoreMock.batch.mockReturnValue(batch)

      firestoreMock.collection.mockImplementation((name: string) => {
        if (name === 'instituciones') {
          return { doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(instDoc) }) }
        }
        if (name === 'vacantes') {
          return { where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ empty: true, docs: [] as never[], size: 0 }) }
        }
        if (name === 'perfiles') {
          return { doc: jest.fn().mockReturnValue({ update: profileUpdate }) }
        }
        return {}
      })

      await service.rejectInstitution('inst1')

      expect(profileUpdate).toHaveBeenCalledWith({ activo: false })
      expect(batch.commit).toHaveBeenCalled()
    })
  })

  // ── toggleVerifyInstitution ─────────────────────────────────────────

  describe('toggleVerifyInstitution', () => {
    it('should toggle verification from false to true', async () => {
      const docData = { verificada: false }
      const docSnapshot = mockDoc(docData, true, 'inst1')
      const updateMock = docSnapshot.ref.update

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(docSnapshot) }),
      })

      const result = await service.toggleVerifyInstitution('inst1')
      expect(result.verificada).toBe(true)
      expect(updateMock).toHaveBeenCalledWith({ verificada: true })
    })

    it('should throw NotFoundException when institution does not exist', async () => {
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }),
      })

      await expect(service.toggleVerifyInstitution('nonexistent')).rejects.toThrow(NotFoundException)
    })
  })

  // ── getUsers ────────────────────────────────────────────────────────

  describe('getUsers', () => {
    it('should return list of users', async () => {
      const users = [
        { id: 'u1', data: () => ({ email: 'a@test.com', nombreCompleto: 'A', rol: 'pcd', activo: true }) },
        { id: 'u2', data: () => ({ email: 'b@test.com', nombreCompleto: 'B', rol: 'padre_tutor', activo: false }) },
      ]

      firestoreMock.collection.mockReturnValue({
        orderBy: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: users }),
      })

      const result = await service.getUsers()
      expect(result.datos).toHaveLength(2)
      expect(result.total).toBe(2)
      expect(result.datos[0].email).toBe('a@test.com')
    })
  })

  // ── toggleUserActive ────────────────────────────────────────────────

  describe('toggleUserActive', () => {
    it('should toggle active from true to false', async () => {
      const docSnapshot = mockDoc({ activo: true }, true, 'u1')
      const updateMock = docSnapshot.ref.update

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(docSnapshot) }),
      })

      const result = await service.toggleUserActive('u1', 'admin-1')
      expect(result.activo).toBe(false)
      expect(updateMock).toHaveBeenCalledWith({ activo: false })
    })

    it('should throw BadRequestException when toggling own account', async () => {
      await expect(service.toggleUserActive('admin-1', 'admin-1')).rejects.toThrow(BadRequestException)
    })

    it('should throw NotFoundException when user does not exist', async () => {
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }),
      })

      await expect(service.toggleUserActive('nonexistent', 'admin-1')).rejects.toThrow(NotFoundException)
    })
  })

  // ── changeUserRole ──────────────────────────────────────────────────

  describe('changeUserRole', () => {
    it('should change user role', async () => {
      const docSnapshot = mockDoc({ rol: 'pcd' }, true, 'u1')
      const updateMock = docSnapshot.ref.update

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(docSnapshot) }),
      })

      const result = await service.changeUserRole('u1', 'admin', 'admin-1')
      expect(result.rol).toBe('admin')
      expect(updateMock).toHaveBeenCalledWith({ rol: 'admin' })
    })

    it('should throw BadRequestException when changing own role', async () => {
      await expect(service.changeUserRole('admin-1', 'pcd', 'admin-1')).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException for invalid role', async () => {
      await expect(service.changeUserRole('u1', 'hacker', 'admin-1')).rejects.toThrow(BadRequestException)
    })

    it('should throw NotFoundException when user does not exist', async () => {
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }),
      })

      await expect(service.changeUserRole('nonexistent', 'admin', 'admin-1')).rejects.toThrow(NotFoundException)
    })
  })

  // ── deleteUser ──────────────────────────────────────────────────────

  describe('deleteUser', () => {
    it('should delete user and clean up related data', async () => {
      const gcsUrl = 'https://firebasestorage.googleapis.com/v0/b/raices.appspot.com/o/avatars%2Fphoto.jpg?alt=media'
      const perfilDoc = {
        exists: true, id: 'user1',
        data: () => ({ id: 'user1', urlAvatar: gcsUrl }),
        ref: { delete: jest.fn().mockResolvedValue(undefined) },
      }
      const batch = { delete: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) }

      firestoreMock.collection.mockReturnValue(chainCollection({ docResult: perfilDoc }))
      firestoreMock.batch.mockReturnValue(batch)

      await service.deleteUser('user1', 'admin-1')

      expect(storageMock.delete).toHaveBeenCalledWith('avatars/photo.jpg')
      expect(perfilDoc.ref.delete).toHaveBeenCalled()
    })

    it('should throw BadRequestException when deleting own account', async () => {
      await expect(service.deleteUser('admin-1', 'admin-1')).rejects.toThrow(BadRequestException)
    })

    it('should throw NotFoundException when user does not exist', async () => {
      firestoreMock.collection.mockReturnValue(chainCollection({ docResult: mockDoc(null, false) }))
      await expect(service.deleteUser('nonexistent', 'admin-1')).rejects.toThrow(NotFoundException)
    })

    it('should cascade-delete institution docs and vacancies when deleting an institution user', async () => {
      const perfilDoc = {
        exists: true, id: 'inst-user',
        data: () => ({ id: 'inst-user', rol: 'institucion' }),
        ref: { delete: jest.fn().mockResolvedValue(undefined) },
      }
      const canonicalInst = { exists: true, id: 'inst-user', ref: { delete: jest.fn() } }
      const vacanteDoc = { ref: { id: 'v1' } }
      const vacantesSnap = { empty: false, docs: [vacanteDoc], size: 1 }
      const batch = { delete: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) }
      firestoreMock.batch.mockReturnValue(batch)

      firestoreMock.collection.mockImplementation((name: string) => {
        if (name === 'perfiles') {
          return { doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(perfilDoc) }) }
        }
        if (name === 'instituciones') {
          return {
            doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(canonicalInst) }),
            where: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] as never[], size: 0 }),
          }
        }
        if (name === 'vacantes') {
          return { where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(vacantesSnap) }
        }
        return chainCollection()
      })

      await service.deleteUser('inst-user', 'admin-1')

      expect(perfilDoc.ref.delete).toHaveBeenCalled()
      expect(batch.commit).toHaveBeenCalled()
      expect(batch.delete).toHaveBeenCalledWith(vacanteDoc.ref)
    })
  })

  // ── deleteReview ────────────────────────────────────────────────────

  describe('deleteReview', () => {
    it('should delete review and recalculate rating', async () => {
      const reviewDoc = mockDoc({ institucionId: 'inst1', calificacion: 5 }, true, 'r1')
      const remainingReviews = { empty: false, size: 2, docs: [{ data: () => ({ calificacion: 4 }) }, { data: () => ({ calificacion: 3 }) }] }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(reviewDoc) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(remainingReviews) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ update: jest.fn().mockResolvedValue(undefined) }) })

      await service.deleteReview('r1')

      expect(reviewDoc.ref.delete).toHaveBeenCalled()
    })

    it('should set rating to 0 when no reviews remain', async () => {
      const reviewDoc = mockDoc({ institucionId: 'inst1', calificacion: 3 }, true, 'r1')
      const emptyReviews = { empty: true, size: 0, docs: [] as never[] }
      const updateMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(reviewDoc) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(emptyReviews) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ update: updateMock }) })

      await service.deleteReview('r1')

      expect(updateMock).toHaveBeenCalledWith({ calificacionPromedio: 0, cantidadCalificaciones: 0 })
    })

    it('should throw NotFoundException when review does not exist', async () => {
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }),
      })

      await expect(service.deleteReview('nonexistent')).rejects.toThrow(NotFoundException)
    })
  })

  // ── getSettings ─────────────────────────────────────────────────────

  describe('getSettings', () => {
    it('should return defaults merged with stored settings', async () => {
      const storedSettings = { docs: [{ data: () => ({ clave: 'ciudadPorDefecto', valor: 'Cancún' }) }] }

      firestoreMock.collection.mockReturnValue({
        get: jest.fn().mockResolvedValue(storedSettings),
      })

      const result = await service.getSettings()
      expect(result.ciudadPorDefecto).toBe('Cancún')
      expect(result.nombrePlataforma).toBe('Raíces para Florecer') // default
    })
  })

  // ── updateSettings ──────────────────────────────────────────────────

  describe('updateSettings', () => {
    it('should update existing setting', async () => {
      const existingSnap = { empty: false, docs: [{ ref: { update: jest.fn().mockResolvedValue(undefined) } }] }
      const updatedSnap = { docs: [{ data: () => ({ clave: 'ciudadPorDefecto', valor: 'GDL' }) }] }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(existingSnap) })
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue(updatedSnap) })

      const result = await service.updateSettings({ ciudadPorDefecto: 'GDL' })
      expect(result.ciudadPorDefecto).toBe('GDL')
    })

    it('should ignore unknown keys', async () => {
      const emptySnap = { docs: [] as never[] }

      firestoreMock.collection.mockReturnValue({
        get: jest.fn().mockResolvedValue(emptySnap),
      })

      await service.updateSettings({ unknownKey: 'value' })
      // Should not throw and should call getSettings
    })
  })

  // ── getActiveVisitors ────────────────────────────────────────────────

  describe('getActiveVisitors', () => {
    beforeEach(() => {
      jest.restoreAllMocks()
    })

    it('should calculate metrics from real session data with Spanish camelCase properties', async () => {
      const ahora = 1_700_000_000_000
      jest.spyOn(Date, 'now').mockReturnValue(ahora)

      // Create session timestamps at known offsets
      // 3 sessions in last 5 min -> live=3
      // 10 sessions total in last 24h -> avgDaily=10
      // 24 sessions in last week (includes the 10 from day) -> avgWeekly = round(24/7) = 3
      // Sessions older than a week count for monthly
      const sesiones = [
        // 3 in last 5 min
        { timestamp: ahora - 60_000 },
        { timestamp: ahora - 120_000 },
        { timestamp: ahora - 180_000 },
        // 7 more in last 24h (but outside 5 min)
        { timestamp: ahora - 600_000 },
        { timestamp: ahora - 1_800_000 },
        { timestamp: ahora - 3_600_000 },
        { timestamp: ahora - 7_200_000 },
        { timestamp: ahora - 14_400_000 },
        { timestamp: ahora - 21_600_000 },
        { timestamp: ahora - 43_200_000 },
        // 14 more in last week (but outside 24h)
        ...Array.from({ length: 14 }, (_, i) => ({ timestamp: ahora - (2 + i) * 86_400_000 })),
        // 30 more in last month (but outside week)
        ...Array.from({ length: 30 }, (_, i) => ({ timestamp: ahora - (16 + i) * 86_400_000 })),
      ]

      const analiticasSnap = {
        empty: false,
        docs: sesiones.map((s, i) => ({ id: `s${i}`, data: () => s })),
        size: sesiones.length,
      }

      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(analiticasSnap),
      })

      const result = await service.getActiveVisitors()

      expect(result).toHaveProperty('personasActivas')
      expect(result).toHaveProperty('promedioDiario')
      expect(result).toHaveProperty('promedioSemanal')
      expect(result).toHaveProperty('promedioMensual')
      expect(result).toHaveProperty('historialMinutos')

      expect(result.personasActivas).toBe(3)
      expect(result.promedioDiario).toBe(10)
      // 15 sessions in last week (3 last5min + 7 last24h + 5 from the '14' that fall within 7 days)
      // round(15/7) = round(2.14) = 2
      expect(result.promedioSemanal).toBe(2)
      // All 54 sessions count for monthly: round(54/30) = round(1.8) = 2
      expect(result.promedioMensual).toBe(2)
      expect(result.historialMinutos).toHaveLength(13)
    })

    it('should fall back to estimation when analytics snap is empty, returning Spanish camelCase properties', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5)

      const emptyAnaliticas = { empty: true, docs: [] as never[], size: 0 }
      const usuariosSnap = {
        size: 100,
        docs: Array.from({ length: 60 }, (_, i) => ({
          id: `u${i}`,
          data: () => ({ activo: true }),
        })),
      }
      const perfilesExtendidosSnap = { size: 40, docs: [] as never[], empty: false }

      firestoreMock.collection
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(emptyAnaliticas),
        })
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue(usuariosSnap) })  // perfiles
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue(perfilesExtendidosSnap) }) // perfilesExtendidos

      const result = await service.getActiveVisitors()

      expect(result).toHaveProperty('personasActivas')
      expect(result).toHaveProperty('promedioDiario')
      expect(result).toHaveProperty('promedioSemanal')
      expect(result).toHaveProperty('promedioMensual')
      expect(result).toHaveProperty('historialMinutos')

      expect(typeof result.personasActivas).toBe('number')
      expect(typeof result.promedioDiario).toBe('number')
      expect(typeof result.promedioSemanal).toBe('number')
      expect(typeof result.promedioMensual).toBe('number')
      expect(Array.isArray(result.historialMinutos)).toBe(true)
      expect(result.historialMinutos).toHaveLength(13)

      // With 60 active users, 40 extended profiles, and random=0.5:
      // proporcionActivos = 60/100 = 0.6
      // proporcionCompletaronPerfil = 40/100 = 0.4
      // live = max(1, round(60 * 0.05 * 0.4)) = max(1, round(1.2)) = 1
      expect(result.personasActivas).toBe(1)
      expect(result.promedioDiario).toBeGreaterThanOrEqual(1)
      expect(result.historialMinutos.every((v: number) => v >= 0)).toBe(true)
    })

    it('should fall back when analytics query throws an error', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5)

      // collection throws for the analytics query
      firestoreMock.collection
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockRejectedValue(new Error('Firestore error')),
        })
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue({ size: 50, docs: Array.from({ length: 30 }, () => ({ data: () => ({ activo: true }) })) }) })  // perfiles
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue({ size: 20, docs: [] as never[] }) }) // perfilesExtendidos

      const result = await service.getActiveVisitors()

      expect(result).toHaveProperty('personasActivas')
      expect(result).toHaveProperty('promedioDiario')
      expect(result).toHaveProperty('promedioSemanal')
      expect(result).toHaveProperty('promedioMensual')
      expect(result).toHaveProperty('historialMinutos')
      expect(result.historialMinutos).toHaveLength(13)
    })
  })

  // ── getAlerts ───────────────────────────────────────────────────────

  describe('getAlerts', () => {
    it('should return alerts for critical ratings', async () => {
      const insts = [{ id: 'inst1', activa: true, nombre: 'Centro Mala', calificacionPromedio: 1.5, cantidadCalificaciones: 5, verificada: true }]
      const users = [{ id: 'u1', activo: true }]
      const reviews = [{ id: 'r1', calificacion: 1 }]

      firestoreMock.collection
        .mockReturnValueOnce({ limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: insts.map(i => ({ id: i.id, data: () => i })) }) })
        .mockReturnValueOnce({ limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: users.map(u => ({ id: u.id, data: () => u })) }) })
        .mockReturnValueOnce({ limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: reviews.map(r => ({ id: r.id, data: () => r })) }) })
        .mockReturnValueOnce({ limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [] as never[], size: 0 }) }) // perfilesExtendidos
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ empty: true }) }) // mant mode

      const result = await service.getAlerts()
      expect(result.some(a => a.tipo === 'rating_risk')).toBe(true)
    })

    it('should return no critical alerts when everything is healthy', async () => {
      // Provide institutions covering all disability types, verified, with good ratings
      const insts = [{ id: 'inst1', activa: true, nombre: 'Centro', verificada: true, calificacionPromedio: 4.5, cantidadCalificaciones: 10, tiposDiscapacidad: '["tea","motriz","visual","auditiva","intelectual","psicosocial","m\u00faltiple","lenguaje"]' }]
      const users = [{ id: 'u1', activo: true, fechaCreacion: '2023-01-01' }]
      const reviews = [{ id: 'r1', calificacion: 5 }]

      firestoreMock.collection
        .mockReturnValueOnce({ limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: insts.map(i => ({ id: i.id, data: () => i })) }) })
        .mockReturnValueOnce({ limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: users.map(u => ({ id: u.id, data: () => u })) }) })
        .mockReturnValueOnce({ limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: reviews.map(r => ({ id: r.id, data: () => r })) }) })
        .mockReturnValueOnce({ limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [{ data: () => ({ usuarioId: 'u1' }) }], size: 1 }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ empty: true }) })

      const result = await service.getAlerts()
      expect(result).toHaveLength(0)
    })
  })
})
