import { Module } from '@nestjs/common'
import { CommunityController } from './community.controller'
import { CommunityService } from './community.service'
import { EventosService } from './eventos.service'

@Module({
  controllers: [CommunityController],
  providers: [CommunityService, EventosService],
})
export class CommunityModule {}
