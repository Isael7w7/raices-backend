import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../src/database/database.module'
import { AuthModule } from '../../src/modules/auth/auth.module'
import { UsersModule } from '../../src/modules/users/users.module'
import { InstitutionsModule } from '../../src/modules/institutions/institutions.module'
import { AdminModule } from '../../src/modules/admin/admin.module'
import { HealthModule } from '../../src/modules/health/health.module'

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
    DatabaseModule,
    AuthModule,
    UsersModule,
    InstitutionsModule,
    AdminModule,
    HealthModule,
  ],
})
export class E2eTestModule {}
