import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, ForbiddenException } from '@nestjs/common'
import { CommunityService } from './community.service'
import { FIRESTORE } from '../../database/firebase.provider'

function mockDoc(data: Record<string, any> | null, exists = true, docId = 'mock-doc-id') {
  return {
    exists, id: docId, data: () => data,
    ref: {
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    },
  }
}

describe('CommunityService', () => {
  let service: CommunityService
  let firestoreMock: Record<string, any>

  beforeEach(async () => {
    firestoreMock = {
      collection: jest.fn(),
      batch: jest.fn(() => ({ set: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) })),
      // Transacción simulada: delega en los objetos mockeados igual que
      // firestore-admin (tx.get → ref/query .get(); tx.set/update/delete → ref).
      // Incluye la regla real de Firestore: NO se permiten lecturas después de
      // una escritura dentro de la transacción.
      runTransaction: jest.fn(async (cb: any) => {
        let escritura = false
        const tx = {
          get: async (target: any) => {
            if (escritura) throw new Error('Firestore: lectura después de escritura en transacción')
            return target.get()
          },
          set: (ref: any, data: any, opts?: any) => {
            escritura = true
            return opts === undefined ? ref.set(data) : ref.set(data, opts)
          },
          update: (ref: any, data: any) => {
            escritura = true
            return ref.update(data)
          },
          delete: (ref: any) => {
            escritura = true
            return ref.delete()
          },
        }
        return cb(tx)
      }),
    }
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
      expect(result.datos).toHaveLength(2)
      expect(result.total).toBe(2)
      // Should be sorted by cantidadMiembros desc (g2=50 before g1=10)
      expect(result.datos[0].id).toBe('g2')
      expect(result.datos[1].id).toBe('g1')
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
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [{ id: 'u1', data: () => authorData }], size: 1 }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [] as never[], size: 0 }) })

      const result = await service.getPosts(undefined, 'user1')
      expect(result.datos).toHaveLength(1)
      expect(result.datos[0].nombreCompleto).toBe('Juan')
      expect(result.datos[0].usuarioMeGusta).toBe(false)
    })

    it('should filter by grupoId', async () => {
      const posts = [
        { id: 'p1', autorId: 'u1', contenido: 'Post en grupo', fechaCreacion: '2024-01-01' },
      ]

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: posts.map(p => ({ id: p.id, data: () => p })) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [{ id: 'u1', data: () => ({ nombreCompleto: 'A' }) }], size: 1 }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [] as never[], size: 0 }) })

      const result = await service.getPosts('g1')
      expect(result.datos).toHaveLength(1)
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
    it('should add like atomically with deterministic id (usuario_publicacion)', async () => {
      const setLikeMock = jest.fn().mockResolvedValue(undefined)
      const updatePubMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ id: 'u1_p1', get: jest.fn().mockResolvedValue({ exists: false }), set: setLikeMock, delete: jest.fn().mockResolvedValue(undefined) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue({ exists: true }), update: updatePubMock }) })

      const result = await service.toggleLike('u1', 'p1')
      expect(result.meGusta).toBe(true)
      expect(setLikeMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1_p1', usuarioId: 'u1', publicacionId: 'p1' }))
      expect(updatePubMock).toHaveBeenCalled()
    })

    it('should remove like atomically when already liked', async () => {
      const deleteLikeMock = jest.fn().mockResolvedValue(undefined)
      const updatePubMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ id: 'u1_p1', get: jest.fn().mockResolvedValue({ exists: true }), set: jest.fn().mockResolvedValue(undefined), delete: deleteLikeMock }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue({ exists: true }), update: updatePubMock }) })

      const result = await service.toggleLike('u1', 'p1')
      expect(result.meGusta).toBe(false)
      expect(deleteLikeMock).toHaveBeenCalled()
      expect(updatePubMock).toHaveBeenCalled()
    })

    it('should throw NotFoundException when publication does not exist', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ id: 'u1_p1', get: jest.fn().mockResolvedValue({ exists: false }), set: jest.fn(), delete: jest.fn() }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue({ exists: false }), update: jest.fn() }) })

      await expect(service.toggleLike('u1', 'p1')).rejects.toThrow(NotFoundException)
    })
  })

  describe('updatePost', () => {
    it('should update post when user is the author', async () => {
      const pubData = { id: 'p1', autorId: 'u1', contenido: 'Old', grupoId: null as string | null, cantidadMeGustas: 0, fechaCreacion: '2024-01-01' }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(pubData, true, 'p1')), update: jest.fn().mockResolvedValue(undefined) }) })

      const result = await service.updatePost('p1', 'u1', 'New content')
      expect(result.contenido).toBe('New content')
    })

    it('should throw NotFoundException when post does not exist', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }) })

      await expect(service.updatePost('nonexistent', 'u1', 'X')).rejects.toThrow(NotFoundException)
    })

    it('should throw ForbiddenException when user is not the author', async () => {
      const pubData = { id: 'p1', autorId: 'u2', contenido: 'Old' }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(pubData, true, 'p1')) }) })

      await expect(service.updatePost('p1', 'u1', 'X')).rejects.toThrow(ForbiddenException)
    })
  })

  describe('removePost', () => {
    it('should delete post when user is the author', async () => {
      const pubData = { id: 'p1', autorId: 'u1' }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(pubData, true, 'p1')), delete: jest.fn().mockResolvedValue(undefined) }) })

      const result = await service.removePost('p1', 'u1', 'pcd')
      expect(result.eliminado).toBe(true)
    })

    it('should allow admin to delete any post', async () => {
      const pubData = { id: 'p1', autorId: 'u2' }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(pubData, true, 'p1')), delete: jest.fn().mockResolvedValue(undefined) }) })

      const result = await service.removePost('p1', 'admin1', 'admin')
      expect(result.eliminado).toBe(true)
    })

    it('should throw ForbiddenException when non-author non-admin tries to delete', async () => {
      const pubData = { id: 'p1', autorId: 'u2' }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(pubData, true, 'p1')) }) })

      await expect(service.removePost('p1', 'u1', 'pcd')).rejects.toThrow(ForbiddenException)
    })
  })

  describe('createGroup', () => {
    it('should create group + creator member atómicamente en un batch', async () => {
      const groupData = { id: 'g1', nombre: 'Test Group', descripcion: '', esPublico: true, creadorId: 'u1', cantidadMiembros: 1 }
      const batchMock = { set: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ id: 'g1', set: jest.fn().mockResolvedValue(undefined) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ id: 'g1_u1', set: jest.fn().mockResolvedValue(undefined) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(groupData, true, 'g1')) }) })
      firestoreMock.batch = jest.fn(() => batchMock)

      const result = await service.createGroup('u1', { nombre: 'Test Group' })
      expect(result.nombre).toBe('Test Group')
      expect(batchMock.set).toHaveBeenCalledTimes(2)
      expect(batchMock.commit).toHaveBeenCalled()
    })
  })

  describe('joinGroup', () => {
    it('should add user to group atomically with deterministic id (grupo_usuario)', async () => {
      const groupData = { id: 'g1', nombre: 'Group', cantidadMiembros: 5 }
      const setMemberMock = jest.fn().mockResolvedValue(undefined)
      const updateGroupMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ id: 'g1_u1', get: jest.fn().mockResolvedValue({ exists: false }), set: setMemberMock, delete: jest.fn() }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(groupData, true, 'g1')), update: updateGroupMock }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ update: updateGroupMock }) })

      const result = await service.joinGroup('g1', 'u1')
      expect(result.unido).toBe(true)
      expect(setMemberMock).toHaveBeenCalledWith(expect.objectContaining({ grupoId: 'g1', usuarioId: 'u1', rol: 'miembro' }))
      expect(updateGroupMock).toHaveBeenCalled()
    })

    it('should return already member if user is already in group', async () => {
      const groupData = { id: 'g1', nombre: 'Group' }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ id: 'g1_u1', get: jest.fn().mockResolvedValue({ exists: true }), set: jest.fn(), delete: jest.fn() }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(groupData, true, 'g1')), update: jest.fn() }) })

      const result = await service.joinGroup('g1', 'u1')
      expect(result.yaMiembro).toBe(true)
    })
  })

  describe('leaveGroup', () => {
    it('should remove user from group atomically (mismo ID determinista)', async () => {
      const groupData = { id: 'g1', nombre: 'Group', cantidadMiembros: 5 }
      const deleteMemberMock = jest.fn().mockResolvedValue(undefined)
      const updateGroupMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ id: 'g1_u1', get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ rol: 'miembro' }) }), delete: deleteMemberMock, set: jest.fn() }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(groupData, true, 'g1')), update: updateGroupMock }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ update: updateGroupMock }) })

      const result = await service.leaveGroup('g1', 'u1')
      expect(result.salido).toBe(true)
      expect(deleteMemberMock).toHaveBeenCalled()
      expect(updateGroupMock).toHaveBeenCalled()
    })

    it('should throw ForbiddenException when creator tries to leave', async () => {
      const groupData = { id: 'g1', nombre: 'Group' }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ id: 'g1_u1', get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ rol: 'admin' }) }), delete: jest.fn(), set: jest.fn() }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(groupData, true, 'g1')), update: jest.fn() }) })

      await expect(service.leaveGroup('g1', 'u1')).rejects.toThrow(ForbiddenException)
    })
  })

  describe('getStats', () => {
    it('should return community stats', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue({ size: 5 }) })
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue({ size: 20 }) })
        .mockReturnValueOnce({ get: jest.fn().mockResolvedValue({ size: 45 }) })

      const result = await service.getStats()
      expect(result.totalGrupos).toBe(5)
      expect(result.totalPublicaciones).toBe(20)
      expect(result.totalComentarios).toBe(45)
    })
  })
})
