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
  const { docResult = mockDoc(null, false), whereResult = { empty: true, docs: [], size: 0 } } = opts
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
      const emptySnap = { size: 0, docs: [], empty: true }
      const resenasSnap = {
        size: 3, empty: false,
        docs: [{ data: () => ({ calificacion: 4 }) }, { data: () => ({ calificacion: 5 }) }, { data: () => ({ calificacion: 3 }) }],
      }

      // 9 collection calls for getStats
      firestoreMock.collection
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue({ size: 10, docs: [] }) }) // usuarios
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ size: 8, docs: [] }) }) // activos
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue({ size: 5, docs: [] }) }) // instituciones
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ size: 3, docs: [] }) }) // verificadas
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ size: 2, docs: [] }) }) // pendientes
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue(resenasSnap) }) // resenas
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue(emptySnap) }) // publicaciones
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue(emptySnap) }) // grupos
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue({ size: 6, docs: [] }) }) // perfilesExtendidos

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

      expect(updateMock).toHaveBeenCalledWith({ activa: true })
      expect(emailMock.sendInstitutionApproved).toHaveBeenCalledWith('c@test.com', 'Centro')
    })
  })

  // ── rejectInstitution ───────────────────────────────────────────────

  describe('rejectInstitution', () => {
    it('should delete the institution', async () => {
      const deleteMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ delete: deleteMock }),
      })

      await service.rejectInstitution('inst1')
      expect(deleteMock).toHaveBeenCalled()
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
        { id: 'u2', data: () => ({ email: 'b@test.com', nombreCompleto: 'B', rol: 'tutor', activo: false }) },
      ]

      firestoreMock.collection.mockReturnValue({
        orderBy: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: users }),
      })

      const result = await service.getUsers()
      expect(result).toHaveLength(2)
      expect(result[0].email).toBe('a@test.com')
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
  })

  // ── deleteReview ────────────────────────────────────────────────────

  describe('deleteReview', () => {
    it('should delete review and recalculate rating', async () => {
      const reviewDoc = mockDoc({ institucionId: 'inst1', calificacion: 5 }, true, 'r1')
      const remainingReviews = { empty: false, size: 2, docs: [{ data: () => ({ calificacion: 4 }) }, { data: () => ({ calificacion: 3 }) }] }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(reviewDoc), delete: reviewDoc.ref.delete }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(remainingReviews) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ update: jest.fn().mockResolvedValue(undefined) }) })

      await service.deleteReview('r1')

      expect(reviewDoc.ref.delete).toHaveBeenCalled()
    })

    it('should set rating to 0 when no reviews remain', async () => {
      const reviewDoc = mockDoc({ institucionId: 'inst1', calificacion: 3 }, true, 'r1')
      const emptyReviews = { empty: true, size: 0, docs: [] }
      const updateMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(reviewDoc), delete: reviewDoc.ref.delete }) })
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
      const emptySnap = { docs: [] }

      firestoreMock.collection.mockReturnValue({
        get: jest.fn().mockResolvedValue(emptySnap),
      })

      await service.updateSettings({ unknownKey: 'value' })
      // Should not throw and should call getSettings
    })
  })

  // ── getAlerts ───────────────────────────────────────────────────────

  describe('getAlerts', () => {
    it('should return alerts for critical ratings', async () => {
      const insts = [{ id: 'inst1', activa: true, nombre: 'Centro Mala', calificacionPromedio: 1.5, cantidadCalificaciones: 5, verificada: true }]
      const users = [{ id: 'u1', activo: true }]
      const reviews = [{ id: 'r1', calificacion: 1 }]

      firestoreMock.collection
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue({ docs: insts.map(i => ({ id: i.id, data: () => i })) }) })
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue({ docs: users.map(u => ({ id: u.id, data: () => u })) }) })
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue({ docs: reviews.map(r => ({ id: r.id, data: () => r })) }) })
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue({ docs: [], size: 0 }) }) // perfilesExtendidos
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
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue({ docs: insts.map(i => ({ id: i.id, data: () => i })) }) })
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue({ docs: users.map(u => ({ id: u.id, data: () => u })) }) })
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue({ docs: reviews.map(r => ({ id: r.id, data: () => r })) }) })
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue({ docs: [{ data: () => ({ usuarioId: 'u1' }) }], size: 1 }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ empty: true }) })

      const result = await service.getAlerts()
      expect(result).toHaveLength(0)
    })
  })
})
