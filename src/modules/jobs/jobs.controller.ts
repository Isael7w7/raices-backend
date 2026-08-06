import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, HttpCode } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger'
import { JobsService } from './jobs.service'
import { CreateJobDto } from './dto/create-job.dto'
import { ActualizarVacanteDto } from './dto/actualizar-vacante.dto'
import { PaginacionDto } from '../../common/dto/paginacion.dto'
import { PostulacionDto } from './dto/postulacion.dto'
import { VacanteDto, PaginaVacantesDto, PaginaPostulacionesDto, PostulacionCreadaDto } from './dto/respuestas-empleo.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { FeatureGuard } from '../../common/guards/feature.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { Feature } from '../../common/decorators/feature.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'

@ApiTags('Empleo')
@Controller('empleo')
export class JobsController {
  constructor(private readonly svc: JobsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar vacantes', description: 'Retorna vacantes activas de instituciones activas con paginación' })
  @ApiQuery({ name: 'ciudad', required: false, description: 'Filtrar por ciudad' })
  @ApiQuery({ name: 'modalidad', required: false, description: 'Filtrar por modalidad: presencial, remoto, híbrido' })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', example: 1 })
  @ApiQuery({ name: 'limite', required: false, description: 'Elementos por página', example: 20 })
  @ApiOkResponse({ type: PaginaVacantesDto, description: 'Lista paginada de vacantes con información de institución' })
  findAll(@Query() paginacion: PaginacionDto, @Query('ciudad') ciudad?: string, @Query('modalidad') modalidad?: string) {
    return this.svc.findAll({ ciudad, modalidad, pagina: paginacion.pagina, limite: paginacion.limite, ordenarPor: paginacion.ordenarPor, direccion: paginacion.direccion, buscar: paginacion.buscar })
  }

  @Get('postuladas')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'IDs de vacantes postuladas', description: 'Retorna solo los IDs para saber en cuáles ya aplicaste' })
  @ApiOkResponse({ type: [String], description: 'Arreglo de IDs de vacantes postuladas' })
  appliedIds(@CurrentUser() user: CurrentUserPayload) {
    return this.svc.getAppliedJobIds(user.id)
  }

  @Get('mis-postulaciones')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Mis postulaciones', description: 'Retorna las postulaciones del usuario con paginación' })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', example: 1 })
  @ApiQuery({ name: 'limite', required: false, description: 'Elementos por página', example: 20 })
  @ApiOkResponse({ type: PaginaPostulacionesDto, description: 'Lista paginada de postulaciones con título, modalidad, institución' })
  myApplications(@CurrentUser() user: CurrentUserPayload, @Query() paginacion: PaginacionDto) {
    return this.svc.myApplications(user.id, paginacion.pagina, paginacion.limite, paginacion.ordenarPor, paginacion.direccion, paginacion.buscar)
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('institucion', 'admin')
  @ApiBearerAuth('jwt-auth')
  @HttpCode(201)
  @ApiOperation({ summary: 'Crear vacante', description: 'Crea una nueva vacante. El usuario debe tener rol de institución o administrador. Para instituciones, se vincula automáticamente a su institución. Para admins, se requiere institucionId.' })
  @ApiCreatedResponse({ type: VacanteDto, description: 'Vacante creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (se requiere institución o admin)' })
  create(@Body() dto: CreateJobDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.createForUser(user, dto)
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('institucion', 'admin')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Editar vacante', description: 'Actualiza campos de una vacante. Debe pertenecer a la institución del usuario.' })
  @ApiParam({ name: 'id', description: 'ID de la vacante' })
  @ApiOkResponse({ type: VacanteDto, description: 'Vacante actualizada' })
  @ApiResponse({ status: 403, description: 'No pertenece a tu institución' })
  @ApiResponse({ status: 404, description: 'Vacante no encontrada' })
  update(@Param('id') id: string, @Body() dto: ActualizarVacanteDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.update(id, user, dto)
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('institucion', 'admin')
  @ApiBearerAuth('jwt-auth')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar vacante', description: 'Desactiva una vacante. Retorna 204 No Content.' })
  @ApiParam({ name: 'id', description: 'ID de la vacante' })
  @ApiNoContentResponse({ description: 'Vacante desactivada' })
  @ApiResponse({ status: 403, description: 'No pertenece a tu institución' })
  @ApiResponse({ status: 404, description: 'Vacante no encontrada' })
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.remove(id, user)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de vacante' })
  @ApiParam({ name: 'id', description: 'ID de la vacante' })
  @ApiOkResponse({ type: VacanteDto, description: 'Detalle completo de la vacante con información de institución' })
  @ApiResponse({ status: 404, description: 'Vacante no encontrada' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id)
  }

  @Post(':id/postularse')
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Feature('postulaciones')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Postularse a vacante', description: 'Envía una solicitud con carta de presentación. Un usuario solo puede postularse una vez por vacante.' })
  @ApiParam({ name: 'id', description: 'ID de la vacante' })
  @ApiCreatedResponse({ type: PostulacionCreadaDto, description: 'Postulación enviada con éxito' })
  @ApiResponse({ status: 403, description: 'Funcionalidad de postulaciones desactivada para tu cuenta' })
  @ApiResponse({ status: 409, description: 'Ya enviaste una solicitud para esta vacante' })
  @ApiResponse({ status: 404, description: 'Vacante no encontrada o inactiva' })
  apply(@Param('id') id: string, @Body() dto: PostulacionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.apply(user.id, id, dto.cartaPresentacion ?? '')
  }
}
