import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers['authorization']
    console.log('🛡️ [JwtAuthGuard] canActivate - Authorization header:', authHeader ? authHeader.substring(0, 50) + '...' : 'MISSING')
    console.log('🛡️ [JwtAuthGuard] canActivate - Request URL:', request.url)
    console.log('🛡️ [JwtAuthGuard] canActivate - Request method:', request.method)
    return super.canActivate(context)
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
