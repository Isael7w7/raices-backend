import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerModule } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'
import { CustomThrottlerGuard } from '../../src/common/guards/custom-throttler.guard'
import { DatabaseModule } from '../../src/database/database.module'
import { AuthModule } from '../../src/modules/auth/auth.module'
import { UsersModule } from '../../src/modules/users/users.module'
import { InstitutionsModule } from '../../src/modules/institutions/institutions.module'
import { AdminModule } from '../../src/modules/admin/admin.module'
import { HealthModule } from '../../src/modules/health/health.module'
import { MessagesModule } from '../../src/modules/messages/messages.module'
import { AiModule } from '../../src/modules/ai/ai.module'

/**
 * Módulo de pruebas E2E con ThrottlerGuard habilitado.
 *
 * A diferencia de E2eTestModule (que excluye throttling para tests de
 * integración normales), este módulo SÍ registra ThrottlerModule y
 * ThrottlerGuard global para verificar que el rate limiting funciona
 * correctamente en producción.
 *
 * Se usa un TTL muy corto (1 segundo) y un límite bajo (2-3 requests)
 * para poder probar el bloqueo sin esperar 60 segundos.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limiting con TTL bajo y límite estricto para testing
    ThrottlerModule.forRootAsync({
      useFactory: () => [{
        ttl: 1000,    // 1 segundo (en producción es 60000ms)
        limit: 2,     // 2 requests por ventana (en producción es 60)
      }],
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    InstitutionsModule,
    AdminModule,
    HealthModule,
    MessagesModule,
    AiModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      // El mismo guard de producción: corrige el EmptyError de RxJS y devuelve
      // el cuerpo 429 { statusCode, message, ttl } que consume el Frontend.
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class RateLimitTestModule {}
