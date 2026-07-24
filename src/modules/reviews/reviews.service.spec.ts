import { Test, TestingModule } from '@nestjs/testing'
import { ReviewsService } from './reviews.service'
import { FIRESTORE } from '../../database/firebase.provider'

function mockDoc(data: Record<string, any> | null, exists = true, docId = 'mock-doc-id') {
  return { exists, id: docId, data: () => data, ref: { update: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) } }
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
      expect(result).toHaveLength(1)
      expect(result[0].nombreCompleto).toBe('Juan')
    })

    it('should return empty array when no reviews', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [], size: 0 }) })

      const result = await service.findByInstitution('inst1')
      expect(result).toHaveLength(0)
    })
  })

  describe('submit', () => {
    it('should create a new review', async () => {
      const emptySnap = { empty: true, docs: [], size: 0 }
      const allReviewsSnap = { docs: [{ data: () => ({ calificacion: 4 }) }], size: 1 }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(emptySnap) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ set: jest.fn().mockResolvedValue(undefined) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(allReviewsSnap) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ update: jest.fn().mockResolvedValue(undefined) }) })

      const result = await service.submit('user1', 'inst1', 4, 'Buen servicio')
      expect(result.calificacion).toBe(4)
      expect(result.usuarioId).toBe('user1')
    })

    it('should update existing review', async () => {
      const existingSnap = {
        empty: false,
        docs: [{ id: 'r1', ref: { update: jest.fn().mockResolvedValue(undefined) }, data: () => ({ calificacion: 3 }) }],
        size: 1,
      }
      const allReviewsSnap = { docs: [{ data: () => ({ calificacion: 5 }) }], size: 1 }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(existingSnap) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(allReviewsSnap) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ update: jest.fn().mockResolvedValue(undefined) }) })

      const result = await service.submit('user1', 'inst1', 5, 'Actualizado')
      expect(result.calificacion).toBe(5)
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
      expect(result).toHaveLength(1)
      expect(result[0].nombreInstitucion).toBe('Centro Test')
    })
  })
})
