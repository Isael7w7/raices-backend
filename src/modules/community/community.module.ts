import { Module } from '@nestjs/common'
import { CommunityController } from './community.controller'
import { EventosApiController } from './eventos-api.controller'
import { EventosService } from './eventos.service'
import { CommunityService } from './community.service'

@Module({
  controllers: [CommunityController, EventosApiController],
  providers: [CommunityService, EventosService],
})
export class CommunityModule {}