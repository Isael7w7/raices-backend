import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { MessagesService } from './messages.service'
import { EnviarDto } from './dto/enviar.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { FeatureGuard } from '../../common/guards/feature.guard'
import { Feature } from '../../common/decorators/feature.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'

@ApiTags('Mensajes')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('mensajes')
export class MessagesController {
  constructor(private readonly svc: MessagesService) {}

  @Get('conversaciones')
  @ApiOperation({ summary: 'Lista de conversaciones' })
  @ApiResponse({ status: 200, description: 'Lista de conversaciones con socio, último mensaje y conteo de no leídos' })
  conversations(@CurrentUser() user: CurrentUserPayload) {
    return this.svc.getConversations(user.id)
  }

  @Get('no-leidos')
  @ApiOperation({ summary: 'Conteo de mensajes no leídos' })
  @ApiResponse({ status: 200, description: 'Número total de no leídos' })
  unreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.svc.getUnreadCount(user.id)
  }

  @Get('con/:userId')
  @ApiOperation({ summary: 'Mensajes con un usuario' })
  @ApiParam({ name: 'userId', description: 'ID del usuario con quien se conversa' })
  @ApiResponse({ status: 200, description: 'Lista de mensajes ordenados cronológicamente' })
  getMessages(@Param('userId') socioId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.getMessages(user.id, socioId)
  }

  @Post('enviar/:userId')
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Feature('chat')
  @ApiOperation({ summary: 'Enviar mensaje' })
  @ApiParam({ name: 'userId', description: 'ID del usuario destinatario' })
  @ApiResponse({ status: 201, description: 'Mensaje enviado con éxito' })
  @ApiResponse({ status: 403, description: 'Funcionalidad de chat desactivada para tu cuenta, o no puedes enviarte mensajes a ti mismo, o usuario destino no existe' })
  send(@Param('userId') destinatarioId: string, @Body() dto: EnviarDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.sendMessage(user.id, destinatarioId, dto.contenido)
  }
}
