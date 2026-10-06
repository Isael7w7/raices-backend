import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger, ServiceUnavailableException, Inject } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import {
  MENSAJE_CSF_REQUERIDO,
  esPersonaMoral,
  puedeOperarComoPersonaMoral,
} from '../utils/verificacion-persona-moral'
import type { InstitucionDoc } from '../interfaces/firestore-documents.interface'

/**
 * Guard que verifica que una cuenta de PERSONA MORAL (institución o empresa)
 * cumpla la validación de entidad moral antes de realizar acciones sensibles
 * (crear/editar/eliminar vacantes, gestionar postulaciones, etc.).
 *
 * Reglas:
 *  - Sin usuario, o con un rol que NO es persona moral → deja pasar (los
 *    demás roles no se ven afectados).
 *  - `admin` → deja pasar siempre (ya lo filtra `@Roles`).
 *  - Persona moral con CSF cargada (`instituciones.documentoCsf`) O con
 *    aprobación de administrador (`instituciones.verificada`) → deja pasar.
 *  - Persona moral sin CSF y sin aprobación → 403 con un mensaje que NO
 *    menciona la CURP (esa validación no aplica a personas morales).
 *  - Persona moral que aún NO tiene documento de entidad → deja pasar: es el
 *    camino de registro y exigirle una CSF sería circular.
 *
 * La fuente de verdad es SIEMPRE el documento de `instituciones`, no
 * `perfiles.verificado`: el flujo de aprobación del administrador escribe
 * `instituciones.verificada` (ver AdminService) y nunca el campo del perfil,
 * así que usar el perfil haría que el guard y el servicio se contradijeran.
 *
 * Por qué se lee `instituciones.documentoCsf`: la CSF se sube en
 * `POST /api/instituciones/verificacion/documentos` con `tipo=csf` y se
 * guarda en el documento de la entidad, no en el perfil del usuario. Exigir
 * solo `verificada` (aprobación manual del admin) impedía publicar vacantes
 * a toda cuenta nueva sin una salida visible para el usuario.
 *
 * Depende de que JwtAuthGuard (FirebaseAuthGuard) haya cargado `request.user`
 * con el rol normalizado (empresa → institucion).
 *
 * @example
 * ```ts
 * @UseGuards(JwtAuthGuard, RolesGuard, InstitucionVerificadaGuard)
 * @Roles('institucion', 'empresa', 'admin')
 * ```
 */
@Injectable()
export class InstitucionVerificadaGuard implements CanActivate {
  private readonly logger = new Logger('InstitucionVerificadaGuard')

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const { user } = ctx.switchToHttp().getRequest()
    if (!user) return true

    if (user.rol === 'admin') return true
    if (!esPersonaMoral(user.rol)) return true

    const institucion = await this.leerInstitucion(user.id)

    // Sin documento de entidad todavía no hay nada que verificar: es el camino
    // de REGISTRO (ej. POST /instituciones). Exigirle la CSF sería circular
    // —la CSF se sube sobre el documento que aún no existe—. Se deja pasar y
    // el servicio responde con el error preciso ("no tienes una institución
    // registrada", "ya tienes una institución", etc.).
    if (institucion == null) return true

    if (puedeOperarComoPersonaMoral(institucion)) return true

    throw new ForbiddenException(MENSAJE_CSF_REQUERIDO)
  }

  /**
   * Lee el documento de la entidad moral: primero el canónico (id = UID, el que
   * crea el registro) y como respaldo los creados vía `POST /instituciones`
   * (id aleatorio, vinculados por `creadoPor`).
   *
   * Si Firestore falla NO se responde 403 con el mensaje de CSF (sería un
   * mensaje falso: no sabemos si la cuenta la tiene cargada), sino 503 para
   * que el cliente reintente sin decirle al usuario que haga algo que quizá
   * ya hizo.
   */
  private async leerInstitucion(usuarioId: string): Promise<InstitucionDoc | null> {
    try {
      const canonico = await this.db.collection(COLECCIONES.instituciones).doc(usuarioId).get()
      if (canonico.exists) return canonico.data() as InstitucionDoc

      const snap = await this.db.collection(COLECCIONES.instituciones)
        .where('creadoPor', '==', usuarioId).limit(1).get()
      return snap.empty ? null : (snap.docs[0].data() as InstitucionDoc)
    } catch (err: unknown) {
      this.logger.warn(
        `No se pudo leer la institución de ${usuarioId}: ${err instanceof Error ? err.message : String(err)}`,
      )
      throw new ServiceUnavailableException(
        'No se pudo verificar el estado de tu cuenta en este momento. Intenta de nuevo en unos segundos.',
      )
    }
  }
}