import { Controller, Get, Patch, Param, UseGuards, Sse, MessageEvent, Res, HttpCode } from '@nestjs/common'
import { Observable, fromEvent } from 'rxjs'
import { map } from 'rxjs/operators'
import { ApiTags, ApiOperation, ApiResponse, ApiOkResponse, ApiNoContentResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { NotificationsService } from './notifications.service'
import { NotificacionDto } from './dto/respuestas-notificacion.dto'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { UseETag } from '../../common/decorators/use-etag.decorator'

@ApiTags('Notificaciones')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('notificaciones')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  @UseETag()
  @ApiOperation({ summary: 'Listar notificaciones', description: 'Retorna las últimas 50 notificaciones del usuario' })
  @ApiOkResponse({ type: [NotificacionDto], description: 'Lista de notificaciones (máx. 50)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  list(@CurrentUser() user: CurrentUserPayload) { return this.svc.findByUser(user.id) }

  @Patch(':id/leer')
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 lecturas por minuto
  @HttpCode(204)
  @ApiOperation({ summary: 'Marcar notificación como leída' })
  @ApiParam({ name: 'id', description: 'ID de la notificación' })
  @ApiNoContentResponse({ description: 'Notificación marcada como leída' })
  markRead(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.markRead(user.id, id)
  }

  @Patch('leer-todas')
  @HttpCode(204)
  @ApiOperation({ summary: 'Marcar todas como leídas', description: 'Marca todas las notificaciones no leídas del usuario como leídas' })
  @ApiNoContentResponse({ description: 'Todas marcadas como leídas' })
  markAllRead(@CurrentUser() user: CurrentUserPayload) { return this.svc.markAllRead(user.id) }

  @Sse('flujo')
  @ApiOperation({ summary: 'Flujo de notificaciones en tiempo real', description: 'Eventos en tiempo real del servidor para recibir notificaciones instantáneas' })
  @ApiOkResponse({ description: 'Flujo de eventos en tiempo real activo' })
  stream(@CurrentUser() user: CurrentUserPayload): Observable<MessageEvent> {
    const subject = this.svc.getStream(user.id)
    return subject.asObservable().pipe(
      map((data: any) => ({ data } as MessageEvent))
    )
  }
}
