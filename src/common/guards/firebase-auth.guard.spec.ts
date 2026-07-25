import { Test, TestingModule } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
import { ExecutionContext } from '@nestjs/common'
import { FirebaseAuthGuard } from './firebase-auth.guard'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'

// ─── Mock firebase-admin/auth at module level ────────────────────────────

const mockVerifyIdToken = jest.fn()

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}))

// ─── Mock helpers ────────────────────────────────────────────────────────

function mockDoc(data: Record<string, any> | null, exists = true) {
  return {
    exists,
    data: () => data,
  }
}

function mockExecutionContext(authHeader?: string) {
  const request: Record<string, any> = { headers: {} }
  if (authHeader !== undefined) {
    request.headers['authorization'] = authHeader
  }
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('FirebaseAuthGuard', () => {
  let guard: FirebaseAuthGuard
  let firestoreMock: Record<string, any>

  beforeEach(async () => {
    firestoreMock = { collection: jest.fn() }

    mockVerifyIdToken.mockResolvedValue({
      uid: 'test-uid-123',
      email: 'test@test.com',
    })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FirebaseAuthGuard,
        { provide: FIRESTORE, useValue: firestoreMock },
      ],
    }).compile()

    guard = module.get<FirebaseAuthGuard>(FirebaseAuthGuard)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('successful authentication', () => {
    it('should return true and populate request.user for valid token', async () => {
      const perfil = {
        email: 'test@test.com',
        rol: 'pcd',
        nombreCompleto: 'Test User',
        activo: true,
        verificado: false,
      }

      firestoreMock.collection
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(mockDoc(perfil, true)),
          }),
        })

      const context = mockExecutionContext('Bearer valid-token-123')
      const result = await guard.canActivate(context)

      expect(result).toBe(true)

      const request = context.switchToHttp().getRequest()
      expect(request.user).toEqual({
        id: 'test-uid-123',
        email: 'test@test.com',
        rol: 'pcd',
        nombreCompleto: 'Test User',
        verificado: false,
      })
    })

    it('should fallback to decodedToken email/name when profile fields are missing', async () => {
      const perfil = {
        activo: true,
      }

      firestoreMock.collection
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(mockDoc(perfil, true)),
          }),
        })

      const context = mockExecutionContext('Bearer valid-token')
      const result = await guard.canActivate(context)

      expect(result).toBe(true)

      const request = context.switchToHttp().getRequest()
      expect(request.user.email).toBe('test@test.com')
      expect(request.user.rol).toBe('user')
    })
  })

  describe('authentication failures', () => {
    it('should throw UnauthorizedException when Authorization header is missing', async () => {
      const context = mockExecutionContext()

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException when Authorization header does not start with Bearer', async () => {
      const context = mockExecutionContext('Basic some-token')

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException when token is invalid (Firebase rejects)', async () => {
      mockVerifyIdToken.mockRejectedValueOnce(new Error('Invalid token'))

      const context = mockExecutionContext('Bearer invalid-token')

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException when user profile does not exist', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(mockDoc(null, false)),
          }),
        })

      const context = mockExecutionContext('Bearer valid-token')

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException when profile data is null', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(mockDoc(null, true)),
          }),
        })

      const context = mockExecutionContext('Bearer valid-token')

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException when user account is deactivated (activo: false)', async () => {
      const perfil = { email: 'test@test.com', activo: false }

      firestoreMock.collection
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(mockDoc(perfil, true)),
          }),
        })

      const context = mockExecutionContext('Bearer valid-token')

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    })
  })
})
