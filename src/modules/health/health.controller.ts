import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { ApiTags, ApiOperation, ApiResponse, ApiOkResponse } from '@nestjs/swagger'
import { HealthService, ResultadoHealth } from './health.service'
import { ResultadoHealthDto } from './dto/respuesta-salud.dto'

@ApiTags('Salud')
// Ruta de infraestructura: las probes de Docker/Cloud Run nunca deben recibir 429
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Health check',
    description: 'Comprueba el estado del proceso y la conectividad con Firestore. Usado por Docker / Cloud Run como healthcheck.',
  })
  @ApiOkResponse({ type: ResultadoHealthDto, description: 'Servicio saludable (proceso y Firestore operativos)' })
  @ApiResponse({ status: 503, description: 'Servicio degradado: Firestore inaccesible' })
  async check(): Promise<ResultadoHealth> {
    const resultado = await this.healthService.check()
    if (resultado.status !== 'ok') {
      throw new ServiceUnavailableException(resultado)
    }
    return resultado
  }
}
