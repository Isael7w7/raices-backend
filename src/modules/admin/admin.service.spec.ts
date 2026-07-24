import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { FIRESTORE } from '../../database/firebase.provider';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { StorageService } from '../storage/storage.service';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AdminService', () => {
  let service: AdminService;
  let firestoreMock: any;
  let storageMock: { delete: jest.Mock };

  beforeEach(async () => {
    storageMock = { delete: jest.fn().mockResolvedValue(undefined) }

    firestoreMock = {
      collection: jest.fn(),
      batch: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: FIRESTORE, useValue: firestoreMock },
        { provide: NotificationsService, useValue: {} },
        { provide: EmailService, useValue: {} },
        { provide: StorageService, useValue: storageMock },
      ],
    }).compile()

    service = module.get<AdminService>(AdminService)
  })

  // Helper: create a chainable collection mock
  function chainCollection(getResult: any, whereResult = { empty: true, docs: [], size: 0 }) {
    return {
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(getResult),
        delete: jest.fn().mockResolvedValue(undefined),
      }),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(whereResult),
    }
  }

  describe('deleteUser', () => {
    it('should delete user with avatar, clean up related data, and return success', async () => {
      const gcsUrl = 'https://firebasestorage.googleapis.com/v0/b/raices-499122.appspot.com/o/avatars%2Fuser-photo.jpg?alt=media&token=tok'
      const perfilDoc = {
        exists: true,
        id: 'user1',
        data: () => ({ id: 'user1', urlAvatar: gcsUrl }),
        ref: { delete: jest.fn().mockResolvedValue(undefined) },
      }
      const emptyResult = { empty: true, docs: [], size: 0 }
      const batch = { delete: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) }

      firestoreMock.collection.mockReturnValue(chainCollection(perfilDoc))
      firestoreMock.batch.mockReturnValue(batch)

      const result = await service.deleteUser('user1', 'admin-1')

      expect(storageMock.delete).toHaveBeenCalledWith('avatars/user-photo.jpg')
      expect(perfilDoc.ref.delete).toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('should throw BadRequestException when admin tries to delete own account', async () => {
      await expect(service.deleteUser('admin-1', 'admin-1')).rejects.toThrow(BadRequestException)
      await expect(service.deleteUser('admin-1', 'admin-1')).rejects.toThrow('No puedes eliminar tu propia cuenta')
    })

    it('should throw NotFoundException when user does not exist', async () => {
      const perfilDoc = { exists: false, id: 'nonexistent', data: () => undefined }
      firestoreMock.collection.mockReturnValue(chainCollection(perfilDoc))

      await expect(service.deleteUser('nonexistent', 'admin-1')).rejects.toThrow(NotFoundException)
      await expect(service.deleteUser('nonexistent', 'admin-1')).rejects.toThrow('Usuario no encontrado')
    })

    it('should not call storage.delete when user has no avatar', async () => {
      const perfilDoc = {
        exists: true,
        id: 'user2',
        data: () => ({ id: 'user2' }), // no urlAvatar
        ref: { delete: jest.fn().mockResolvedValue(undefined) },
      }
      const batch = { delete: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) }

      firestoreMock.collection.mockReturnValue(chainCollection(perfilDoc))
      firestoreMock.batch.mockReturnValue(batch)

      const result = await service.deleteUser('user2', 'admin-1')

      expect(storageMock.delete).not.toHaveBeenCalled()
      expect(perfilDoc.ref.delete).toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('should continue even if Storage delete fails', async () => {
      const gcsUrl = 'https://firebasestorage.googleapis.com/v0/b/raices-499122.appspot.com/o/avatars%2Fgone.jpg?alt=media&token=tok'
      const perfilDoc = {
        exists: true,
        id: 'user3',
        data: () => ({ id: 'user3', urlAvatar: gcsUrl }),
        ref: { delete: jest.fn().mockResolvedValue(undefined) },
      }
      const batch = { delete: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) }

      firestoreMock.collection.mockReturnValue(chainCollection(perfilDoc))
      firestoreMock.batch.mockReturnValue(batch)
      storageMock.delete.mockRejectedValueOnce(new Error('File not found'))

      const result = await service.deleteUser('user3', 'admin-1')

      expect(perfilDoc.ref.delete).toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('should call batch.commit to clean up dependientes', async () => {
      const perfilDoc = {
        exists: true,
        id: 'user4',
        data: () => ({ id: 'user4' }),
        ref: { delete: jest.fn().mockResolvedValue(undefined) },
      }
      const depDoc = { ref: {} }
      const batch = { delete: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) }

      firestoreMock.collection.mockReturnValue(chainCollection(perfilDoc, { empty: false, docs: [depDoc], size: 1 }))
      firestoreMock.batch.mockReturnValue(batch)

      const result = await service.deleteUser('user4', 'admin-1')

      expect(batch.delete).toHaveBeenCalled()
      expect(batch.commit).toHaveBeenCalled()
      expect(perfilDoc.ref.delete).toHaveBeenCalled()
      expect(result).toBeUndefined()
    })
  });
});
