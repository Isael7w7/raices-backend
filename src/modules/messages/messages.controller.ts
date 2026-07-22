import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiProperty } from '@nestjs/swagger'
import { IsString, IsNotEmpty } from 'class-validator'
import { MessagesService } from './messages.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

export class EnviarDto {
  @ApiProperty({ description: 'Contenido del mensaje', example: 'Hola, me gustaria informacion sobre...' })
  @IsString() @IsNotEmpty() contenido: string
}

@ApiTags('Messages')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly svc: MessagesService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Lista de conversaciones' })
  @ApiResponse({ status: 200, description: 'Lista de conversaciones con socio, ultimo mensaje y conteo no leidos' })
  conversations(@CurrentUser() user: any) {
    return this.svc.getConversations(user.id)
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Conteo de mensajes no leidos' })
  @ApiResponse({ status: 200, description: 'Numero total de no leidos' })
  unreadCount(@CurrentUser() user: any) {
    return this.svc.getUnreadCount(user.id)
  }

  @Get('with/:userId')
  @ApiOperation({ summary: 'Mensajes con un usuario' })
  @ApiParam({ name: 'userId', description: 'ID del usuario con quien se conversa' })
  @ApiResponse({ status: 200, description: 'Lista de mensajes ordenados cronologicamente' })
  getMessages(@Param('userId') socioId: string, @CurrentUser() user: any) {
    return this.svc.getMessages(user.id, socioId)
  }

  @Post('send/:userId')
  @ApiOperation({ summary: 'Enviar mensaje' })
  @ApiParam({ name: 'userId', description: 'ID del usuario destinatario' })
  @ApiResponse({ status: 201, description: 'Mensaje enviado con exito' })
  @ApiResponse({ status: 403, description: 'No puedes enviarte mensajes a ti mismo o usuario no existe' })
  send(@Param('userId') destinatarioId: string, @Body() dto: EnviarDto, @CurrentUser() user: any) {
    return this.svc.sendMessage(user.id, destinatarioId, dto.contenido)
  }
}
