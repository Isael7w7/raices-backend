import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'

/**
 * Guard que verifica que una cuenta con rol "institucion" esté verificada
 * por un administrador antes de poder realizar acciones sensibles
 * (crear vacantes, publicar, etc.).
 *
 * Reglas:
 *  - Si el usuario NO es institución → deja pasar (otros roles no se afectan).
 *  - Si el usuario ES institución y está verificado → deja pasar.
 *  - Si el usuario ES institución y NO está verificado → lanza 403.
 *
 * Depende de que JwtAuthGuard (FirebaseAuthGuard) haya cargado request.user
 * con el campo `verificado` del perfil en Firestore.
 *
 * Se aplica solo a endpoints que requieren verificación, NO a todos los
 * endpoints de la institución (puede ver su perfil, subir documentos, etc.).
 *
 * @example
 * ```ts
 * @UseGuards(JwtAuthGuard, RolesGuard, InstitucionVerificadaGuard)
 * @Roles('institucion', 'admin')
 * ```
 */
@Injectable()
export class InstitucionVerificadaGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const request = ctx.switchToHttp().getRequest()
    const user = request.user

    // Si no hay usuario o no es institución, dejar pasar
    if (!user || user.rol !== 'institucion') return true

    // Los admins siempre pasan (ya tienen @Roles que filtra)
    if (user.rol === 'admin') return true

    // El campo `verificado` ya viene cargado por JwtAuthGuard
    if (!user.verificado) {
      throw new ForbiddenException(
        'Institución no verificada. Sube tu CURP e identificación oficial en /api/usuarios/documento-identidad y espera la revisión de un administrador.',
      )
    }

    return true
  }
}
