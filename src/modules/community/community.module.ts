import { Module } from '@nestjs/common'
import { CommunityController } from './community.controller'
import { EventosApiController } from './eventos-api.controller'
import { EventosService } from './eventos.service'
import { CommunityService } from './community.service'
import { ModeracionService } from './moderacion.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { AdminModule } from '../admin/admin.module'

@Module({
  // AdminModule exporta PalabrasProhibidasService, que la moderación IA
  // consulta para incluir los insultos locales en su prompt.
  imports: [NotificationsModule, AdminModule],
  controllers: [CommunityController, EventosApiController],
  providers: [CommunityService, EventosService, ModeracionService],
})
export class CommunityModule {}