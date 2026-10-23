import { Module } from '@nestjs/common'
import { CommunityController } from './community.controller'
import { EventosApiController } from './eventos-api.controller'
import { EventosService } from './eventos.service'
import { CommunityService } from './community.service'
import { ModeracionService } from './moderacion.service'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [NotificationsModule],
  controllers: [CommunityController, EventosApiController],
  providers: [CommunityService, EventosService, ModeracionService],
})
export class CommunityModule {}