import { Module } from '@nestjs/common'
import { InstitutionsController } from './institutions.controller'
import { InstitutionsService } from './institutions.service'
import { CsfQrService } from './csf-qr.service'

@Module({
  controllers: [InstitutionsController],
  providers: [InstitutionsService, CsfQrService],
  exports: [InstitutionsService, CsfQrService],
})
export class InstitutionsModule {}
