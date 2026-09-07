import { Module } from '@nestjs/common'
import { AiController } from './ai.controller'
import { AiService } from './ai.service'
import { ValidationService } from './validation.service'

@Module({
  controllers: [AiController],
  providers: [AiService, ValidationService],
  exports: [ValidationService],
})
export class AiModule {}
