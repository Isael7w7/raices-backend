import { Module } from '@nestjs/common'
import { ContactoController } from './contacto.controller'
import { ContactoService } from './contacto.service'

@Module({
  controllers: [ContactoController],
  providers: [ContactoService],
})
export class ContactoModule {}
