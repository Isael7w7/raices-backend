import { Test, TestingModule } from '@nestjs/testing'
import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common'
import { AuthService } from './auth.service'
import { FIRESTORE, FIREBASE_AUTH } from '../../database/firebase.provider'
import { EmailService } from '../email/email.service'
import { FirebaseAnalyticsService } from '../admin/firebase-analytics.service'
import axios from 'axios'

// ─── Mock helpers ────────────────────────────────────────────────────────

function mockDoc(data: Record<string, any> | null, exists = true, docId = 'mock-doc-id') {
  return {
    exists,
    id: docId,
    data: () => data,
    ref: { update: jest.fn().mockResolvedValue(undefined) },
  }
}

function mockFirestoreDoc(data: Record<string, any> | null, exists = true, docId = 'mock-doc-id') {
  return {
    get: jest.fn().mockResolvedValue(mockDoc(data, exists, docId)),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService
  let firestoreMock: Record<string, any>
  let authMock: Record<string, any>
  let emailMock: { sendWelcome: jest.Mock; sendInstitutionApproved: jest.Mock }
  let analyticsMock: { incrementar: jest.Mock }
  let axiosPostSpy: jest.SpyInstance

  beforeEach(async () => {
    process.env.FIREBASE_API_KEY = 'test-api-key'

    firestoreMock = { collection: jest.fn() }
    authMock = {
      createUser: jest.fn().mockResolvedValue({ uid: 'new-uid-123' }),
      createCustomToken: jest.fn().mockResolvedValue('custom-token-abc'),
      verifyIdToken: jest.fn().mockResolvedValue({ uid: 'user-uid-123', email: 'test@test.com' }),
    }
    emailMock = {
      sendWelcome: jest.fn().mockResolvedValue(undefined),
      sendInstitutionApproved: jest.fn().mockResolvedValue(undefined),
    }
    analyticsMock = { incrementar: jest.fn().mockResolvedValue(undefined) }

    axiosPostSpy = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { idToken: 'mock-id-token', refreshToken: 'mock-refresh-token' },
    })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: FIRESTORE, useValue: firestoreMock },
        { provide: FIREBASE_AUTH, useValue: authMock },
        { provide: EmailService, useValue: emailMock },
        { provide: FirebaseAnalyticsService, useValue: analyticsMock },
      ],
    }).compile()

    service = module.get<AuthService>(AuthService)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    delete process.env.FIREBASE_API_KEY
  })

  // ── register ────────────────────────────────────────────────────────

  describe('register', () => {
    const dto = { email: 'nuevo@test.com', password: 'Test1234', nombreCompleto: 'Nuevo Usuario', rol: 'pcd' as const }

    it('should register a new user successfully', async () => {
      // 1. Email check -> empty
      // 2. Profile doc set
      // 3. Sign-in response
      const emailCheckSnap = { empty: true, docs: [], size: 0 }

      firestoreMock.collection
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(emailCheckSnap),
        })
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue(mockFirestoreDoc(null, false, 'new-uid-123')),
        })

      const result = await service.register(dto)

      expect(authMock.createUser).toHaveBeenCalledWith({
        email: dto.email,
        password: dto.password,
        displayName: dto.nombreCompleto,
      })
      expect(result.tokenAcceso).toBe('mock-id-token')
      expect(result.tokenRefresco).toBe('mock-refresh-token')
      expect(result.usuario.email).toBe(dto.email)
      expect(result.usuario.rol).toBe('pcd')
      expect(analyticsMock.incrementar).toHaveBeenCalledWith('totalUsuarios')
      expect(analyticsMock.incrementar).toHaveBeenCalledWith('usuariosActivos')
      expect(emailMock.sendWelcome).toHaveBeenCalledWith(dto.email, dto.nombreCompleto)
    })

    it('should throw ConflictException when email already exists in Firestore', async () => {
      const existingSnap = { empty: false, docs: [{ id: 'existing' }], size: 1 }

      firestoreMock.collection
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(existingSnap),
        })

      await expect(service.register(dto)).rejects.toThrow(ConflictException)
    })

    it('should throw ConflictException when Firebase Auth reports email-already-exists', async () => {
      const emailCheckSnap = { empty: true, docs: [], size: 0 }
      authMock.createUser.mockRejectedValue({ code: 'auth/email-already-exists', message: 'Email exists' })

      firestoreMock.collection
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(emailCheckSnap),
        })

      await expect(service.register(dto)).rejects.toThrow(ConflictException)
    })

    it('should throw UnauthorizedException when Firebase Auth creation fails for other reason', async () => {
      const emailCheckSnap = { empty: true, docs: [], size: 0 }
      authMock.createUser.mockRejectedValue({ code: 'auth/invalid-password', message: 'Weak password' })

      firestoreMock.collection
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(emailCheckSnap),
        })

      await expect(service.register(dto)).rejects.toThrow(UnauthorizedException)
    })

    it('should link the PCD to the tutor and create the dependiente record when tutorId is provided', async () => {
      const dtoConTutor = { ...dto, tutorId: 'tutor-1' }
      const emailCheckSnap = { empty: true, docs: [], size: 0 }
      const dependienteSetMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection
        .mockReturnValueOnce({ // 1. Validación del tutor
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(mockDoc({ id: 'tutor-1', rol: 'tutor', activo: true })),
          }),
        })
        .mockReturnValueOnce({ // 2. Email check
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(emailCheckSnap),
        })
        .mockReturnValueOnce({ // 3. Perfil set
          doc: jest.fn().mockReturnValue(mockFirestoreDoc(null, false, 'new-uid-123')),
        })
        .mockReturnValueOnce({ // 4. Registro de dependiente vinculado
          doc: jest.fn().mockReturnValue({ set: dependienteSetMock }),
        })

      const result = await service.register(dtoConTutor)

      expect(result.usuario.tutorId).toBe('tutor-1')
      expect(dependienteSetMock).toHaveBeenCalledWith(expect.objectContaining({
        id: 'new-uid-123',
        tutorId: 'tutor-1',
        pcdUserId: 'new-uid-123',
        esCuentaVinculada: true,
      }))
    })

    it('should throw BadRequestException when tutorId is provided for a non-PCD role', async () => {
      const dtoTutor = { ...dto, rol: 'tutor' as const, tutorId: 'tutor-1' }
      await expect(service.register(dtoTutor)).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when the tutor does not exist', async () => {
      const dtoConTutor = { ...dto, tutorId: 'ghost-tutor' }
      firestoreMock.collection.mockReturnValueOnce({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }),
      })
      await expect(service.register(dtoConTutor)).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when the tutor is inactive', async () => {
      const dtoConTutor = { ...dto, tutorId: 'tutor-1' }
      firestoreMock.collection.mockReturnValueOnce({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc({ id: 'tutor-1', rol: 'tutor', activo: false })),
        }),
      })
      await expect(service.register(dtoConTutor)).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException when the tutorId points to a non-tutor account', async () => {
      const dtoConTutor = { ...dto, tutorId: 'inst-1' }
      firestoreMock.collection.mockReturnValueOnce({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc({ id: 'inst-1', rol: 'institution', activo: true })),
        }),
      })
      await expect(service.register(dtoConTutor)).rejects.toThrow(BadRequestException)
    })

    it('should use custom token as fallback when sign-in fails after register', async () => {
      const emailCheckSnap = { empty: true, docs: [], size: 0 }

      firestoreMock.collection
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(emailCheckSnap),
        })
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue(mockFirestoreDoc(null, false, 'new-uid-123')),
        })

      // Make axios.post fail to trigger fallback
      axiosPostSpy.mockRejectedValueOnce(new Error('Sign-in failed'))

      const result = await service.register(dto)

      expect(authMock.createCustomToken).toHaveBeenCalledWith('new-uid-123')
      expect(result.tokenAcceso).toBe('custom-token-abc')
      expect(result.tokenRefresco).toBe('')
    })
  })

  // ── login ───────────────────────────────────────────────────────────

  describe('login', () => {
    const dto = { email: 'test@test.com', password: 'Test1234' }

    it('should login successfully', async () => {
      const profileData = {
        id: 'user-uid-123',
        email: 'test@test.com',
        rol: 'pcd',
        nombreCompleto: 'Test User',
        activo: true,
      }

      firestoreMock.collection
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue(mockFirestoreDoc(profileData, true, 'user-uid-123')),
        })

      const result = await service.login(dto)

      expect(result.tokenAcceso).toBe('mock-id-token')
      expect(result.tokenRefresco).toBe('mock-refresh-token')
      expect(result.usuario.email).toBe('test@test.com')
      expect(result.usuario.rol).toBe('pcd')
    })

    it('should throw UnauthorizedException for invalid credentials (EMAIL_NOT_FOUND)', async () => {
      axiosPostSpy.mockRejectedValueOnce({
        response: { status: 400, data: { error: { message: 'EMAIL_NOT_FOUND' } } },
      })

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException for invalid password', async () => {
      axiosPostSpy.mockRejectedValueOnce({
        response: { status: 400, data: { error: { message: 'INVALID_PASSWORD' } } },
      })

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException for disabled account', async () => {
      axiosPostSpy.mockRejectedValueOnce({
        response: { status: 400, data: { error: { message: 'USER_DISABLED' } } },
      })

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException when user profile not found', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue(mockFirestoreDoc(null, false)),
        })

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException when user account is inactive', async () => {
      const inactiveProfile = {
        id: 'user-uid-123',
        email: 'test@test.com',
        activo: false,
      }

      firestoreMock.collection
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue(mockFirestoreDoc(inactiveProfile, true, 'user-uid-123')),
        })

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException for network errors during sign-in', async () => {
      axiosPostSpy.mockRejectedValueOnce(new Error('Network error'))

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException)
    })
  })

  // ── refresh ─────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('should refresh tokens successfully', async () => {
      const profileData = {
        id: 'user-uid-123',
        email: 'test@test.com',
        rol: 'pcd',
        nombreCompleto: 'Test User',
        activo: true,
      }

      axiosPostSpy.mockResolvedValueOnce({
        data: { id_token: 'new-id-token', refresh_token: 'new-refresh-token', user_id: 'user-uid-123' },
      })

      firestoreMock.collection
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue(mockFirestoreDoc(profileData, true, 'user-uid-123')),
        })

      const result = await service.refresh('old-refresh-token')

      expect(result.tokenAcceso).toBe('new-id-token')
      expect(result.tokenRefresco).toBe('new-refresh-token')
      expect(result.usuario.email).toBe('test@test.com')
    })

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      axiosPostSpy.mockRejectedValueOnce(new Error('Token refresh failed'))

      await expect(service.refresh('invalid-token')).rejects.toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException when user not found', async () => {
      axiosPostSpy.mockResolvedValueOnce({
        data: { id_token: 'new-id', refresh_token: 'new-refresh', user_id: 'nonexistent' },
      })

      firestoreMock.collection
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue(mockFirestoreDoc(null, false)),
        })

      await expect(service.refresh('old-refresh-token')).rejects.toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException when user account is inactive', async () => {
      const inactiveProfile = {
        id: 'user-uid-123',
        email: 'test@test.com',
        activo: false,
      }

      axiosPostSpy.mockResolvedValueOnce({
        data: { id_token: 'new-id', refresh_token: 'new-refresh', user_id: 'user-uid-123' },
      })

      firestoreMock.collection
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue(mockFirestoreDoc(inactiveProfile, true, 'user-uid-123')),
        })

      await expect(service.refresh('old-refresh-token')).rejects.toThrow(UnauthorizedException)
    })
  })

  // ── me ──────────────────────────────────────────────────────────────

  describe('me', () => {
    it('should return user profile when user exists', async () => {
      const profileData = {
        id: 'user-1',
        email: 'user@test.com',
        rol: 'pcd',
        nombreCompleto: 'User Test',
        ciudad: 'Mérida',
        estado: 'Yucatán',
        urlAvatar: 'https://example.com/avatar.jpg',
        verificado: true,
      }

      firestoreMock.collection
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue(mockFirestoreDoc(profileData, true, 'user-1')),
        })

      const result = await service.me('user-1')

      expect(result).not.toBeNull()
      expect(result!.id).toBe('user-1')
      expect(result!.email).toBe('user@test.com')
      expect(result!.rol).toBe('pcd')
      expect(result!.ciudad).toBe('Mérida')
      expect(result!.urlAvatar).toBe('https://example.com/avatar.jpg')
    })

    it('should return null when user does not exist', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue(mockFirestoreDoc(null, false)),
        })

      const result = await service.me('nonexistent')

      expect(result).toBeNull()
    })
  })
})
