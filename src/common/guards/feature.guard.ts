import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { FEATURES_POR_DEFECTO, FeatureFlags } from '../interfaces/feature-flags.interface'

/**
 * Guard que verifica si el usuario autenticado tiene habilitada
 * una funcionalidad específica definida via el decorador {@link Feature}.
 *
 * Los administradores siempre tienen acceso. Para el resto, revisa
 * el mapa `features` del perfil del usuario.
 *
 * @example
 * ```ts
 * @Post('enviar/:userId')
 * @UseGuards(JwtAuthGuard, FeatureGuard)
 * @Feature('chat')
 * send() { ... }
 * ```
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    // getAllAndOverride respeta la metadata tanto a nivel de handler como de
    // clase, igual que RolesGuard (mismo patrón defensivo).
    const feature = this.reflector.getAllAndOverride<string>('feature', [ctx.getHandler(), ctx.getClass()])
    if (!feature) return true // Sin metadata, acceso libre

    const request = ctx.switchToHttp().getRequest()
    const user = request.user

    // Admin siempre tiene acceso
    if (user?.rol === 'admin') return true

    const features: FeatureFlags = user?.features ?? FEATURES_POR_DEFECTO

    // Acceso seguro por string key
    if ((features as any)[feature] === false) {
      throw new ForbiddenException(
        `Funcionalidad "${feature}" desactivada para tu cuenta. Contacta a tu tutor para activarla.`,
      )
    }

    return true
  }
}
