import { Module } from '@nestjs/common'
import { RoutesController } from './routes.controller'
import { RoutesService } from './routes.service'
import { KnowledgeBaseService } from './knowledge-base.service'
import { KnowledgeVectorService } from './knowledge-vector.service'
import { RoutesAnalyticsService } from './routes-analytics.service'
import { AiModule } from '../ai/ai.module'

@Module({
  // AiModule exporta DiccionarioConsultasService (diccionario coloquial→técnico)
  // usado por KnowledgeVectorService y RoutesService para enriquecer el RAG.
  imports: [AiModule],
  controllers: [RoutesController],
  providers: [RoutesService, KnowledgeBaseService, KnowledgeVectorService, RoutesAnalyticsService],
  exports: [RoutesAnalyticsService],
})
export class RoutesModule {}
