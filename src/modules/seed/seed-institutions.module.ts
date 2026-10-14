import { Module } from '@nestjs/common';
import { SeedInstitutionsService } from './seed-institutions.service';
import { SeedInstitutionsController } from './seed-institutions.controller';

@Module({
  controllers: [SeedInstitutionsController],
  providers: [SeedInstitutionsService],
})
export class SeedInstitutionsModule {}