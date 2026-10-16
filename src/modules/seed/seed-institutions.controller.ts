import { Controller, Get, Res, HttpCode, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { SeedInstitutionsService } from './seed-institutions.service';

@Controller('seed')
export class SeedInstitutionsController {
  constructor(private readonly seedService: SeedInstitutionsService) {}

  @Get('institutions')
  @HttpCode(HttpStatus.OK)
  async seedInstitutions(@Res() res: Response) {
    try {
      const result = await this.seedService.seedFromCsv();
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Seed de instituciones completado',
        data: result,
      });
    } catch (error: unknown) {
      console.error('Error en seed-institutions:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error instanceof Error ? error.message : 'Error interno al ejecutar el seed',
      });
    }
  }
}