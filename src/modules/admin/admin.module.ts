import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { PalabrasProhibidasController } from './palabras-prohibidas.controller'
import { PalabrasProhibidasService } from './palabras-prohibidas.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { EmailModule } from '../email/email.module'
import { FirebaseAnalyticsModule } from './firebase-analytics.module'
import { StorageModule } from '../storage/storage.module'
import { AuditModule } from '../../common/audit/audit.module'

@Module({
  imports: [NotificationsModule, EmailModule, FirebaseAnalyticsModule, StorageModule, AuditModule],
  controllers: [AdminController, PalabrasProhibidasController],
  providers: [AdminService, PalabrasProhibidasService],
  exports: [AdminService, PalabrasProhibidasService],
})
export class AdminModule {}
