import { Injectable } from '@nestjs/common'
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler'

/**
 * Guard custom que extiende ThrottlerGuard para corregir el error
 * "no elements in sequence" (RxJS EmptyErrorImpl) que ocurre cuando
 * @nestjs/throttler v6 intenta usar `lastValueFrom` sobre un observable
 * que se completa sin emitir valores al rechazar una petición.
 *
 * La solución es sobrescribir `handleRequest` para lanzar la excepción
 * directamente en vez de devolver un observable vacío.
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  async handleRequest(
    ...args: Parameters<ThrottlerGuard['handleRequest']>
  ): Promise<boolean> {
    try {
      return await super.handleRequest(...args)
    } catch (err) {
      // Si handleRequest lanza ThrottlerException, relanzarla directamente
      // para que NestJS la maneje como HTTP 429 correctamente.
      if (err instanceof ThrottlerException) {
        throw err
      }
      // Para otros errores (incluyendo EmptyErrorImpl de RxJS),
      // lanzar ThrottlerException como fallback.
      throw new ThrottlerException('Too Many Requests')
    }
  }
}
