import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { EmailModule } from '../email/email.module'
import { FirebaseAnalyticsModule } from '../admin/firebase-analytics.module'
import { AiModule } from '../ai/ai.module'

@Module({
  imports: [
    EmailModule,
    FirebaseAnalyticsModule,
    // Validación automática de usuarios por IA al registrar (en background)
    AiModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
