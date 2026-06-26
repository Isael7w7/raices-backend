import { Controller, Get, Patch, Param, UseGuards, Sse, MessageEvent, Res } from '@nestjs/common'
import { Observable, fromEvent } from 'rxjs'
import { map } from 'rxjs/operators'
import { NotificationsService } from './notifications.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: any) { return this.svc.findByUser(user.id) }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.markRead(user.id, id)
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: any) { return this.svc.markAllRead(user.id) }

  @Sse('stream')
  stream(@CurrentUser() user: any): Observable<MessageEvent> {
    const subject = this.svc.getStream(user.id)
    return subject.asObservable().pipe(
      map((data: any) => ({ data } as MessageEvent))
    )
  }
}
