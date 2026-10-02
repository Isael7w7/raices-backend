import { Module } from '@nestjs/common'
import { InstitutionsController } from './institutions.controller'
import { InstitutionsService } from './institutions.service'
import { CsfQrService } from './csf-qr.service'
import { StorageModule } from '../storage/storage.module'
import { UsersModule } from '../users/users.module'

@Module({
  imports: [StorageModule, UsersModule],
  controllers: [InstitutionsController],
  providers: [InstitutionsService, CsfQrService],
  exports: [InstitutionsService, CsfQrService],
})
export class InstitutionsModule {}
