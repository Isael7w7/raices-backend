import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, UseGuards, HttpCode, BadRequestException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger'
import { JobsService } from './jobs.service'
import { CreateJobDto } from './dto/create-job.dto'
import { ActualizarVacanteDto } from './dto/actualizar-vacante.dto'
import { PaginacionDto } from '../../common/dto/paginacion.dto'
import { PostulacionDto } from './dto/postulacion.dto'
import { ActualizarEstadoPostulacionDto } from './dto/actualizar-estado-postulacion.dto'
import { VacanteDto, PaginaVacantesDto, PaginaPostulacionesDto, PostulacionCreadaDto, PostulacionEstadoActualizadoDto, PaginaPostulantesInstitucionDto } from './dto/respuestas-empleo.dto'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { FeatureGuard } from '../../common/guards/feature.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { Feature } from '../../common/decorators/feature.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { UseETag } from '../../common/decorators/use-etag.decorator'

@ApiTags('Empleo')
@Controller('empleo')
export class JobsController {
  constructor(private readonly svc: JobsService) {}

  @Get()
  @UseETag()
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
  @UseETag()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'IDs de vacantes postuladas', description: 'Retorna solo los IDs para saber en cuáles ya aplicaste' })
  @ApiOkResponse({ type: [String], description: 'Arreglo de IDs de vacantes postuladas' })
  appliedIds(@CurrentUser() user: CurrentUserPayload) {
    return this.svc.getAppliedJobIds(user.id)
  }

  @Get('mis-postulaciones')
  @UseETag()
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
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 vacantes por minuto
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

  @Get('postulantes-institucion')
  @UseETag()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('institucion', 'admin')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Postulantes de mi institución', description: 'Retorna los postulantes de todas las vacantes de la institución del usuario (rol institución) o de la institución indicada (rol admin, vía institucionId).' })
  @ApiQuery({ name: 'institucionId', required: false, description: 'Obligatorio para admins: ID de la institución a consultar' })
  @ApiQuery({ name: 'estado', required: false, description: 'Filtrar por estado de la postulación (pendiente, aceptada, rechazada, etc.)' })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', example: 1 })
  @ApiQuery({ name: 'limite', required: false, description: 'Elementos por página', example: 20 })
  @ApiQuery({ name: 'buscar', required: false, description: 'Búsqueda por nombre del postulante o título de la vacante' })
  @ApiOkResponse({ type: PaginaPostulantesInstitucionDto, description: 'Lista paginada de postulantes con datos del postulante y de la vacante' })
  @ApiResponse({ status: 400, description: 'Admin sin institucionId' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (se requiere institución o admin)' })
  @ApiResponse({ status: 404, description: 'Institución no encontrada para el usuario' })
  institutionApplicants(
    @CurrentUser() user: CurrentUserPayload,
    @Query() paginacion: PaginacionDto,
    @Query('institucionId') institucionId?: string,
    @Query('estado') estado?: string,
  ) {
    return this.svc.postulantesDeMiInstitucion(user, {
      institucionId,
      estado,
      pagina: paginacion.pagina,
      limite: paginacion.limite,
      ordenarPor: paginacion.ordenarPor,
      direccion: paginacion.direccion,
      buscar: paginacion.buscar,
    })
  }

  @Get('postulantes-vacante')
  @UseETag()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('institucion', 'admin')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Postulantes de una vacante específica', description: 'Retorna los postulantes de una vacante específica. Solo la institución dueña de la vacante o un administrador pueden consultarla.' })
  @ApiQuery({ name: 'vacanteId', required: true, description: 'ID de la vacante a consultar' })
  @ApiQuery({ name: 'estado', required: false, description: 'Filtrar por estado de la postulación (pendiente, aceptada, rechazada, etc.)' })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', example: 1 })
  @ApiQuery({ name: 'limite', required: false, description: 'Elementos por página', example: 20 })
  @ApiQuery({ name: 'buscar', required: false, description: 'Búsqueda por nombre o email del postulante' })
  @ApiOkResponse({ type: PaginaPostulantesInstitucionDto, description: 'Lista paginada de postulantes con datos del postulante y de la vacante' })
  @ApiResponse({ status: 400, description: 'Falta vacanteId' })
  @ApiResponse({ status: 403, description: 'No tienes permiso para ver esta vacante' })
  @ApiResponse({ status: 404, description: 'Vacante no encontrada' })
  vacancyApplicants(
    @CurrentUser() user: CurrentUserPayload,
    @Query() paginacion: PaginacionDto,
    @Query('vacanteId') vacanteId?: string,
    @Query('estado') estado?: string,
  ) {
    if (!vacanteId) {
      throw new BadRequestException('El parámetro vacanteId es obligatorio')
    }
    return this.svc.getPostulantesByVacanteId(vacanteId, user, {
      estado,
      pagina: paginacion.pagina,
      limite: paginacion.limite,
      ordenarPor: paginacion.ordenarPor,
      direccion: paginacion.direccion,
      buscar: paginacion.buscar,
    })
  }

  // Alias para compatibilidad con el frontend que llama a /empleo/postulaciones
  @Get('postulaciones')
  @UseETag()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('institucion', 'admin')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Postulaciones por vacante (alias)', description: 'Alias de postulantes-vacante para compatibilidad con el frontend existente. Retorna los postulantes de una vacante específica.' })
  @ApiQuery({ name: 'vacanteId', required: true, description: 'ID de la vacante a consultar' })
  @ApiQuery({ name: 'estado', required: false, description: 'Filtrar por estado de la postulación' })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', example: 1 })
  @ApiQuery({ name: 'limite', required: false, description: 'Elementos por página', example: 20 })
  @ApiQuery({ name: 'buscar', required: false, description: 'Búsqueda por nombre o email del postulante' })
  @ApiOkResponse({ type: PaginaPostulantesInstitucionDto, description: 'Lista paginada de postulantes' })
  @ApiResponse({ status: 400, description: 'Falta vacanteId' })
  @ApiResponse({ status: 403, description: 'No tienes permiso' })
  @ApiResponse({ status: 404, description: 'Vacante no encontrada' })
  postulacionesPorVacante(
    @CurrentUser() user: CurrentUserPayload,
    @Query() paginacion: PaginacionDto,
    @Query('vacanteId') vacanteId?: string,
    @Query('estado') estado?: string,
  ) {
    if (!vacanteId) {
      throw new BadRequestException('El parámetro vacanteId es obligatorio')
    }
    return this.svc.getPostulantesByVacanteId(vacanteId, user, {
      estado,
      pagina: paginacion.pagina,
      limite: paginacion.limite,
      ordenarPor: paginacion.ordenarPor,
      direccion: paginacion.direccion,
      buscar: paginacion.buscar,
    })
  }

  @Get(':id')
  @UseETag()
  @ApiOperation({ summary: 'Detalle de vacante' })
  @ApiParam({ name: 'id', description: 'ID de la vacante' })
  @ApiOkResponse({ type: VacanteDto, description: 'Detalle completo de la vacante con información de institución' })
  @ApiResponse({ status: 404, description: 'Vacante no encontrada' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id)
  }

  @Post(':id/postularse')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 postulaciones por minuto
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

  @Patch('postulaciones/:id/estado')
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 cambios de estado por minuto
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('institucion', 'admin')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Cambiar estado de postulación', description: 'Permite a la institución dueña de la vacante (o admin) aceptar o rechazar una postulación. Notifica al postulante.' })
  @ApiParam({ name: 'id', description: 'ID de la postulación' })
  @ApiOkResponse({ type: PostulacionEstadoActualizadoDto, description: 'Estado actualizado correctamente' })
  @ApiResponse({ status: 400, description: 'Estado inválido (debe ser pendiente, aceptada o rechazada)' })
  @ApiResponse({ status: 403, description: 'No pertenece a tu institución' })
  @ApiResponse({ status: 404, description: 'Postulación o vacante no encontrada' })
  cambiarEstadoPostulacion(@Param('id') id: string, @Body() dto: ActualizarEstadoPostulacionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.actualizarEstadoPostulacion(id, user, dto)
  }
}
