import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule } from '../../src/database/database.module'
import { AuthModule } from '../../src/modules/auth/auth.module'
import { UsersModule } from '../../src/modules/users/users.module'
import { InstitutionsModule } from '../../src/modules/institutions/institutions.module'
import { DiscoveryModule } from '../../src/modules/discovery/discovery.module'
import { RecommendationsModule } from '../../src/modules/recommendations/recommendations.module'
import { AdminModule } from '../../src/modules/admin/admin.module'
import { HealthModule } from '../../src/modules/health/health.module'
import { MessagesModule } from '../../src/modules/messages/messages.module'
import { JobsModule } from '../../src/modules/jobs/jobs.module'

/**
 * Módulo raíz de pruebas E2E: monta solo los módulos de negocio bajo prueba
 * (autenticación, usuarios/tutor-PCD, instituciones, administración y salud)
 * sobre el DatabaseModule real (cuyos providers FIRESTORE/FIREBASE_AUTH
 * quedan servidos por los mocks de test/setup-e2e.ts).
 *
 * A diferencia de AppModule, no registra ThrottlerGuard global ni módulos que
 * requieran credenciales externas (IA, storage real, etc.).
 */
@Module({
  imports: [
    // ConfigService es inyectado por DatabaseModule y otros servicios
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    InstitutionsModule,
    RecommendationsModule,
    DiscoveryModule,
    AdminModule,
    HealthModule,
    MessagesModule,
    JobsModule,
  ],
})
export class E2eTestModule {}
