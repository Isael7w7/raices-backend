import { Controller, Post, Body, HttpCode, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiOkResponse, ApiBearerAuth } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { AiService } from './ai.service'
import { ChatIaDto } from './dto/chat-ia.dto'
import { RecomendacionIaDto } from './dto/recomendacion-ia.dto'
import { RespuestaChatDto, RespuestaRecomendacionDto } from './dto/respuestas-ia.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'

@ApiTags('Inteligencia Artificial')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('ia')
export class AiController {
  constructor(private readonly svc: AiService) {}

  @Post('conversacion')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 3600000 } }) // 20 chats por hora
  @ApiOperation({ summary: 'Conversación con asistente IA', description: 'Conversa con el asistente de Raíces. Usa el perfil del usuario para dar respuestas contextualizadas. Máximo 150 palabras por respuesta.' })
  @ApiOkResponse({ type: RespuestaChatDto, description: 'Respuesta del asistente' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  chat(@Body() dto: ChatIaDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.chat(user.id, dto.mensaje, dto.historial ?? [])
  }

  @Post('recomendaciones')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 3600000 } }) // 10 recomendaciones por hora
  @ApiOperation({ summary: 'Recomendaciones personalizadas', description: 'Genera 3 próximos pasos concretos basados en el perfil del usuario o de un dependiente. Incluye sugerencias de instituciones.' })
  @ApiOkResponse({ type: RespuestaRecomendacionDto, description: 'Próximos pasos, razonamiento y sugerencias de instituciones' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  recommend(@Body() dto: RecomendacionIaDto, @CurrentUser() user: CurrentUserPayload) {
    if (dto?.dependienteId) {
      return this.svc.recommendForDependent(user.id, dto.dependienteId)
    }
    return this.svc.recommend(user.id)
  }
}
