import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import { AiService } from './ai.service'
import { ChatIaDto } from './dto/chat-ia.dto'
import { RecomendacionIaDto } from './dto/recomendacion-ia.dto'
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
  @ApiOperation({ summary: 'Conversación con asistente IA', description: 'Conversa con el asistente de Raíces. Usa el perfil del usuario para dar respuestas contextualizadas. Máximo 150 palabras por respuesta.' })
  @ApiResponse({ status: 200, description: 'Respuesta del asistente: { respuesta: string, simulado: boolean }' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  chat(@Body() dto: ChatIaDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.chat(user.id, dto.mensaje, dto.historial ?? [])
  }

  @Post('recomendaciones')
  @ApiOperation({ summary: 'Recomendaciones personalizadas', description: 'Genera 3 próximos pasos concretos basados en el perfil del usuario o de un dependiente. Incluye sugerencias de instituciones.' })
  @ApiResponse({ status: 200, description: '{ proximosPasos: string[], razonamiento: string, sugerenciasInstitucion: object[], simulado: boolean }' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  recommend(@Body() dto: RecomendacionIaDto, @CurrentUser() user: CurrentUserPayload) {
    if (dto?.dependienteId) {
      return this.svc.recommendForDependent(user.id, dto.dependienteId)
    }
    return this.svc.recommend(user.id)
  }
}
