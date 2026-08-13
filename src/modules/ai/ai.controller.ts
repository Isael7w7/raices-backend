import { Controller, Post, Body, Req, HttpCode, UseGuards } from '@nestjs/common'
import { Request } from 'express'
import { ApiTags, ApiOperation, ApiResponse, ApiOkResponse, ApiBearerAuth } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { AiService } from './ai.service'
import { ChatIaDto } from './dto/chat-ia.dto'
import { RecomendacionIaDto } from './dto/recomendacion-ia.dto'
import { RespuestaResumenDto } from './dto/resumen-ia.dto'
import { RespuestaChatDto, RespuestaRecomendacionDto } from './dto/respuestas-ia.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { DependientePropietarioGuard } from '../../common/guards/dependiente-propietario.guard'
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
  @UseGuards(JwtAuthGuard, DependientePropietarioGuard)
  @Throttle({ default: { limit: 10, ttl: 3600000 } }) // 10 recomendaciones por hora
  @ApiOperation({ summary: 'Recomendaciones personalizadas', description: 'Genera 3 próximos pasos concretos basados en el perfil del usuario o de un dependiente. Incluye sugerencias de instituciones. Si se envía dependienteId, se valida que el dependiente pertenezca al tutor autenticado.' })
  @ApiOkResponse({ type: RespuestaRecomendacionDto, description: 'Próximos pasos, razonamiento y sugerencias de instituciones' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Dependiente no encontrado o no pertenece al tutor' })
  recommend(@Body() dto: RecomendacionIaDto, @CurrentUser() user: CurrentUserPayload, @Req() req: Request) {
    if (dto?.dependienteId) {
      // DependientePropietarioGuard ya validó la autoría y adjuntó el documento en request.dependiente
      return this.svc.recommendForDependent(user.id, dto.dependienteId, (req as any).dependiente)
    }
    return this.svc.recommend(user.id)
  }

  // ═══════════════════════════════════════════════════════════════════
  // Resúmenes narrativos (Spec MVP Raíces)
  // ═══════════════════════════════════════════════════════════════════

  @Post('resumen')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 resúmenes por hora
  @ApiOperation({
    summary: 'Resumen narrativo del perfil',
    description: 'Genera un resumen de 1 párrafo (historia interpretativa) y 3 párrafos (quién eres, contexto, intereses/aspiraciones) basado estrictamente en los datos del usuario. NO inventa información no proporcionada.',
  })
  @ApiOkResponse({ type: RespuestaResumenDto, description: 'Resumen narrativo personalizado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  generarResumen(@CurrentUser() user: CurrentUserPayload) {
    return this.svc.generarResumen(user.id)
  }
}
