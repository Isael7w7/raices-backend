import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { CurrentUserPayload } from '../interfaces/current-user.interface'

/**
 * Param decorator que inyecta el usuario autenticado del request.
 * Se usa en conjunto con Firebase Auth Guard que popula request.user.
 *
 * @example
 *   @Get('perfil')
 *   profile(@CurrentUser() user: CurrentUserPayload) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CurrentUserPayload =>
    ctx.switchToHttp().getRequest().user,
)
