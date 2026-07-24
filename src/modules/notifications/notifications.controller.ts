import { Controller, Get, Patch, Param, UseGuards, Sse, MessageEvent, Res, HttpCode } from '@nestjs/common'
import { Observable, fromEvent } from 'rxjs'
import { map } from 'rxjs/operators'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { NotificationsService } from './notifications.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('Notificaciones')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('notificaciones')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar notificaciones', description: 'Retorna las últimas 50 notificaciones del usuario' })
  @ApiResponse({ status: 200, description: 'Lista de notificaciones (máx. 50)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  list(@CurrentUser() user: any) { return this.svc.findByUser(user.id) }

  @Patch(':id/leer')
  @HttpCode(204)
  @ApiOperation({ summary: 'Marcar notificación como leída' })
  @ApiParam({ name: 'id', description: 'ID de la notificación' })
  @ApiResponse({ status: 204, description: 'Notificación marcada como leída' })
  markRead(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.markRead(user.id, id)
  }

  @Patch('leer-todas')
  @HttpCode(204)
  @ApiOperation({ summary: 'Marcar todas como leídas', description: 'Marca todas las notificaciones no leídas del usuario como leídas' })
  @ApiResponse({ status: 204, description: 'Todas marcadas como leídas' })
  markAllRead(@CurrentUser() user: any) { return this.svc.markAllRead(user.id) }

  @Sse('flujo')
  @ApiOperation({ summary: 'Flujo de notificaciones en tiempo real', description: 'Eventos en tiempo real del servidor para recibir notificaciones instantáneas' })
  @ApiResponse({ status: 200, description: 'Flujo de eventos en tiempo real activo' })
  stream(@CurrentUser() user: any): Observable<MessageEvent> {
    const subject = this.svc.getStream(user.id)
    return subject.asObservable().pipe(
      map((data: any) => ({ data } as MessageEvent))
    )
  }
}
