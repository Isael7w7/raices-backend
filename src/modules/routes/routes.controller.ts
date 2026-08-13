import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, UseGuards, HttpCode } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse, ApiBearerAuth, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger'
import { RoutesService } from './routes.service'
import { CrearRutaDto, ActualizarRutaDto, CrearPasoDto, RutaDesarrolloDto, PasoRutaDto, ResumenRutasDto } from './dto/ruta-desarrollo.dto'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { UseETag } from '../../common/decorators/use-etag.decorator'

@ApiTags('Rutas de Desarrollo')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('rutas-desarrollo')
export class RoutesController {
  constructor(private readonly svc: RoutesService) {}

  // ═══════════════════════════════════════════════════════════════════
  // Rutas
  // ═══════════════════════════════════════════════════════════════════

  @Get()
  @UseETag()
  @ApiOperation({ summary: 'Listar mis rutas de desarrollo', description: 'Lista todas las rutas de desarrollo del usuario con filtros opcionales.' })
  @ApiQuery({ name: 'estado', required: false, description: 'Filtrar por estado: activa, completada, pausada, cancelada' })
  @ApiQuery({ name: 'areaInteres', required: false, description: 'Filtrar por área de interés' })
  @ApiOkResponse({ type: [RutaDesarrolloDto], description: 'Lista de rutas' })
  listarRutas(
    @CurrentUser() user: CurrentUserPayload,
    @Query('estado') estado?: string,
    @Query('areaInteres') areaInteres?: string,
  ) {
    return this.svc.listarRutas(user.id, { estado, areaInteres })
  }

  @Get('resumen')
  @UseETag()
  @ApiOperation({ summary: 'Resumen de rutas', description: 'Resumen de todas las rutas: total, activas, completadas, pausadas, progreso promedio.' })
  @ApiOkResponse({ type: ResumenRutasDto, description: 'Resumen de rutas' })
  resumenRutas(@CurrentUser() user: CurrentUserPayload) {
    return this.svc.resumenRutas(user.id)
  }

  @Get(':id')
  @UseETag()
  @ApiOperation({ summary: 'Detalle de ruta', description: 'Detalle completo de una ruta con sus pasos.' })
  @ApiParam({ name: 'id', description: 'ID de la ruta' })
  @ApiOkResponse({ type: RutaDesarrolloDto, description: 'Detalle de la ruta con pasos' })
  @ApiResponse({ status: 404, description: 'Ruta no encontrada' })
  obtenerRuta(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.svc.obtenerRuta(user.id, id)
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(201)
  @ApiOperation({ summary: 'Crear ruta de desarrollo', description: 'Crea una nueva ruta de desarrollo personalizada.' })
  @ApiBody({ type: CrearRutaDto })
  @ApiCreatedResponse({ type: RutaDesarrolloDto, description: 'Ruta creada' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  crearRuta(@CurrentUser() user: CurrentUserPayload, @Body() dto: CrearRutaDto) {
    return this.svc.crearRuta(user.id, dto)
  }

  @Put(':id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Actualizar ruta', description: 'Actualiza el nombre, descripción, estado, prioridad o fecha límite de una ruta.' })
  @ApiParam({ name: 'id', description: 'ID de la ruta' })
  @ApiBody({ type: ActualizarRutaDto })
  @ApiOkResponse({ type: RutaDesarrolloDto, description: 'Ruta actualizada' })
  @ApiResponse({ status: 404, description: 'Ruta no encontrada' })
  actualizarRuta(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: ActualizarRutaDto) {
    return this.svc.actualizarRuta(user.id, id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar ruta', description: 'Elimina una ruta y todos sus pasos asociados.' })
  @ApiParam({ name: 'id', description: 'ID de la ruta' })
  @ApiNoContentResponse({ description: 'Ruta eliminada' })
  @ApiResponse({ status: 404, description: 'Ruta no encontrada' })
  eliminarRuta(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.svc.eliminarRuta(user.id, id)
  }

  // ═══════════════════════════════════════════════════════════════════
  // Pasos de ruta
  // ═══════════════════════════════════════════════════════════════════

  @Post(':id/pasos')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(201)
  @ApiOperation({ summary: 'Agregar paso a ruta', description: 'Agrega un nuevo paso/hito a una ruta de desarrollo.' })
  @ApiParam({ name: 'id', description: 'ID de la ruta' })
  @ApiBody({ type: CrearPasoDto })
  @ApiCreatedResponse({ type: PasoRutaDto, description: 'Paso creado' })
  @ApiResponse({ status: 404, description: 'Ruta no encontrada' })
  agregarPaso(@CurrentUser() user: CurrentUserPayload, @Param('id') rutaId: string, @Body() dto: CrearPasoDto) {
    return this.svc.agregarPaso(user.id, rutaId, dto)
  }

  @Patch(':rutaId/pasos/:pasoId/completar')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Completar paso', description: 'Marca un paso como completado y actualiza el progreso de la ruta.' })
  @ApiParam({ name: 'rutaId', description: 'ID de la ruta' })
  @ApiParam({ name: 'pasoId', description: 'ID del paso' })
  @ApiOkResponse({ type: PasoRutaDto, description: 'Paso completado' })
  @ApiResponse({ status: 404, description: 'Ruta o paso no encontrado' })
  completarPaso(@CurrentUser() user: CurrentUserPayload, @Param('rutaId') rutaId: string, @Param('pasoId') pasoId: string) {
    return this.svc.completarPaso(user.id, rutaId, pasoId)
  }

  @Patch(':rutaId/pasos/:pasoId/descompletar')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Descompletar paso', description: 'Desmarca un paso como completado y actualiza el progreso.' })
  @ApiParam({ name: 'rutaId', description: 'ID de la ruta' })
  @ApiParam({ name: 'pasoId', description: 'ID del paso' })
  @ApiOkResponse({ type: PasoRutaDto, description: 'Paso descompletado' })
  @ApiResponse({ status: 404, description: 'Ruta o paso no encontrado' })
  descompletarPaso(@CurrentUser() user: CurrentUserPayload, @Param('rutaId') rutaId: string, @Param('pasoId') pasoId: string) {
    return this.svc.descompletarPaso(user.id, rutaId, pasoId)
  }
}
