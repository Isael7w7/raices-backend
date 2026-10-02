import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler'
import type { ThrottlerLimitDetail } from '@nestjs/throttler'

/** Mensaje 429 para los endpoints de IA (resumen, recomendaciones, generación de rutas). */
export const MENSAJE_429_IA =
  'Has superado el límite de peticiones de IA. Por favor espera un momento antes de reintentar.'

/** Mensaje 429 genérico para el resto de endpoints. */
export const MENSAJE_429_GENERICO =
  'Has superado el límite de peticiones. Por favor espera un momento antes de reintentar.'

/** Controladores cuyos endpoints responden con el mensaje 429 de IA. */
const CONTROLADORES_IA = new Set(['AiController'])

/** Handlers sueltos (fuera de AiController) que también consumen IA. */
const HANDLERS_IA = new Set(['generarRutaPersonalizada'])

/**
 * Guard custom que extiende ThrottlerGuard para corregir el error
 * "no elements in sequence" (RxJS EmptyErrorImpl) que ocurre cuando
 * @nestjs/throttler v6 intenta usar `lastValueFrom` sobre un observable
 * que se completa sin emitir valores al rechazar una petición.
 *
 * Además, personaliza el cuerpo del 429 para que el Frontend reciba una
 * estructura entendible:
 *
 *   { "statusCode": 429, "message": "Has superado el límite ...", "ttl": 60 }
 *
 * donde `ttl` son los segundos restantes hasta reiniciar la ventana.
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  async handleRequest(
    ...args: Parameters<ThrottlerGuard['handleRequest']>
  ): Promise<boolean> {
    try {
      return await super.handleRequest(...args)
    } catch (err) {
      // HttpException (incluida ThrottlerException y la 429 con cuerpo propio
      // lanzada por throwThrottlingException) se propaga tal cual.
      if (err instanceof HttpException) {
        throw err
      }
      // Para otros errores (incluyendo EmptyErrorImpl de RxJS),
      // lanzar ThrottlerException como fallback.
      throw new ThrottlerException('Too Many Requests')
    }
  }

  /**
   * Lanza la excepción 429 con cuerpo estructurado para el Frontend.
   * `timeToBlockExpire` llega en segundos desde el storage del throttler.
   */
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const esEndpointIa =
      CONTROLADORES_IA.has(context.getClass().name) ||
      HANDLERS_IA.has(context.getHandler().name)

    const ttlSegundos = Math.max(
      1,
      Math.round(throttlerLimitDetail.timeToBlockExpire) ||
        Math.ceil(throttlerLimitDetail.ttl / 1000),
    )

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: esEndpointIa ? MENSAJE_429_IA : MENSAJE_429_GENERICO,
        ttl: ttlSegundos,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    )
  }
}
