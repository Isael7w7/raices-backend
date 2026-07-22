import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery, ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'
import { JobsService } from './jobs.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

export class PostulacionDto {
  @ApiProperty({ description: 'Carta de presentación', required: false, example: 'Me interesa esta vacante porque...' })
  @IsOptional() @IsString() cartaPresentacion?: string
}

@ApiTags('Jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly svc: JobsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar vacantes', description: 'Retorna vacantes activas de instituciones activas' })
  @ApiQuery({ name: 'ciudad', required: false, description: 'Filtrar por ciudad' })
  @ApiQuery({ name: 'modalidad', required: false, description: 'Filtrar por modalidad: presencial, remoto, hibrido' })
  @ApiResponse({ status: 200, description: 'Lista de vacantes con info de institución' })
  findAll(@Query('ciudad') ciudad?: string, @Query('modalidad') modalidad?: string) {
    return this.svc.findAll({ ciudad, modalidad })
  }

  @Get('applied')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'IDs de vacantes postuladas', description: 'Retorna solo los IDs para saber en cuáles ya aplicaste' })
  @ApiResponse({ status: 200, description: 'Array de IDs de vacantes postuladas' })
  appliedIds(@CurrentUser() user: any) {
    return this.svc.getAppliedJobIds(user.id)
  }

  @Get('my-applications')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Mis postulaciones', description: 'Retorna todas las postulaciones del usuario con estado y detalles' })
  @ApiResponse({ status: 200, description: 'Lista de postulaciones con título, modalidad, institución' })
  myApplications(@CurrentUser() user: any) {
    return this.svc.myApplications(user.id)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de vacante' })
  @ApiParam({ name: 'id', description: 'ID de la vacante' })
  @ApiResponse({ status: 200, description: 'Detalle completo de la vacante con info de institución' })
  @ApiResponse({ status: 404, description: 'Vacante no encontrada' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id)
  }

  @Post(':id/apply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Postularse a vacante', description: 'Envía una solicitud con carta de presentación. Un usuario solo puede postularse una vez por vacante.' })
  @ApiParam({ name: 'id', description: 'ID de la vacante' })
  @ApiResponse({ status: 201, description: 'Postulación enviada con éxito' })
  @ApiResponse({ status: 409, description: 'Ya enviaste una solicitud para esta vacante' })
  @ApiResponse({ status: 404, description: 'Vacante no encontrada o inactiva' })
  apply(@Param('id') id: string, @Body() dto: PostulacionDto, @CurrentUser() user: any) {
    return this.svc.apply(user.id, id, dto.cartaPresentacion ?? '')
  }
}
