import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { getAuth } from 'firebase-admin/auth'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers['authorization']

    // Try Firebase Auth verification first (works with emulator & production)
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1]
      try {
        const decodedToken = await getAuth().verifyIdToken(token)
        request.user = {
          id: decodedToken.uid,
          email: decodedToken.email,
          role: (decodedToken as any).role,
        }
        return true
      } catch {
        // Firebase token invalid, fall back to passport-jwt
      }
    }

    // Fall back to passport-jwt (for backend-generated HS256 tokens)
    return super.canActivate(context) as Promise<boolean>
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('No autenticado')
    }
    return user
  }
}
