import { HttpException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { ThrottlerLimitDetail } from '@nestjs/throttler'
import { CustomThrottlerGuard, MENSAJE_429_IA, MENSAJE_429_GENERICO } from './custom-throttler.guard'
import { throttlePorEntorno, esProduccion } from '../utils/throttle'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * CUSTOM THROTTLER GUARD + THROTTLE POR ENTORNO — Unit Tests
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Cuerpo del 429: { statusCode, message, ttl } entendible por el Frontend
 * 2. Mensaje específico para endpoints de IA, genérico para el resto
 * 3. Límites de @Throttle según NODE_ENV (producción estricta, dev ampliada)
 * ══════════════════════════════════════════════════════════════════════════════
 */

function contextoCon(nombreClase: string, nombreHandler: string): ExecutionContext {
  return {
    getClass: () => ({ name: nombreClase }),
    getHandler: () => ({ name: nombreHandler }),
  } as unknown as ExecutionContext
}

function detalle(timeToBlockExpire: number, ttl = 60000): ThrottlerLimitDetail {
  return {
    totalHits: 99,
    timeToExpire: Math.ceil(ttl / 1000),
    isBlocked: true,
    timeToBlockExpire,
    ttl,
    limit: 5,
    key: 'key',
    tracker: '127.0.0.1',
  }
}

async function lanzar429(context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<HttpException> {
  const guard = new CustomThrottlerGuard([], {} as never, new Reflector())
  try {
    await (guard as unknown as { throwThrottlingException(c: ExecutionContext, d: ThrottlerLimitDetail): Promise<void> })
      .throwThrottlingException(context, detail)
  } catch (err) {
    return err as HttpException
  }
  throw new Error('throwThrottlingException no lanzó ninguna excepción')
}

describe('CustomThrottlerGuard', () => {
  describe('Cuerpo de la respuesta 429', () => {
    it('devuelve statusCode, message y ttl (segundos) para endpoints de IA', async () => {
      const err = await lanzar429(contextoCon('AiController', 'generarResumen'), detalle(60))

      expect(err).toBeInstanceOf(HttpException)
      expect(err.getStatus()).toBe(429)
      expect(err.getResponse()).toEqual({
        statusCode: 429,
        message: MENSAJE_429_IA,
        ttl: 60,
      })
    })

    it('usa el mensaje de IA en generar-personalizada (fuera de AiController)', async () => {
      const err = await lanzar429(
        contextoCon('RoutesController', 'generarRutaPersonalizada'),
        detalle(600),
      )

      expect(err.getResponse()).toEqual({
        statusCode: 429,
        message: MENSAJE_429_IA,
        ttl: 600,
      })
    })

    it('usa un mensaje genérico en endpoints no relacionados con IA', async () => {
      const err = await lanzar429(contextoCon('AuthController', 'login'), detalle(60))

      expect(err.getResponse()).toEqual({
        statusCode: 429,
        message: MENSAJE_429_GENERICO,
        ttl: 60,
      })
    })

    it('usa el ttl de la ventana cuando timeToBlockExpire viene en 0', async () => {
      const err = await lanzar429(contextoCon('AiController', 'chat'), detalle(0, 3600000))

      expect(err.getResponse()).toEqual({
        statusCode: 429,
        message: MENSAJE_429_IA,
        ttl: 3600,
      })
    })

    it('el ttl restante nunca es menor a 1 segundo', async () => {
      const err = await lanzar429(contextoCon('AiController', 'chat'), detalle(-5))

      expect((err.getResponse() as { ttl: number }).ttl).toBeGreaterThanOrEqual(1)
    })
  })

})

describe('throttlePorEntorno', () => {
  const nodoEnvOriginal = process.env.NODE_ENV

  afterEach(() => {
    if (nodoEnvOriginal === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = nodoEnvOriginal
  })

  it('aplica el límite estricto en producción', () => {
    process.env.NODE_ENV = 'production'
    const opciones = throttlePorEntorno(3, 30, 60000)

    expect(esProduccion()).toBe(true)
    expect(opciones.default.limit({} as ExecutionContext)).toBe(3)
    expect(opciones.default.ttl).toBe(60000)
  })

  it('aplica el límite ampliado fuera de producción (dev/staging/tests)', () => {
    for (const env of ['development', 'staging', 'test', undefined]) {
      if (env === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = env

      const opciones = throttlePorEntorno(3, 30, 60000)
      expect(esProduccion()).toBe(false)
      expect(opciones.default.limit({} as ExecutionContext)).toBe(30)
    }
  })

  it('resuelve el límite en cada petición (no al importar el módulo)', () => {
    const opciones = throttlePorEntorno(5, 100, 3600000)
    process.env.NODE_ENV = 'production'
    expect(opciones.default.limit({} as ExecutionContext)).toBe(5)

    process.env.NODE_ENV = 'development'
    expect(opciones.default.limit({} as ExecutionContext)).toBe(100)
  })
})
