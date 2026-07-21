import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { getAuth } from 'firebase-admin/auth'

/**
 * Guard that validates Firebase ID Tokens from the Authorization header.
 *
 * The frontend sends: `Authorization: Bearer <firebase-id-token>`
 * This guard verifies the token with Firebase Admin SDK and attaches
 * the decoded user (uid, email, role) to `request.user`.
 *
 * No local JWT or passport-jwt is used.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers['authorization']

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de autenticación requerido')
    }

    const token = authHeader.split(' ')[1]
    if (!token) {
      throw new UnauthorizedException('Token de autenticación requerido')
    }

    try {
      const decodedToken = await getAuth().verifyIdToken(token)

      // Attach the decoded user to the request so @CurrentUser() can access it
      request.user = {
        id: decodedToken.uid,
        email: decodedToken.email,
        role: (decodedToken as any).role ?? null,
      }

      return true
    } catch (error: any) {
      // Common Firebase error codes: auth/id-token-expired, auth/id-token-revoked, auth/invalid-id-token
      const code: string = error?.errorInfo?.code ?? error?.message ?? 'unknown'
      throw new UnauthorizedException(`Token inválido: ${code}`)
    }
  }
}
