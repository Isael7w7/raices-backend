import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiOkResponse, ApiCreatedResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { MessagesService } from './messages.service'
import { EnviarDto } from './dto/enviar.dto'
import { ConversacionDto, MensajeDto, EliminarConversacionDto } from './dto/respuestas-mensajes.dto'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { FeatureGuard } from '../../common/guards/feature.guard'
import { Feature } from '../../common/decorators/feature.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { UseETag } from '../../common/decorators/use-etag.decorator'

@ApiTags('Mensajes')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('mensajes')
export class MessagesController {
  constructor(private readonly svc: MessagesService) {}

  @Get('conversaciones')
  @UseETag()
  @ApiOperation({ summary: 'Lista de conversaciones', description: 'Devuelve el historial agrupado por socio. Si el socio es un usuario eliminado (perfil inexistente o cuenta desactivada), el historial se conserva y la conversación llega marcada con `isDeleted: true` para que el cliente la muestre como "Usuario Eliminado" y bloquee el envío.' })
  @ApiOkResponse({ type: [ConversacionDto], description: 'Lista de conversaciones con socio, último mensaje, conteo de no leídos y el estado del destinatario' })
  conversations(@CurrentUser() user: CurrentUserPayload) {
    return this.svc.getConversations(user.id)
  }

  @Get('no-leidos')
  @UseETag()
  @ApiOperation({ summary: 'Conteo de mensajes no leídos' })
  @ApiOkResponse({ type: Number, description: 'Número total de no leídos' })
  unreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.svc.getUnreadCount(user.id)
  }

  @Get('con/:userId')
  @UseETag()
  @ApiOperation({ summary: 'Mensajes con un usuario' })
  @ApiParam({ name: 'userId', description: 'ID del usuario con quien se conversa' })
  @ApiOkResponse({ type: [MensajeDto], description: 'Lista de mensajes ordenados cronológicamente' })
  getMessages(@Param('userId') socioId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.getMessages(user.id, socioId)
  }

  @Post('enviar/:userId')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 mensajes por minuto
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Feature('chat')
  @ApiOperation({ summary: 'Enviar mensaje' })
  @ApiParam({ name: 'userId', description: 'ID del usuario destinatario' })
  @ApiCreatedResponse({ type: MensajeDto, description: 'Mensaje enviado con éxito' })
  @ApiResponse({ status: 403, description: 'Funcionalidad de chat desactivada para tu cuenta, o no puedes enviarte mensajes a ti mismo, o usuario destino no existe' })
  send(@Param('userId') destinatarioId: string, @Body() dto: EnviarDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.sendMessage(user, destinatarioId, dto.contenido, dto.mediaUrl)
  }

  @Patch('leer/:userId')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Marcar conversación como leída', description: 'Marca como leídos todos los mensajes recibidos del usuario indicado. Lo llama el cliente al abrir una conversación.' })
  @ApiParam({ name: 'userId', description: 'ID del socio de la conversación' })
  @ApiOkResponse({ description: 'Mensajes marcados como leídos', schema: { type: 'object', properties: { actualizados: { type: 'number', example: 3 } } } })
  @ApiResponse({ status: 403, description: 'No puedes marcar tu propia conversación' })
  marcarLeida(@Param('userId') socioId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.marcarConversacionLeida(user.id, socioId)
  }

  @Delete('conversacion/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Eliminar conversación',
    description: 'Quita la conversación de la lista del usuario autenticado. Es un borrado lógico por usuario (`eliminadoPor`): los mensajes no se destruyen en Firestore y la contraparte conserva su propio historial. Siempre responde 200, incluso si la conversación ya no existía.',
  })
  @ApiParam({ name: 'userId', description: 'ID del usuario con quien se tiene la conversación' })
  @ApiOkResponse({ type: EliminarConversacionDto, description: 'Confirmación de eliminación del historial' })
  @ApiResponse({ status: 403, description: 'No puedes eliminar tu propia conversación' })
  eliminarConversacion(@Param('userId') socioId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.deleteConversation(user.id, socioId)
  }
}
