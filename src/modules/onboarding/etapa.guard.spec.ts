import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { EtapaGuard } from './etapa.guard'
import { OnboardingService } from './onboarding.service'

// ─── Mock helpers ────────────────────────────────────────────────────────

function mockExecutionContext(user?: { id: string; rol: string }) {
  const handler = jest.fn()
  const controllerClass = class ControladorPrueba {}
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => handler,
    getClass: () => controllerClass,
  } as unknown as ExecutionContext
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('EtapaGuard', () => {
  let guard: EtapaGuard
  let reflector: jest.Mocked<Reflector>
  let svc: { etapaCompletada: jest.Mock }

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>
    svc = { etapaCompletada: jest.fn() }
    guard = new EtapaGuard(reflector, svc as unknown as OnboardingService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('sin metadata de etapa', () => {
    it('permite el acceso cuando el endpoint no declara @RequireEtapa', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined)

      const context = mockExecutionContext({ id: 'u1', rol: 'pcd' })
      await expect(guard.canActivate(context)).resolves.toBe(true)
      expect(svc.etapaCompletada).not.toHaveBeenCalled()
    })

    it('permite el acceso con etapa inválida (0 o negativa)', async () => {
      reflector.getAllAndOverride.mockReturnValue(0)

      const context = mockExecutionContext({ id: 'u1', rol: 'pcd' })
      await expect(guard.canActivate(context)).resolves.toBe(true)
    })
  })

  describe('con @RequireEtapa(n)', () => {
    beforeEach(() => {
      reflector.getAllAndOverride.mockReturnValue(1)
    })

    it('permite el acceso cuando la etapa requerida está completada', async () => {
      svc.etapaCompletada.mockResolvedValue(true)

      const context = mockExecutionContext({ id: 'u1', rol: 'pcd' })
      await expect(guard.canActivate(context)).resolves.toBe(true)
      expect(svc.etapaCompletada).toHaveBeenCalledWith('u1', 1)
    })

    it('responde 403 con el mensaje estándar cuando la etapa no está completada', async () => {
      svc.etapaCompletada.mockResolvedValue(false)

      const context = mockExecutionContext({ id: 'u1', rol: 'padre_tutor' })
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException)
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Debes completar la Etapa 1 para acceder a este módulo',
      )
    })

    it('el mensaje 403 usa el número de etapa requerido', async () => {
      reflector.getAllAndOverride.mockReturnValue(2)
      svc.etapaCompletada.mockResolvedValue(false)

      const context = mockExecutionContext({ id: 'u1', rol: 'pcd' })
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Debes completar la Etapa 2 para acceder a este módulo',
      )
    })

    it('permite el acceso a administradores sin consultar el progreso', async () => {
      const context = mockExecutionContext({ id: 'admin1', rol: 'admin' })

      await expect(guard.canActivate(context)).resolves.toBe(true)
      expect(svc.etapaCompletada).not.toHaveBeenCalled()
    })

    it('responde 401 si no hay usuario autenticado', async () => {
      const context = mockExecutionContext(undefined)

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
      expect(svc.etapaCompletada).not.toHaveBeenCalled()
    })

    it('es fail-closed si el servicio falla: responde 403 estándar en lugar de 500', async () => {
      svc.etapaCompletada.mockRejectedValue(new Error('firestore caído'))

      const context = mockExecutionContext({ id: 'u1', rol: 'pcd' })
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException)
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Debes completar la Etapa 1 para acceder a este módulo',
      )
    })
  })
})
