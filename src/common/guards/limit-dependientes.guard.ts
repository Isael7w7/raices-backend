import { Injectable, CanActivate, ExecutionContext, BadRequestException, Inject } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES, getMaxDependientesPorTutor } from '../../database/firestore.constants'
import { LIMIT_DEPENDIENTES_KEY } from '../decorators/limit-dependientes.decorator'

/**
 * Guard que verifica que el tutor autenticado no haya alcanzado
 * el límite máximo de dependientes antes de permitir la creación.
 *
 * Se activa únicamente en los endpoints decorados con {@link LimitDependientes}.
 *
 * @example
 * ```ts
 * @Post('dependientes')
 * @UseGuards(JwtAuthGuard, LimitDependientesGuard)
 * @LimitDependientes()
 * addDependent() { ... }
 * ```
 */
@Injectable()
export class LimitDependientesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(FIRESTORE) private readonly db: Firestore,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const needsCheck = this.reflector.get<boolean>(LIMIT_DEPENDIENTES_KEY, ctx.getHandler())
    if (!needsCheck) return true

    const request = ctx.switchToHttp().getRequest()
    const user = request.user

    if (!user?.id) return true

    const snap = await this.db.collection(COLECCIONES.dependientes)
      .where('tutorId', '==', user.id)
      .get()

    const limite = getMaxDependientesPorTutor()
    if (snap.size >= limite) {
      throw new BadRequestException(
        `Has alcanzado el límite máximo permitido de ${limite} dependientes por cuenta.`,
      )
    }

    return true
  }
}
