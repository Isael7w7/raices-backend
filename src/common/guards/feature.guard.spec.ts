import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { FeatureGuard } from './feature.guard'
import { FEATURES_POR_DEFECTO } from '../interfaces/feature-flags.interface'

// ─── Mock helpers ────────────────────────────────────────────────────────

function mockExecutionContext(user?: { id: string; rol: string; features?: Record<string, boolean> }) {
  const handler = jest.fn()
  const controllerClass = class ControladorPrueba {}
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => handler,
    getClass: () => controllerClass,
  } as unknown as ExecutionContext
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('FeatureGuard', () => {
  let guard: FeatureGuard
  let reflector: jest.Mocked<Reflector>

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>
    guard = new FeatureGuard(reflector)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('no feature required', () => {
    it('should allow access when no feature metadata is defined', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined)

      const context = mockExecutionContext({ id: 'user1', rol: 'pcd', features: { ...FEATURES_POR_DEFECTO } })
      const result = guard.canActivate(context)

      expect(result).toBe(true)
    })
  })

  describe('feature required', () => {
    beforeEach(() => {
      reflector.getAllAndOverride.mockReturnValue('postulaciones')
    })

    it('should allow access when user has the feature enabled', () => {
      const context = mockExecutionContext({ id: 'user1', rol: 'pcd', features: { ...FEATURES_POR_DEFECTO } })

      const result = guard.canActivate(context)

      expect(result).toBe(true)
    })

    it('should allow access when user is admin even without explicit feature', () => {
      const context = mockExecutionContext({ id: 'admin1', rol: 'admin', features: { ...FEATURES_POR_DEFECTO } })

      const result = guard.canActivate(context)

      expect(result).toBe(true)
    })

    it('should throw ForbiddenException when user has the feature explicitly disabled', () => {
      const context = mockExecutionContext({
        id: 'user1',
        rol: 'pcd',
        features: { ...FEATURES_POR_DEFECTO, postulaciones: false },
      })

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
    })

    it('should throw ForbiddenException with descriptive message when feature disabled', () => {
      const context = mockExecutionContext({
        id: 'user1',
        rol: 'pcd',
        features: { ...FEATURES_POR_DEFECTO, comunidad: false },
      })
      reflector.getAllAndOverride.mockReturnValue('comunidad')

      try {
        guard.canActivate(context)
        fail('Expected ForbiddenException')
      } catch (e: any) {
        expect(e.message).toContain('comunidad')
        expect(e.message).toContain('desactivada')
      }
    })

    it('should use defaults when user has no features and feature is required (defaults are enabled)', () => {
      // When features is undefined, FeatureGuard falls back to FEATURES_POR_DEFECTO (all true)
      const context = mockExecutionContext({ id: 'user1', rol: 'pcd', features: undefined as any })

      const result = guard.canActivate(context)

      expect(result).toBe(true)
    })

    it('should deny access when user has all features false', () => {
      const context = mockExecutionContext({
        id: 'user1',
        rol: 'pcd',
        features: {
          chat: false,
          postulaciones: false,
          comunidad: false,
          resenas: false,
          descubrimiento: false,
          favoritos: false,
        },
      })

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
    })
  })

  describe('different features', () => {
    it('should allow access for chat feature when enabled', () => {
      reflector.getAllAndOverride.mockReturnValue('chat')
      const context = mockExecutionContext({ id: 'user1', rol: 'pcd', features: { ...FEATURES_POR_DEFECTO } })

      const result = guard.canActivate(context)

      expect(result).toBe(true)
    })

    it('should deny access for chat feature when disabled', () => {
      reflector.getAllAndOverride.mockReturnValue('chat')
      const context = mockExecutionContext({
        id: 'user1',
        rol: 'pcd',
        features: { ...FEATURES_POR_DEFECTO, chat: false },
      })

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
    })
  })
})
