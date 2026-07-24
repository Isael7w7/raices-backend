import { Test, TestingModule } from '@nestjs/testing'
import { CommunityService } from './community.service'
import { FIRESTORE } from '../../database/firebase.provider'

function mockDoc(data: Record<string, any> | null, exists = true, docId = 'mock-doc-id') {
  return { exists, id: docId, data: () => data }
}

describe('CommunityService', () => {
  let service: CommunityService
  let firestoreMock: Record<string, any>

  beforeEach(async () => {
    firestoreMock = { collection: jest.fn() }
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommunityService, { provide: FIRESTORE, useValue: firestoreMock }],
    }).compile()
    service = module.get<CommunityService>(CommunityService)
  })

  describe('getGroups', () => {
    it('should return public groups sorted by member count', async () => {
      const groups = [
        { id: 'g1', data: () => ({ nombre: 'Grupo A', cantidadMiembros: 10 }) },
        { id: 'g2', data: () => ({ nombre: 'Grupo B', cantidadMiembros: 50 }) },
      ]

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: groups }) })

      const result = await service.getGroups()
      expect(result).toHaveLength(2)
      // Should be sorted by cantidadMiembros desc
    })
  })

  describe('getPosts', () => {
    it('should return posts with author data', async () => {
      const posts = [
        { id: 'p1', autorId: 'u1', contenido: 'Hola', fechaCreacion: '2024-01-01' },
      ]
      const authorData = { nombreCompleto: 'Juan', urlAvatar: 'url' }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: posts.map(p => ({ id: p.id, data: () => p })) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(authorData, true, 'u1')) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [], size: 0 }) })

      const result = await service.getPosts(undefined, 'user1')
      expect(result).toHaveLength(1)
      expect(result[0].nombreCompleto).toBe('Juan')
      expect(result[0].usuarioMeGusta).toBe(false)
    })

    it('should filter by grupoId', async () => {
      const posts = [
        { id: 'p1', autorId: 'u1', contenido: 'Post en grupo', fechaCreacion: '2024-01-01' },
      ]

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: posts.map(p => ({ id: p.id, data: () => p })) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc({ nombreCompleto: 'A' }, true, 'u1')) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [], size: 0 }) })

      const result = await service.getPosts('g1')
      expect(result).toHaveLength(1)
    })
  })

  describe('createPost', () => {
    it('should create a post with author data', async () => {
      const autorData = { nombreCompleto: 'Juan', urlAvatar: 'url' }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ set: jest.fn().mockResolvedValue(undefined) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(autorData, true, 'u1')) }) })

      const result = await service.createPost('u1', 'Mi publicación')
      expect(result.contenido).toBe('Mi publicación')
      expect(result.nombreCompleto).toBe('Juan')
      expect(result.cantidadMeGustas).toBe(0)
    })
  })

  describe('createComment', () => {
    it('should create a comment with author data', async () => {
      const commentData = { id: 'c1', contenido: 'Genial', autorId: 'u1' }
      const autorData = { nombreCompleto: 'María' }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ set: jest.fn().mockResolvedValue(undefined) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(commentData, true, 'c1')) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(autorData, true, 'u1')) }) })

      const result = await service.createComment('p1', 'u1', 'Genial')
      expect(result).toBeDefined()
      expect(result.id).toBeDefined()
    })
  })

  describe('toggleLike', () => {
    it('should add like when not liked', async () => {
      const emptySnap = { empty: true, docs: [] }
      const batch = { set: jest.fn().mockResolvedValue(undefined) }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(emptySnap) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ set: jest.fn().mockResolvedValue(undefined) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ update: jest.fn().mockResolvedValue(undefined) }) })

      const result = await service.toggleLike('u1', 'p1')
      expect(result.meGusta).toBe(true)
    })

    it('should remove like when already liked', async () => {
      const existingSnap = {
        empty: false,
        docs: [{ ref: { delete: jest.fn().mockResolvedValue(undefined) } }],
      }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(existingSnap) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ update: jest.fn().mockResolvedValue(undefined) }) })

      const result = await service.toggleLike('u1', 'p1')
      expect(result.meGusta).toBe(false)
    })
  })
})
