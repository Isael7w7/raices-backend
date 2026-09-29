import { Controller, Post, Body, HttpCode, Ip, Headers } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { ApiTags, ApiOperation, ApiBody, ApiCreatedResponse, ApiResponse } from '@nestjs/swagger'
import { ContactoService } from './contacto.service'
import { CrearMensajeContactoDto } from './dto/crear-mensaje-contacto.dto'
import { ResultadoMensajeContactoDto } from './dto/resultado-mensaje-contacto.dto'

// El CustomThrottlerGuard ya está registrado globalmente (APP_GUARD):
// el @Throttle del endpoint añade su límite específico sobre el global.
@ApiTags('Contacto')
@Controller('contacto')
export class ContactoController {
  constructor(private readonly svc: ContactoService) {}

  // Anti-spam: máximo 3 mensajes por IP cada 10 minutos (el endpoint es público).
  @Post()
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  @HttpCode(201)
  @ApiOperation({
    summary: 'Enviar mensaje de contacto',
    description: 'Recibe un mensaje desde la landing de contacto (público, sin autenticación) y lo persiste en Firestore para su seguimiento. Rate limited: 3 mensajes por IP cada 10 minutos.',
  })
  @ApiBody({ type: CrearMensajeContactoDto })
  @ApiCreatedResponse({ type: ResultadoMensajeContactoDto, description: 'Mensaje guardado correctamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos (validación class-validator)' })
  @ApiResponse({ status: 429, description: 'Demasiados mensajes desde esta IP' })
  enviar(
    @Body() dto: CrearMensajeContactoDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.svc.guardarMensaje(dto, { ip, userAgent })
  }
}
