import { Test, TestingModule } from '@nestjs/testing'
import { ForbiddenException } from '@nestjs/common'
import { MessagesService } from './messages.service'
import { FIRESTORE } from '../../database/firebase.provider'

function mockDoc(data: Record<string, any> | null, exists = true, docId = 'mock-doc-id') {
  return { exists, id: docId, data: () => data }
}

describe('MessagesService', () => {
  let service: MessagesService
  let firestoreMock: Record<string, any>

  beforeEach(async () => {
    firestoreMock = { collection: jest.fn(), batch: jest.fn() }
    const module: TestingModule = await Test.createTestingModule({
      providers: [MessagesService, { provide: FIRESTORE, useValue: firestoreMock }],
    }).compile()
    service = module.get<MessagesService>(MessagesService)
  })

  describe('getConversations', () => {
    it('should return conversations with socio data', async () => {
      const sentMsgs = [{ id: 'm1', remitenteId: 'u1', destinatarioId: 'u2', contenido: 'Hola', fechaCreacion: '2024-01-01', leido: true }]
      const receivedMsgs = [{ id: 'm2', remitenteId: 'u2', destinatarioId: 'u1', contenido: 'Hi', fechaCreacion: '2024-01-02', leido: false }]

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: sentMsgs.map(m => ({ id: m.id, data: () => m })) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: receivedMsgs.map(m => ({ id: m.id, data: () => m })) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [{ id: 'u2', data: () => ({ nombreCompleto: 'Pedro' }) }] }) })

      const result = await service.getConversations('u1')
      expect(result).toHaveLength(1)
      expect(result[0].socio.nombreCompleto).toBe('Pedro')
    })

    it('should return empty array when no conversations', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [] }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [] }) })

      const result = await service.getConversations('u1')
      expect(result).toHaveLength(0)
    })
  })

  describe('getMessages', () => {
    it('should mark unread messages as read and return messages', async () => {
      const batch = { update: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) }
      const unreadSnap = { docs: [{ ref: { update: jest.fn() } }], empty: false }
      const sentSnap = { docs: [{ id: 'm1', data: () => ({ contenido: 'Hola' }) }] }
      const receivedSnap = { docs: [{ id: 'm2', data: () => ({ contenido: 'Hi' }) }] }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(unreadSnap) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(sentSnap) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(receivedSnap) })
      firestoreMock.batch.mockReturnValue(batch)

      const result = await service.getMessages('u1', 'u2')
      expect(result).toHaveLength(2)
      expect(batch.commit).toHaveBeenCalled()
    })

    it('should not commit batch when no unread messages', async () => {
      const batch = { update: jest.fn(), commit: jest.fn() }
      const emptySnap = { docs: [], empty: true }
      const sentSnap = { docs: [] }
      const receivedSnap = { docs: [] }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(emptySnap) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(sentSnap) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(receivedSnap) })
      firestoreMock.batch.mockReturnValue(batch)

      await service.getMessages('u1', 'u2')
      expect(batch.commit).not.toHaveBeenCalled()
    })
  })

  describe('sendMessage', () => {
    it('should send a message successfully', async () => {
      const destDoc = mockDoc({ id: 'u2', activo: true }, true, 'u2')

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(destDoc) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ set: jest.fn().mockResolvedValue(undefined) }) })

      const result = await service.sendMessage('u1', 'u2', 'Hola')
      expect(result.contenido).toBe('Hola')
      expect(result.remitenteId).toBe('u1')
      expect(result.destinatarioId).toBe('u2')
    })

    it('should throw ForbiddenException when sending to self', async () => {
      await expect(service.sendMessage('u1', 'u1', 'Hola')).rejects.toThrow(ForbiddenException)
    })

    it('should throw ForbiddenException when destinatario does not exist', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }) })

      await expect(service.sendMessage('u1', 'nonexistent', 'Hola')).rejects.toThrow(ForbiddenException)
    })
  })

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ size: 5 }) })

      const result = await service.getUnreadCount('u1')
      expect(result).toBe(5)
    })
  })
})
