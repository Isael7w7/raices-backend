import { ExecutionContext, Inject, Injectable, Optional, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { FirebaseAuthGuard } from './firebase-auth.guard'

/**
 * Guard de autenticación OPCIONAL para endpoints "público/autenticados"
 * (p. ej. GET /api/eventos).
 *
 * - Si hay un token válido → `req.user` queda populado igual que con
 *   `JwtAuthGuard`, de modo que `@CurrentUser() user` devuelve la sesión.
 * - Si NO hay token (o es inválido) → la petición NO se rechaza: el guard
 *   devuelve `true` sin poblar `req.user` y el handler decide cómo seguir
 *   (`user` queda `undefined`).
 *
 * Sin esto, un endpoint sin guard recibe `req.user === undefined` y cualquier
 * `user.id` revienta con un 500.
 */
@Injectable()
export class AuthOpcionalGuard extends FirebaseAuthGuard {
  constructor(
    @Inject(FIRESTORE) db: Firestore,
    // Igual que FirebaseAuthGuard: si el módulo no provee ConfigService
    // (TestingModules de specs) se cae a process.env.
    @Optional() config?: ConfigService,
  ) {
    super(db, config)
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await super.canActivate(context)
    } catch (error) {
      // Sin token / token inválido / cuenta desactivada → seguimos anónimos.
      if (error instanceof UnauthorizedException) return true
      // El resto (p. ej. la defensa CSRF por origen no permitido) se propaga.
      throw error
    }
  }
}
