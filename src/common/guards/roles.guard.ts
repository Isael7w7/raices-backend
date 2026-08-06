import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    // getAllAndOverride respeta la metadata tanto a nivel de handler como de
    // clase (ej. @UseGuards + @Roles declarados sobre el controlador), donde
    // la metadata del método tiene prioridad sobre la del controlador.
    const roles = this.reflector.getAllAndOverride<string[]>('roles', [ctx.getHandler(), ctx.getClass()])
    if (!roles || roles.length === 0) return true
    const { user } = ctx.switchToHttp().getRequest()
    if (!user || !roles.includes(user.rol)) throw new ForbiddenException('Rol insuficiente')
    return true
  }
}
