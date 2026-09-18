import { Module } from '@nestjs/common'
import { RoutesController } from './routes.controller'
import { RoutesService } from './routes.service'
import { KnowledgeBaseService } from './knowledge-base.service'

@Module({
  controllers: [RoutesController],
  providers: [RoutesService, KnowledgeBaseService],
})
export class RoutesModule {}
