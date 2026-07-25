import { Controller, Get, Post, Param, Body, Query, UseGuards, HttpCode } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger'
import { JobsService } from './jobs.service'
import { CreateJobDto } from './dto/create-job.dto'
import { PostulacionDto } from './dto/postulacion.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'

@ApiTags('Empleo')
@Controller('empleo')
export class JobsController {
  constructor(private readonly svc: JobsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar vacantes', description: 'Retorna vacantes activas de instituciones activas' })
  @ApiQuery({ name: 'ciudad', required: false, description: 'Filtrar por ciudad' })
  @ApiQuery({ name: 'modalidad', required: false, description: 'Filtrar por modalidad: presencial, remoto, híbrido' })
  @ApiResponse({ status: 200, description: 'Lista de vacantes con información de institución' })
  findAll(@Query('ciudad') ciudad?: string, @Query('modalidad') modalidad?: string) {
    return this.svc.findAll({ ciudad, modalidad })
  }

  @Get('postuladas')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'IDs de vacantes postuladas', description: 'Retorna solo los IDs para saber en cuáles ya aplicaste' })
  @ApiResponse({ status: 200, description: 'Arreglo de IDs de vacantes postuladas' })
  appliedIds(@CurrentUser() user: CurrentUserPayload) {
    return this.svc.getAppliedJobIds(user.id)
  }

  @Get('mis-postulaciones')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Mis postulaciones', description: 'Retorna todas las postulaciones del usuario con estado y detalles' })
  @ApiResponse({ status: 200, description: 'Lista de postulaciones con título, modalidad, institución' })
  myApplications(@CurrentUser() user: CurrentUserPayload) {
    return this.svc.myApplications(user.id)
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('institucion', 'admin')
  @ApiBearerAuth('jwt-auth')
  @HttpCode(201)
  @ApiOperation({ summary: 'Crear vacante', description: 'Crea una nueva vacante. El usuario debe tener rol de institución o administrador. Para instituciones, se vincula automáticamente a su institución. Para admins, se requiere institucionId.' })
  @ApiResponse({ status: 201, description: 'Vacante creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (se requiere institución o admin)' })
  create(@Body() dto: CreateJobDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.createForUser(user, dto)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de vacante' })
  @ApiParam({ name: 'id', description: 'ID de la vacante' })
  @ApiResponse({ status: 200, description: 'Detalle completo de la vacante con información de institución' })
  @ApiResponse({ status: 404, description: 'Vacante no encontrada' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id)
  }

  @Post(':id/postularse')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Postularse a vacante', description: 'Envía una solicitud con carta de presentación. Un usuario solo puede postularse una vez por vacante.' })
  @ApiParam({ name: 'id', description: 'ID de la vacante' })
  @ApiResponse({ status: 201, description: 'Postulación enviada con éxito' })
  @ApiResponse({ status: 409, description: 'Ya enviaste una solicitud para esta vacante' })
  @ApiResponse({ status: 404, description: 'Vacante no encontrada o inactiva' })
  apply(@Param('id') id: string, @Body() dto: PostulacionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.apply(user.id, id, dto.cartaPresentacion ?? '')
  }
}
