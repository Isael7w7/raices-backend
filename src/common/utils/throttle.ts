import type { ExecutionContext } from '@nestjs/common'

/**
 * Rate limiting por entorno (NODE_ENV).
 *
 * En producción se mantienen los límites estrictos (protección de costes de IA
 * y de abuso por IP). Fuera de producción (desarrollo, staging y tests) las
 * cuotas se amplían para que las pruebas e2e y manuales no se bloqueen con
 * `429 ThrottlerException: Too Many Requests`.
 *
 * El `limit` se devuelve como función (Resolvable<number> de @nestjs/throttler)
 * para que NODE_ENV se lea en cada petición y no en el import del módulo.
 */

/** True cuando el backend corre en producción. */
export function esProduccion(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * Opciones para el decorador `@Throttle()` con límite según entorno.
 *
 * @param limiteProduccion    cuota estricta cuando NODE_ENV === 'production'
 * @param limiteFueraDeProduccion cuota ampliada en dev/staging/tests
 * @param ttl                 ventana en ms (igual en ambos entornos)
 *
 * Ejemplo: `@Throttle(throttlePorEntorno(3, 30, 60000))`
 *   → producción: 3/min · fuera de producción: 30/min
 */
export function throttlePorEntorno(
  limiteProduccion: number,
  limiteFueraDeProduccion: number,
  ttl: number,
) {
  return {
    default: {
      limit: (_context: ExecutionContext): number =>
        esProduccion() ? limiteProduccion : limiteFueraDeProduccion,
      ttl,
    },
  }
}
