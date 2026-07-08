import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { getAuth } from 'firebase-admin/auth'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers['authorization']
    console.log('🛡️ [JwtAuthGuard] canActivate - Authorization header:', authHeader ? authHeader.substring(0, 50) + '...' : 'MISSING')
    console.log('🛡️ [JwtAuthGuard] canActivate - Request URL:', request.url)
    console.log('🛡️ [JwtAuthGuard] canActivate - Request method:', request.method)

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
        console.log('✅ [JwtAuthGuard] Firebase Auth verification SUCCESS - uid:', decodedToken.uid)
        return true
      } catch (err: any) {
        console.log('⚠️ [JwtAuthGuard] Firebase Auth verification failed, falling back to passport-jwt:', err.message)
      }
    }

    // Fall back to passport-jwt (for backend-generated HS256 tokens)
    // cast: in HTTP context super.canActivate always returns boolean, not Observable
    return super.canActivate(context) as Promise<boolean>
  }

  handleRequest(err: any, user: any, info: any) {
    console.log('🛡️ [JwtAuthGuard] handleRequest called')
    console.log('🛡️ [JwtAuthGuard] err:', err ? err.message || err.toString() : 'none')
    console.log('🛡️ [JwtAuthGuard] user:', user ? JSON.stringify(user) : 'none')
    console.log('🛡️ [JwtAuthGuard] info:', info ? JSON.stringify(info) : 'none')

    if (info) {
      console.log('🛡️ [JwtAuthGuard] info.name:', info.name)
      console.log('🛡️ [JwtAuthGuard] info.message:', info.message)
    }

    if (err || !user) {
      console.log('❌ [JwtAuthGuard] Authentication FAILED')
      throw err || new (require('@nestjs/common').UnauthorizedException)('No autenticado')
    }

    console.log('✅ [JwtAuthGuard] Authentication SUCCESS')
    return user
  }
}
