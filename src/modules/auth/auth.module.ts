import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { EmailModule } from '../email/email.module'
import { FirebaseAnalyticsModule } from '../admin/firebase-analytics.module'
import { AiModule } from '../ai/ai.module'
import { StorageModule } from '../storage/storage.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [
    EmailModule,
    FirebaseAnalyticsModule,
    // Validación automática de usuarios por IA al registrar (en background)
    AiModule,
    // Subida de la CSF adjunta al registro de institución → documentoCsf
    StorageModule,
    // Notificación de bienvenida al completar el registro
    NotificationsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
