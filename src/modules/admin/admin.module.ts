import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { EmailModule } from '../email/email.module'

@Module({
  imports: [NotificationsModule, EmailModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
