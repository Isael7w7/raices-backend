import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { seguridadHeaders } from '../middleware/security-headers.middleware'

/**
 * Pipe global de validación/transformación de la API.
 *
 * Compartido por `src/main.ts` (producción) y `test/helpers/app.e2e.ts`
 * (contrato HTTP en pruebas): cuando ambos usan la misma configuración no es
 * posible que un endpoint funcione en tests y falle desplegado.
 *
 * - `transform`: convierte la query a los tipos declarados en el DTO (los
 *   parámetros HTTP llegan siempre como cadena: `pagina="1"`, `proximos="true"`).
 * - `enableImplicitConversion`: aplica la conversión implícita basada en el
 *   tipo de diseño del DTO; sin ella `pagina`/`limite` numéricos producen 400.
 * - `whitelist`: elimina propiedades no decoradas del payload.
 */
export function crearValidationPipeGlobal(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  })
}

/**
 * Aplica la configuración global compartida (cabeceras de seguridad + pipe de
 * validación). Debe invocarse antes de `app.init()`.
 */
export function configurarAppGlobal(app: INestApplication): void {
  app.use(seguridadHeaders)
  app.useGlobalPipes(crearValidationPipeGlobal())
}
