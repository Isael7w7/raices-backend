import { Test, TestingModule } from '@nestjs/testing'
import { NotificationsService } from './notifications.service'
import { FIRESTORE } from '../../database/firebase.provider'

function mockDoc(data: Record<string, any> | null, exists = true, docId = 'mock-doc-id') {
  return { exists, id: docId, data: () => data, ref: { update: jest.fn().mockResolvedValue(undefined) } }
}

describe('NotificationsService', () => {
  let service: NotificationsService
  let firestoreMock: Record<string, any>

  beforeEach(async () => {
    firestoreMock = { collection: jest.fn(), batch: jest.fn() }
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationsService, { provide: FIRESTORE, useValue: firestoreMock }],
    }).compile()
    service = module.get<NotificationsService>(NotificationsService)
  })

  describe('crear', () => {
    it('should create a notification and return it', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ set: jest.fn().mockResolvedValue(undefined) }) })

      const result = await service.crear('user1', 'like', 'Nuevo like', 'Alguien dio me gusta')
      expect(result.usuarioId).toBe('user1')
      expect(result.tipo).toBe('like')
      expect(result.leida).toBe(false)
    })
  })

  describe('findByUser', () => {
    it('should return notifications sorted by date', async () => {
      const notifs = [
        { id: 'n1', data: () => ({ titulo: 'Notif 1', fechaCreacion: '2024-01-01' }) },
        { id: 'n2', data: () => ({ titulo: 'Notif 2', fechaCreacion: '2024-01-02' }) },
      ]

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: notifs }) })

      const result: any[] = await service.findByUser('user1')
      expect(result).toHaveLength(2)
      expect(result[0].titulo).toBe('Notif 2')
    })

    it('should limit to 50 notifications', async () => {
      const notifs = Array.from({ length: 60 }, (_, i) => ({
        id: `n${i}`, data: () => ({ titulo: `Notif ${i}`, fechaCreacion: `2024-01-${String(i + 1).padStart(2, '0')}` }),
      }))

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: notifs }) })

      const result = await service.findByUser('user1')
      expect(result).toHaveLength(50)
    })
  })

  describe('markRead', () => {
    it('should mark a notification as read', async () => {
      const notifDoc = mockDoc({ usuarioId: 'user1', leida: false }, true, 'n1')

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(notifDoc) }) })

      await service.markRead('user1', 'n1')
      expect(notifDoc.ref.update).toHaveBeenCalledWith({ leida: true })
    })

    it('should not mark if notification belongs to another user', async () => {
      const notifDoc = mockDoc({ usuarioId: 'other', leida: false }, true, 'n1')

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(notifDoc) }) })

      await service.markRead('user1', 'n1')
      expect(notifDoc.ref.update).not.toHaveBeenCalled()
    })
  })

  describe('markAllRead', () => {
    it('should mark all unread notifications as read', async () => {
      const refUpdate1 = jest.fn().mockResolvedValue(undefined)
      const refUpdate2 = jest.fn().mockResolvedValue(undefined)
      const snap = {
        docs: [
          { ref: { update: refUpdate1 } },
          { ref: { update: refUpdate2 } },
        ],
      }

      const batch = { update: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) }
      const chainable = { where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap) }

      firestoreMock.collection.mockReturnValueOnce(chainable)
      firestoreMock.batch.mockReturnValue(batch)

      await service.markAllRead('user1')

      expect(chainable.where).toHaveBeenCalledTimes(2)
      expect(batch.update).toHaveBeenCalledTimes(2)
      expect(batch.update).toHaveBeenCalledWith(snap.docs[0].ref, { leida: true })
      expect(batch.update).toHaveBeenCalledWith(snap.docs[1].ref, { leida: true })
      expect(batch.commit).toHaveBeenCalled()
    })
  })

  describe('getStream', () => {
    it('should return a Subject for the user', () => {
      const subject = service.getStream('user1')
      expect(subject).toBeDefined()
    })

    it('should return the same Subject for the same user', () => {
      const subject1 = service.getStream('user1')
      const subject2 = service.getStream('user1')
      expect(subject1).toBe(subject2)
    })

    it('should return different Subjects for different users', () => {
      const subject1 = service.getStream('user1')
      const subject2 = service.getStream('user2')
      expect(subject1).not.toBe(subject2)
    })
  })
})
