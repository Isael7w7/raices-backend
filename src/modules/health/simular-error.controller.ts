import { Controller, Get, InternalServerErrorException } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'

/**
 * Endpoint de prueba para verificar la observabilidad de errores 5xx.
 *
 * SEGURIDAD: el controlador solo se registra en el módulo de salud cuando
 * NODE_ENV !== 'production' (ver health.module.ts), por lo que NO existe en la
 * API de producción. Permite disparar un 500 controlado en local/staging para
 * comprobar que:
 *   1. GlobalExceptionFilter emite un log JSON con severity=ERROR y statusCode=500.
 *   2. La log-based metric `critical_errors_counter` incrementa.
 *   3. La alerting policy dispara la notificación (email / Slack).
 */
@ApiTags('Salud')
// Ruta de infraestructura de pruebas: no debe recibir 429 durante un smoke test
@SkipThrottle()
@Controller('health')
export class SimularErrorController {
  @Get('simular-error-500')
  @ApiOperation({
    summary: 'Simula un error 500 (solo si NODE_ENV !== production)',
    description:
      'Lanza una InternalServerErrorException controlada. Existe únicamente fuera de producción ' +
      'y se usa para disparar de forma intencional la alerta "Errores críticos 5xx" de Cloud Monitoring.',
  })
  @ApiResponse({ status: 500, description: 'Error 500 simulado (esperado; genera el log crítico)' })
  simularError500(): never {
    throw new InternalServerErrorException(
      'Simulación controlada de error 500 para probar la alerta de observabilidad de GCP',
    )
  }
}
