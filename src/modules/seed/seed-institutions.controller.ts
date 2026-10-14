import { Controller, Get, Post, Res, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { SeedInstitutionsService } from './seed-institutions.service';

@Controller('seed')
export class SeedInstitutionsController {
  constructor(private readonly seedService: SeedInstitutionsService) {}

  @Get('institutions')
  @HttpCode(HttpStatus.OK)
  async seedInstitutions(@Res() res: any, @Req() req: any) {
    try {
      const result = await this.seedService.seedFromCsv();
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Seed de instituciones completado',
        data: result,
      });
    } catch (error: any) {
      console.error('Error en seed-institutions:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message || 'Error interno al ejecutar el seed',
      });
    }
  }
}