import { Module } from '@nestjs/common'
import { AiController } from './ai.controller'
import { AiService } from './ai.service'
import { ValidationService } from './validation.service'
import { DiccionarioConsultasService } from './diccionario-consultas.service'

@Module({
  controllers: [AiController],
  providers: [AiService, ValidationService, DiccionarioConsultasService],
  exports: [ValidationService, DiccionarioConsultasService],
})
export class AiModule {}
