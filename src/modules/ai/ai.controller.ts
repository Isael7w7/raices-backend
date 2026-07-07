import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProperty } from '@nestjs/swagger'
import { IsString, IsArray, IsOptional } from 'class-validator'
import { AiService } from './ai.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

export class AiChatDto {
  @ApiProperty({ description: 'Mensaje del usuario', example: '¿Qué instituciones hay para autismo en Mérida?' })
  @IsString() message: string
  @ApiProperty({ description: 'Historial de chat previo', required: false, type: [Object] })
  @IsOptional() @IsArray() history?: any[]
}

export class AiRecommendDto {
  @ApiProperty({ description: 'ID de un dependiente para obtener recomendaciones personalizadas', required: false })
  @IsOptional() @IsString() dependent_id?: string
}

@ApiTags('AI')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly svc: AiService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Chat con asistente IA', description: 'Conversa con el asistente de Raíces. Usa el perfil del usuario para dar respuestas contextualizadas. Máximo 150 palabras por respuesta.' })
  @ApiResponse({ status: 200, description: 'Respuesta del asistente: { reply: string, mock: boolean }' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  chat(@Body() dto: AiChatDto, @CurrentUser() user: any) {
    return this.svc.chat(user.id, dto.message, dto.history ?? [])
  }

  @Post('recommendations')
  @ApiOperation({ summary: 'Recomendaciones personalizadas', description: 'Genera 3 próximos pasos concretos basados en el perfil del usuario o de un dependiente. Incluye sugerencias de instituciones.' })
  @ApiResponse({ status: 200, description: '{ next_steps: string[], reasoning: string, institution_suggestions: object[], mock: boolean }' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  recommend(@Body() dto: AiRecommendDto, @CurrentUser() user: any) {
    if (dto?.dependent_id) {
      return this.svc.recommendForDependent(user.id, dto.dependent_id)
    }
    return this.svc.recommend(user.id)
  }
}
