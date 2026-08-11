import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException, Inject, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Firestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { FEATURES_POR_DEFECTO } from '../interfaces/feature-flags.interface'
import { parseCookies, NOMBRE_COOKIE_ACCESO } from '../utils/cookies'
import { esOrigenPermitido, obtenerOrigenesPermitidos } from '../utils/cors-origins'

// Métodos HTTP que no modifican estado (no requieren validación de origen CSRF).
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS'])

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private origenesPermitidos?: string[]

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    // Opcional: algunos TestingModules de specs no proveen ConfigService.
    // En ese caso se cae a process.env, que es lo que ConfigService lee igual.
    @Optional() private readonly config?: ConfigService,
  ) {}

  /** Lista de orígenes permitidos, calculada una sola vez (CORS_ORIGINS no cambia en runtime). */
  private obtenerOrigenes(): string[] {
    if (!this.origenesPermitidos) {
      const config = this.config ?? { get: (key: string) => process.env[key] }
      this.origenesPermitidos = obtenerOrigenesPermitidos(config)
    }
    return this.origenesPermitidos
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers['authorization']
    const esBearer = authHeader?.startsWith('Bearer ') ?? false

    // 1. Extraer token: header Bearer (compatibilidad con clientes existentes)
    //    o cookie httpOnly 'token_acceso' (invisible para JS, inmune a XSS).
    //    El header gana si ambos están presentes. Nota: si llega un header que
    //    no es Bearer (p. ej. 'Basic ...') se cae a la cookie — comportamiento
    //    aceptable mientras no existan otros esquemas de autenticación.
    let token: string | undefined
    if (esBearer) {
      token = authHeader.split(' ')[1]
    } else {
      token = parseCookies(request.headers?.cookie)[NOMBRE_COOKIE_ACCESO]
    }

    if (!token) {
      throw new UnauthorizedException('Token de autenticación requerido')
    }

    // 2. Defensa CSRF (defensa en profundidad): si la sesión vino de la cookie
    //    y el método puede modificar estado, el navegador debe declarar un
    //    origen permitido. Con sameSite=lax la cookie no viaja en POST
    //    cross-site, pero si un despliegue configura sameSite=none (frontend
    //    cross-site), esta verificación bloquea la CSRF.
    if (!esBearer && !METODOS_SEGUROS.has(request.method)) {
      const origin = request.headers['origin'] as string | undefined
      if (!esOrigenPermitido(origin, this.obtenerOrigenes())) {
        throw new ForbiddenException('Origen no permitido (posible CSRF)')
      }
    }

    try {
      const decodedToken = await getAuth().verifyIdToken(token)

      const doc = await this.db.collection(COLECCIONES.perfiles).doc(decodedToken.uid).get()
      if (!doc.exists) {
        throw new UnauthorizedException('Usuario no encontrado')
      }

      const perfil = doc.data()
      if (!perfil) {
        throw new UnauthorizedException('Usuario no encontrado')
      }
      if (perfil.activo === false) {
        throw new UnauthorizedException('Cuenta desactivada')
      }

      // Normalizar rol legacy 'institution' (inglés) → 'institucion' (canónico)
      const rolCrudo = perfil.rol ?? 'user'
      const rol = rolCrudo === 'institution' ? 'institucion' : rolCrudo

      request.user = {
        id: decodedToken.uid,
        email: perfil.email ?? decodedToken.email ?? '',
        rol,
        nombreCompleto: perfil.nombreCompleto ?? decodedToken.name ?? '',
        verificado: perfil.verificado ?? false,
        tutorId: perfil.tutorId ?? null,
        features: perfil.features ?? { ...FEATURES_POR_DEFECTO },
      }

      return true
    } catch (e: any) {
      if (e instanceof UnauthorizedException) throw e
      throw new UnauthorizedException('Token inválido o expirado')
    }
  }
}
