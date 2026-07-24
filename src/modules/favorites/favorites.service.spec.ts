import { Test, TestingModule } from '@nestjs/testing'
import { FavoritesService } from './favorites.service'
import { FIRESTORE } from '../../database/firebase.provider'

describe('FavoritesService', () => {
  let service: FavoritesService
  let firestoreMock: Record<string, any>

  beforeEach(async () => {
    firestoreMock = { collection: jest.fn() }
    const module: TestingModule = await Test.createTestingModule({
      providers: [FavoritesService, { provide: FIRESTORE, useValue: firestoreMock }],
    }).compile()
    service = module.get<FavoritesService>(FavoritesService)
  })

  describe('findByUser', () => {
    it('should return favorite institutions', async () => {
      const favs = [{ data: () => ({ institucionId: 'inst1' }) }]
      const instData = { id: 'inst1', nombre: 'Centro A', tiposDiscapacidad: '["tea"]' }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: favs, empty: false }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [{ id: 'inst1', data: () => instData }] }) })

      const result = await service.findByUser('u1')
      expect(result).toHaveLength(1)
      expect(result[0].nombre).toBe('Centro A')
    })

    it('should return empty array when no favorites', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [], empty: true }) })

      const result = await service.findByUser('u1')
      expect(result).toHaveLength(0)
    })
  })

  describe('toggle', () => {
    it('should add favorite when not liked', async () => {
      const emptySnap = { empty: true, docs: [] }
      const setMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(emptySnap) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ set: setMock }) })

      const result = await service.toggle('u1', 'inst1')
      expect(result.favorito).toBe(true)
      expect(setMock).toHaveBeenCalled()
    })

    it('should remove favorite when already liked', async () => {
      const existingSnap = {
        empty: false,
        docs: [{ ref: { delete: jest.fn().mockResolvedValue(undefined) } }],
      }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(existingSnap) })

      const result = await service.toggle('u1', 'inst1')
      expect(result.favorito).toBe(false)
    })
  })

  describe('getFavoriteIds', () => {
    it('should return array of institution IDs', async () => {
      const snap = {
        docs: [
          { data: () => ({ institucionId: 'inst1' }) },
          { data: () => ({ institucionId: 'inst2' }) },
        ],
      }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap) })

      const result = await service.getFavoriteIds('u1')
      expect(result).toEqual(['inst1', 'inst2'])
    })
  })
})
