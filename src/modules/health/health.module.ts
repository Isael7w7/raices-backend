import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'
import { HealthService } from './health.service'
import { SimularErrorController } from './simular-error.controller'

/**
 * Controladores del módulo de salud.
 *
 * SimularErrorController (500 de prueba para la alerta de GCP) solo se registra
 * cuando NODE_ENV !== 'production': en producción el endpoint no existe, así
 * que nadie puede generar errores 5xx sintéticos contra la API real. Ver
 * docs/OBSERVABILIDAD-ERRORES-GCP.md para el procedimiento de prueba.
 */
const controllers =
  process.env.NODE_ENV !== 'production'
    ? [HealthController, SimularErrorController]
    : [HealthController]

@Module({ controllers: [...controllers], providers: [HealthService] })
export class HealthModule {}
