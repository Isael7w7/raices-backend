import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { EmailModule } from '../email/email.module'
import { FirebaseAnalyticsModule } from '../admin/firebase-analytics.module'

@Module({
  imports: [
    EmailModule,
    FirebaseAnalyticsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [],
})
export class AuthModule {}
