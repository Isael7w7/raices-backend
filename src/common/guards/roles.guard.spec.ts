import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { RolesGuard } from './roles.guard'

// ─── Mock helpers ────────────────────────────────────────────────────────

function mockExecutionContext(user?: { id: string; rol: string }) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => jest.fn(),
  } as unknown as ExecutionContext
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('RolesGuard', () => {
  let guard: RolesGuard
  let reflector: jest.Mocked<Reflector>

  beforeEach(() => {
    reflector = { get: jest.fn() } as unknown as jest.Mocked<Reflector>
    guard = new RolesGuard(reflector)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('no roles required', () => {
    it('should allow access when no roles are defined on the handler', () => {
      reflector.get.mockReturnValue(undefined)

      const context = mockExecutionContext({ id: 'user1', rol: 'pcd' })
      const result = guard.canActivate(context)

      expect(result).toBe(true)
    })
  })

  describe('roles required', () => {
    beforeEach(() => {
      reflector.get.mockReturnValue(['admin'])
    })

    it('should allow access when user role matches', () => {
      const context = mockExecutionContext({ id: 'admin1', rol: 'admin' })

      const result = guard.canActivate(context)

      expect(result).toBe(true)
    })

    it('should throw ForbiddenException when user role does not match', () => {
      const context = mockExecutionContext({ id: 'user1', rol: 'pcd' })

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
    })

    it('should throw ForbiddenException when user has no role', () => {
      const context = mockExecutionContext({ id: 'user1', rol: undefined as any })

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
    })

    it('should throw ForbiddenException when user is not authenticated', () => {
      const context = mockExecutionContext(undefined)

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
    })
  })

  describe('multiple roles', () => {
    beforeEach(() => {
      reflector.get.mockReturnValue(['institucion', 'admin'])
    })

    it('should allow access when user has one of the required roles', () => {
      const context = mockExecutionContext({ id: 'user1', rol: 'institucion' })

      const result = guard.canActivate(context)

      expect(result).toBe(true)
    })

    it('should allow access when user has the other required role', () => {
      const context = mockExecutionContext({ id: 'admin1', rol: 'admin' })

      const result = guard.canActivate(context)

      expect(result).toBe(true)
    })

    it('should throw ForbiddenException when user has a non-listed role', () => {
      const context = mockExecutionContext({ id: 'user1', rol: 'pcd' })

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
    })
  })
})
