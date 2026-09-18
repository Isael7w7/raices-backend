import { Module } from '@nestjs/common'
import { RoutesController } from './routes.controller'
import { RoutesService } from './routes.service'
import { KnowledgeBaseService } from './knowledge-base.service'
import { RoutesAnalyticsService } from './routes-analytics.service'

@Module({
  controllers: [RoutesController],
  providers: [RoutesService, KnowledgeBaseService, RoutesAnalyticsService],
  exports: [RoutesAnalyticsService],
})
export class RoutesModule {}
