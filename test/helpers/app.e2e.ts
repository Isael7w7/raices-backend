import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { E2eTestModule } from './e2e-module'

/**
 * Crea una aplicación NestJS de pruebas replicando la configuración real de
 * src/main.ts (ValidationPipe global y prefijo /api) para que los tests
 * verifiquen el contrato HTTP tal y como lo consume el cliente.
 */
export async function crearAppE2E() {
  const moduleRef = await Test.createTestingModule({ imports: [E2eTestModule] }).compile()
  const app = moduleRef.createNestApplication()

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )
  app.setGlobalPrefix('api')

  await app.init()

  return { app, http: app.getHttpServer() }
}
