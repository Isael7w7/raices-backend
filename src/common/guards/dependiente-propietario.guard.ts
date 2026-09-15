import { Injectable, CanActivate, ExecutionContext, NotFoundException, BadRequestException, Inject } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { CurrentUserPayload } from '../interfaces/current-user.interface'

/**
 * Guard que autoriza operaciones realizadas **a nombre de un dependiente**.
 *
 * Busca el `dependienteId` en el body de la petición (`dependienteId`), en los
 * parámetros de ruta o en los query params (siempre con la clave explícita
 * `dependienteId`), y verifica que el documento `dependientes/{dependienteId}`
 * exista y pertenezca al tutor autenticado (`dependiente.tutorId === user.id`).
 *
 * Si no se envía `dependienteId`, el guard permite el paso (útil en endpoints
 * donde el dependiente es opcional). Si se envía, exige la autoría antes de
 * efectuar la transacción.
 *
 * Al validar, adjunta el documento del dependiente en `request.dependiente`
 * para evitar re-lecturas en el servicio.
 *
 * @example
 * ```ts
 * @Post('solicitudes')
 * @UseGuards(JwtAuthGuard, DependientePropietarioGuard)
 * @Roles('tutor')
 * create(@Body() dto: CrearSolicitudDto) { ... }
 * ```
 */
@Injectable()
export class DependientePropietarioGuard implements CanActivate {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const request = ctx.switchToHttp().getRequest()
    const user: CurrentUserPayload | undefined = request.user
    if (!user) return false

    // Solo se aceptan fuentes explícitas de `dependienteId` (body, ruta o query):
    // nunca se asume que un `:id` genérico de la ruta sea un dependiente.
    const dependienteId =
      request.body?.dependienteId ??
      request.params?.dependienteId ??
      request.query?.dependienteId

    // Sin dependienteId la acción es sobre el propio usuario: no hay nada que validar.
    if (!dependienteId) return true
    if (typeof dependienteId !== 'string') {
      throw new BadRequestException('dependienteId debe ser un string')
    }

    const doc = await this.db.collection(COLECCIONES.dependientes).doc(dependienteId).get()
    // Se usa NotFound (no Forbidden) para no filtrar la existencia de dependientes ajenos,
    // consistente con el resto del módulo de usuarios.
    if (!doc.exists || doc.data()?.tutorId !== user.id) {
      throw new NotFoundException('Dependiente no encontrado')
    }

    request.dependiente = { id: doc.id, ...doc.data() }
    return true
  }
}
