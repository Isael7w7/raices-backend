import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Inject } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers['authorization']

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de autenticación requerido')
    }

    const token = authHeader.split(' ')[1]

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

      request.user = {
        id: decodedToken.uid,
        email: perfil.email ?? decodedToken.email ?? '',
        rol: perfil.rol ?? 'user',
        nombreCompleto: perfil.nombreCompleto ?? decodedToken.name ?? '',
        verificado: perfil.verificado ?? false,
      }

      return true
    } catch (e: any) {
      if (e instanceof UnauthorizedException) throw e
      throw new UnauthorizedException('Token inválido o expirado')
    }
  }
}
