import { Test } from '@nestjs/testing'
import { configurarAppGlobal } from '../../src/common/config/app-setup'
import { E2eTestModule } from './e2e-module'

/**
 * Crea una aplicación NestJS de pruebas replicando la configuración real de
 * src/main.ts (cabeceras de seguridad, ValidationPipe global y prefijo /api)
 * para que los tests verifiquen el contrato HTTP tal y como lo consume el
 * cliente. Usa la MISMA función de configuración que la bootstrap de
 * producción para que ambos no puedan divergir.
 */
export async function crearAppE2E() {
  const moduleRef = await Test.createTestingModule({ imports: [E2eTestModule] }).compile()
  const app = moduleRef.createNestApplication()

  configurarAppGlobal(app)
  app.setGlobalPrefix('api')

  await app.init()

  return { app, http: app.getHttpServer() }
}
