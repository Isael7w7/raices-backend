import { Controller, Get, Patch, Param, UseGuards, Sse, MessageEvent, Res } from '@nestjs/common'
import { Observable, fromEvent } from 'rxjs'
import { map } from 'rxjs/operators'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { NotificationsService } from './notifications.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('Notifications')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar notificaciones', description: 'Retorna las últimas 50 notificaciones del usuario' })
  @ApiResponse({ status: 200, description: 'Lista de notificaciones (máx. 50)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  list(@CurrentUser() user: any) { return this.svc.findByUser(user.id) }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar notificación como leída' })
  @ApiParam({ name: 'id', description: 'ID de la notificación' })
  @ApiResponse({ status: 200, description: 'Notificación marcada como leída' })
  markRead(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.markRead(user.id, id)
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marcar todas como leídas', description: 'Marca todas las notificaciones no leídas del usuario como leídas' })
  @ApiResponse({ status: 200, description: 'Todas marcadas como leídas' })
  markAllRead(@CurrentUser() user: any) { return this.svc.markAllRead(user.id) }

  @Sse('stream')
  @ApiOperation({ summary: 'Stream de notificaciones en tiempo real', description: 'Server-Sent Events para recibir notificaciones instantáneas' })
  @ApiResponse({ status: 200, description: 'Stream SSE activo' })
  stream(@CurrentUser() user: any): Observable<MessageEvent> {
    const subject = this.svc.getStream(user.id)
    return subject.asObservable().pipe(
      map((data: any) => ({ data } as MessageEvent))
    )
  }
}
