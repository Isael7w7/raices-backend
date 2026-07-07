import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiProperty } from '@nestjs/swagger'
import { IsString, IsNotEmpty } from 'class-validator'
import { MessagesService } from './messages.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

export class SendDto {
  @ApiProperty({ description: 'Contenido del mensaje', example: 'Hola, me gustaría información sobre...' })
  @IsString() @IsNotEmpty() content: string
}

@ApiTags('Messages')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly svc: MessagesService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Lista de conversaciones', description: 'Retorna conversaciones ordenadas por último mensaje, con conteo de no leídos' })
  @ApiResponse({ status: 200, description: 'Lista de conversaciones con partner, último mensaje y unread count' })
  conversations(@CurrentUser() user: any) {
    return this.svc.getConversations(user.id)
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Conteo de mensajes no leídos', description: 'Retorna el total de mensajes sin leer de todas las conversaciones' })
  @ApiResponse({ status: 200, description: 'Número total de no leídos' })
  unreadCount(@CurrentUser() user: any) {
    return this.svc.getUnreadCount(user.id)
  }

  @Get('with/:userId')
  @ApiOperation({ summary: 'Mensajes con un usuario', description: 'Retorna el historial de mensajes y marca como leídos los no leídos del destinatario' })
  @ApiParam({ name: 'userId', description: 'ID del usuario con quien se conversa' })
  @ApiResponse({ status: 200, description: 'Lista de mensajes ordenados cronológicamente' })
  getMessages(@Param('userId') partnerId: string, @CurrentUser() user: any) {
    return this.svc.getMessages(user.id, partnerId)
  }

  @Post('send/:userId')
  @ApiOperation({ summary: 'Enviar mensaje', description: 'Envía un mensaje directo a otro usuario. No puedes enviarte mensajes a ti mismo.' })
  @ApiParam({ name: 'userId', description: 'ID del usuario destinatario' })
  @ApiResponse({ status: 201, description: 'Mensaje enviado con éxito' })
  @ApiResponse({ status: 403, description: 'No puedes enviarte mensajes a ti mismo o usuario no existe' })
  send(@Param('userId') toId: string, @Body() dto: SendDto, @CurrentUser() user: any) {
    return this.svc.sendMessage(user.id, toId, dto.content)
  }
}
