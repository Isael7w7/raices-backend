import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { EmailModule } from '../email/email.module'
import { FirebaseAnalyticsModule } from '../admin/firebase-analytics.module'
import { StorageModule } from '../storage/storage.module'

@Module({
  imports: [
    EmailModule,
    FirebaseAnalyticsModule,
    StorageModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
