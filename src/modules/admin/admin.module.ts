import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { EmailModule } from '../email/email.module'
import { FirebaseAnalyticsModule } from './firebase-analytics.module'

@Module({
  imports: [NotificationsModule, EmailModule, FirebaseAnalyticsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
