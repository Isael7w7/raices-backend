import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProperty } from '@nestjs/swagger'
import { IsString, IsArray, IsOptional } from 'class-validator'
import { AiService } from './ai.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

export class ChatIaDto {
  @ApiProperty({ description: 'Mensaje del usuario', example: 'Que instituciones hay para autismo en Merida?' })
  @IsString() mensaje: string
  @ApiProperty({ description: 'Historial de conversación previa', required: false, type: [Object] })
  @IsOptional() @IsArray() historial?: any[]
}

export class RecomendacionIaDto {
  @ApiProperty({ description: 'ID de un dependiente para obtener recomendaciones personalizadas', required: false })
  @IsOptional() @IsString() dependienteId?: string
}

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
  chat(@Body() dto: ChatIaDto, @CurrentUser() user: any) {
    return this.svc.chat(user.id, dto.mensaje, dto.historial ?? [])
  }

  @Post('recomendaciones')
  @ApiOperation({ summary: 'Recomendaciones personalizadas', description: 'Genera 3 próximos pasos concretos basados en el perfil del usuario o de un dependiente. Incluye sugerencias de instituciones.' })
  @ApiResponse({ status: 200, description: '{ proximosPasos: string[], razonamiento: string, sugerenciasInstitucion: object[], simulado: boolean }' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  recommend(@Body() dto: RecomendacionIaDto, @CurrentUser() user: any) {
    if (dto?.dependienteId) {
      return this.svc.recommendForDependent(user.id, dto.dependienteId)
    }
    return this.svc.recommend(user.id)
  }
}
