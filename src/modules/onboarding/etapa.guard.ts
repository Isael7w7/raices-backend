import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { OnboardingService } from './onboarding.service'

/**
 * Guard de protección por etapas de navegación (Sidebar).
 *
 * Verifica, mediante el decorador {@link RequireEtapa}, que el usuario tenga
 * completada la etapa requerida antes de consumir el endpoint. Si no, responde
 * 403 con el mensaje estándar:
 * "Debes completar la Etapa N para acceder a este módulo".
 *
 * Los administradores siempre tienen acceso (mismo criterio que FeatureGuard).
 * Sin metadata el endpoint queda libre. Las lecturas del estado son defensivas:
 * si Firestore falla, la etapa se considera incompleta (fail-closed).
 *
 * Al aplicarse en un controlador de otro módulo, ese módulo debe importar
 * {@link OnboardingModule} (que exporta este guard y el servicio).
 *
 * @example
 * ```ts
 * @UseGuards(JwtAuthGuard, EtapaGuard)
 * @RequireEtapa(1)
 * ```
 */
@Injectable()
export class EtapaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly svc: OnboardingService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // getAllAndOverride respeta la metadata a nivel de handler y de clase,
    // igual que RolesGuard / FeatureGuard.
    const etapa = this.reflector.getAllAndOverride<number>('etapa', [ctx.getHandler(), ctx.getClass()])
    if (!etapa || etapa < 1) return true // Sin metadata, acceso libre

    const request = ctx.switchToHttp().getRequest()
    const user = request.user
    if (!user) throw new UnauthorizedException('No autenticado')

    // Admin siempre tiene acceso (no atraviesa el onboarding).
    if (user.rol === 'admin') return true

    const completada = await this.svc.etapaCompletada(user.id, etapa).catch(() => false)
    if (!completada) {
      throw new ForbiddenException(`Debes completar la Etapa ${etapa} para acceder a este módulo`)
    }
    return true
  }
}
