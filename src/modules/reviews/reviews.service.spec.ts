import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, ForbiddenException } from '@nestjs/common'
import { ReviewsService } from './reviews.service'
import { FIRESTORE } from '../../database/firebase.provider'

function mockDoc(data: Record<string, any> | null, exists = true, docId = 'mock-doc-id') {
  return { exists, id: docId, data: () => data, ref: { update: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined), delete: jest.fn().mockResolvedValue(undefined) } }
}

describe('ReviewsService', () => {
  let service: ReviewsService
  let firestoreMock: Record<string, any>

  beforeEach(async () => {
    firestoreMock = { collection: jest.fn() }
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReviewsService, { provide: FIRESTORE, useValue: firestoreMock }],
    }).compile()
    service = module.get<ReviewsService>(ReviewsService)
  })

  describe('findByInstitution', () => {
    it('should return reviews with user data', async () => {
      const reviews = [
        { id: 'r1', calificacion: 5, comentario: 'Excelente', usuarioId: 'u1', fechaCreacion: '2024-01-01' },
      ]
      const userData = { nombreCompleto: 'Juan', urlAvatar: 'url' }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: reviews.map(r => ({ id: r.id, data: () => r })) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(userData, true, 'u1')) }) })

      const result = await service.findByInstitution('inst1')
      expect(result.datos).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.datos[0].nombreCompleto).toBe('Juan')
    })

    it('should return empty array when no reviews', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [] as never[], size: 0 }) })

      const result = await service.findByInstitution('inst1')
      expect(result.datos).toHaveLength(0)
    })
  })

  describe('submit', () => {
    it('should create a new review', async () => {
      const emptySnap = { empty: true, docs: [] as never[], size: 0 }
      const allReviewsSnap = { docs: [{ data: () => ({ calificacion: 4 }) }], size: 1 }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(emptySnap) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ id: 'auto-gen-firestore-id', set: jest.fn().mockResolvedValue(undefined) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ set: jest.fn().mockResolvedValue(undefined) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(allReviewsSnap) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ update: jest.fn().mockResolvedValue(undefined) }) })

      const result = await service.submit('user1', 'inst1', 4, 'Buen servicio')
      expect(result.calificacion).toBe(4)
      expect(result.usuarioId).toBe('user1')
    })

    it('should update existing review', async () => {
      const updateMock = jest.fn().mockResolvedValue(undefined)
      const existingSnap = {
        empty: false,
        docs: [{ id: 'r1', ref: { update: updateMock }, data: () => ({ calificacion: 3 }) }],
        size: 1,
      }
      const allReviewsSnap = { docs: [{ data: () => ({ calificacion: 5 }) }], size: 1 }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(existingSnap) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(allReviewsSnap) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ update: jest.fn().mockResolvedValue(undefined) }) })

      const result = await service.submit('user1', 'inst1', 5, 'Actualizado')
      expect(result.calificacion).toBe(5)
      expect(updateMock).toHaveBeenCalledWith({ calificacion: 5, comentario: 'Actualizado' })
    })
  })

  describe('myReviews', () => {
    it('should return user reviews with institution data', async () => {
      const reviews = [
        { id: 'r1', calificacion: 5, institucionId: 'inst1', fechaCreacion: '2024-01-01' },
      ]
      const instData = { nombre: 'Centro Test', categoria: 'funcional' }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: reviews.map(r => ({ id: r.id, data: () => r })) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(instData, true, 'inst1')) }) })

      const result = await service.myReviews('user1')
      expect(result.datos).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.datos[0].nombreInstitucion).toBe('Centro Test')
    })
  })

  describe('update', () => {
    it('should update review when user is the author', async () => {
      const resenaData = { id: 'r1', usuarioId: 'u1', institucionId: 'inst1', calificacion: 3, comentario: 'Old' }
      const allReviewsSnap = { docs: [{ data: () => ({ calificacion: 5 }) }], size: 1 }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(resenaData, true, 'r1')), update: jest.fn().mockResolvedValue(undefined) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(allReviewsSnap) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ update: jest.fn().mockResolvedValue(undefined) }) })

      const result = await service.update('r1', 'u1', { calificacion: 5, comentario: 'Updated' })
      expect(result.calificacion).toBe(5)
    })

    it('should throw NotFoundException when review does not exist', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }) })

      await expect(service.update('nonexistent', 'u1', { calificacion: 5 })).rejects.toThrow(NotFoundException)
    })

    it('should throw ForbiddenException when user is not the author', async () => {
      const resenaData = { id: 'r1', usuarioId: 'u2', institucionId: 'inst1' }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(resenaData, true, 'r1')) }) })

      await expect(service.update('r1', 'u1', { calificacion: 5 })).rejects.toThrow(ForbiddenException)
    })
  })

  describe('remove', () => {
    it('should delete review and recalculate average', async () => {
      const resenaData = { id: 'r1', usuarioId: 'u1', institucionId: 'inst1', calificacion: 4 }
      const allReviewsSnap = { docs: [{ data: () => ({ calificacion: 3 }) }], size: 1 }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(resenaData, true, 'r1')), delete: jest.fn().mockResolvedValue(undefined) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(allReviewsSnap) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ update: jest.fn().mockResolvedValue(undefined) }) })

      const result = await service.remove('r1', 'u1')
      expect(result.eliminado).toBe(true)
    })

    it('should throw NotFoundException when review does not exist', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }) })

      await expect(service.remove('nonexistent', 'u1')).rejects.toThrow(NotFoundException)
    })

    it('should throw ForbiddenException when user is not the author', async () => {
      const resenaData = { id: 'r1', usuarioId: 'u2', institucionId: 'inst1' }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(resenaData, true, 'r1')) }) })

      await expect(service.remove('r1', 'u1')).rejects.toThrow(ForbiddenException)
    })
  })
})
