import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { SeedInstitutionsModule } from './seed-institutions.module';
import { SeedInstitutionsService } from './seed-institutions.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(SeedInstitutionsModule);
  const service = app.get(SeedInstitutionsService);

  console.log('🌱 Ejecutando seed de instituciones...\n');

  await service.seedFromCsv();

  console.log('\n✅ Seed completado');
  process.exit(0);
}

bootstrap().catch((e) => {
  console.error('❌ Error durante el seed:', e);
  process.exit(1);
});