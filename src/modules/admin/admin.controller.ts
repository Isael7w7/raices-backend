import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, UseGuards, HttpCode } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiOkResponse, ApiNoContentResponse, ApiBearerAuth, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger'
import { AdminService } from './admin.service'
import { ActualizarConfiguracionDto } from './dto/actualizar-configuracion.dto'
import {
  EstadisticasDto, AnaliticasDto, NecesidadesInteligenciaDto, VisitantesActivosDto,
  InstitucionAdminDto, PaginaInstitucionesAdminDto, UsuarioAdminDto, PaginaUsuariosAdminDto,
  ResenaAdminDto, PaginaResenasAdminDto, RespuestaToggleUsuarioDto, RespuestaToggleVerificacionDto,
  RespuestaRolDto, AlertaDto, ConfiguracionDto,
} from './dto/respuestas-admin.dto'
import { InstitucionDto } from '../institutions/dto/respuestas-institucion.dto'
import { PaginacionDto } from '../../common/dto/paginacion.dto'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { UseETag } from '../../common/decorators/use-etag.decorator'

@ApiTags('Administración')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('administracion')
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  /* ── Stats y analítica ── */
  @Get('estadisticas')
  @UseETag()
  @ApiOperation({ summary: 'Estadísticas generales', description: 'Retorna contadores de usuarios, instituciones, reseñas, publicaciones, etc.' })
  @ApiOkResponse({ type: EstadisticasDto, description: 'Estadísticas del panel de control' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (se requiere admin)' })
  stats() { return this.svc.getStats() }

  @Get('analiticas')
  @UseETag()
  @ApiOperation({ summary: 'Analíticas detalladas', description: 'Registros por mes, distribución de roles, categorías, calificaciones, actividad comunitaria, distribución geográfica' })
  @ApiOkResponse({ type: AnaliticasDto, description: 'Datos de analítica completa' })
  analytics() { return this.svc.getAnalytics() }

  @Get('inteligencia-necesidades')
  @UseETag()
  @ApiOperation({ summary: 'Inteligencia de necesidades', description: 'Motor de análisis: demanda vs oferta por tipo de discapacidad, brechas de cobertura, análisis automáticos' })
  @ApiOkResponse({ type: NecesidadesInteligenciaDto, description: 'Análisis de cobertura con hallazgos' })
  needsIntelligence() { return this.svc.getNeedsIntelligence() }

  @Get('visitantes-activos')
  @UseETag()
  @ApiOperation({ summary: 'Visitantes activos en tiempo real', description: 'Métricas de visitantes actuales y promedios históricos: personasActivas, promedioDiario, promedioSemanal, promedioMensual, historialMinutos (últimos 13 min). Intenta calcular con datos reales de sesiones; si no hay, estima con base en usuarios activos.' })
  @ApiOkResponse({ type: VisitantesActivosDto, description: 'Métricas de visitantes activos' })
  activeVisitors() { return this.svc.getActiveVisitors() }

  /* ── Instituciones ── */
  @Get('instituciones')
  @UseETag()
  @ApiOperation({ summary: 'Todas las instituciones (admin)', description: 'Lista paginada de instituciones' })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', example: 1 })
  @ApiQuery({ name: 'limite', required: false, description: 'Elementos por página', example: 20 })
  @ApiOkResponse({ type: PaginaInstitucionesAdminDto, description: 'Lista paginada de instituciones con estado y verificación' })
  institutions(@Query() paginacion: PaginacionDto) { return this.svc.getAllInstitutions(paginacion.pagina, paginacion.limite, paginacion.ordenarPor, paginacion.direccion, paginacion.buscar) }

  @Get('instituciones/pendientes')
  @UseETag()
  @ApiOperation({ summary: 'Instituciones pendientes de aprobación' })
  @ApiOkResponse({ type: [InstitucionDto], description: 'Instituciones pendientes (activa=true, verificada=false)' })
  pending() { return this.svc.getPendingInstitutions() }

  @Post('instituciones/:id/aprobar')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 acciones admin por minuto
  @HttpCode(204)
  @ApiOperation({ summary: 'Aprobar institución', description: 'Activa la institución y envía correo de notificación' })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiNoContentResponse({ description: 'Institución aprobada' })
  @ApiResponse({ status: 404, description: 'Institución no encontrada' })
  approve(@Param('id') id: string) { return this.svc.approveInstitution(id) }

  @Patch('instituciones/:id/verificar')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Alternar verificación de institución' })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiOkResponse({ type: RespuestaToggleVerificacionDto, description: 'Estado de verificación actualizado' })
  verify(@Param('id') id: string) { return this.svc.toggleVerifyInstitution(id) }

  @Delete('instituciones/:id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(204)
  @ApiOperation({ summary: 'Rechazar/eliminar institución', description: 'Elimina permanentemente la institución' })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiNoContentResponse({ description: 'Institución eliminada' })
  @ApiResponse({ status: 404, description: 'Institución no encontrada' })
  reject(@Param('id') id: string) { return this.svc.rejectInstitution(id) }

  /* ── Usuarios ── */
  @Get('usuarios')
  @UseETag()
  @ApiOperation({ summary: 'Todos los usuarios', description: 'Lista paginada de usuarios' })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', example: 1 })
  @ApiQuery({ name: 'limite', required: false, description: 'Elementos por página', example: 20 })
  @ApiOkResponse({ type: PaginaUsuariosAdminDto, description: 'Lista paginada de usuarios con correo, nombre, rol, estado' })
  users(@Query() paginacion: PaginacionDto) { return this.svc.getUsers(paginacion.pagina, paginacion.limite, paginacion.ordenarPor, paginacion.direccion, paginacion.buscar) }

  @Patch('usuarios/:id/activo')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Activar/desactivar usuario' })
  @ApiParam({ name: 'id', description: 'ID del usuario' })
  @ApiOkResponse({ type: RespuestaToggleUsuarioDto, description: 'Estado de activación actualizado' })
  @ApiResponse({ status: 400, description: 'No puedes desactivar tu propia cuenta' })
  toggleActive(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.toggleUserActive(id, user.id)
  }

  @Patch('usuarios/:id/rol')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Cambiar rol de usuario', description: 'Roles válidos: pcd, tutor, institución, administrador' })
  @ApiParam({ name: 'id', description: 'ID del usuario' })
  @ApiBody({ schema: { properties: { role: { type: 'string', enum: ['pcd', 'tutor', 'institucion', 'admin'] } } } })
  @ApiOkResponse({ type: RespuestaRolDto, description: 'Rol actualizado' })
  @ApiResponse({ status: 400, description: 'Rol inválido o intento de cambiar propio rol' })
  changeRole(@Param('id') id: string, @Body('role') role: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.changeUserRole(id, role, user.id)
  }

  @Delete('usuarios/:id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar cuenta de usuario', description: 'Elimina permanentemente el usuario, su avatar en Storage, perfil extendido y dependientes. No se puede eliminar la propia cuenta.' })
  @ApiParam({ name: 'id', description: 'ID del usuario a eliminar' })
  @ApiNoContentResponse({ description: 'Cuenta eliminada permanentemente' })
  @ApiResponse({ status: 400, description: 'Intento de eliminar la propia cuenta' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (se requiere admin)' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  deleteUser(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.deleteUser(id, user.id)
  }

  /* ── Reseñas ── */
  @Get('resenas')
  @UseETag()
  @ApiOperation({ summary: 'Moderar reseñas', description: 'Lista paginada de reseñas con información de usuario e institución' })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', example: 1 })
  @ApiQuery({ name: 'limite', required: false, description: 'Elementos por página', example: 20 })
  @ApiOkResponse({ type: PaginaResenasAdminDto, description: 'Lista paginada de reseñas para moderación' })
  reviews(@Query() paginacion: PaginacionDto) { return this.svc.getReviews(paginacion.pagina, paginacion.limite, paginacion.ordenarPor, paginacion.direccion, paginacion.buscar) }

  @Delete('resenas/:id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar reseña', description: 'Elimina la reseña y recalcula la calificación de la institución' })
  @ApiParam({ name: 'id', description: 'ID de la reseña' })
  @ApiNoContentResponse({ description: 'Reseña eliminada y calificación recalculada' })
  @ApiResponse({ status: 404, description: 'Reseña no encontrada' })
  deleteReview(@Param('id') id: string) { return this.svc.deleteReview(id) }

  /* ── Alertas de riesgo ── */
  @Get('alertas')
  @UseETag()
  @ApiOperation({ summary: 'Alertas de riesgo', description: 'Genera alertas automáticas: calificaciones críticas, instituciones sin verificar, cobertura incompleta, retención, etc.' })
  @ApiOkResponse({ type: [AlertaDto], description: 'Lista de alertas ordenadas por severidad (crítica → media → info)' })
  alerts() { return this.svc.getAlerts() }

  /* ── Configuración ── */
  @Get('configuracion')
  @UseETag()
  @ApiOperation({ summary: 'Obtener configuración de plataforma' })
  @ApiOkResponse({ type: ConfiguracionDto, description: 'Configuración actual (nombre, correo de soporte, registro, mantenimiento, etc.)' })
  settings() { return this.svc.getSettings() }

  @Put('configuracion')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Actualizar configuración', description: 'Actualiza configuración de la plataforma. Solo se modifican campos válidos.' })
  @ApiBody({ type: ActualizarConfiguracionDto })
  @ApiOkResponse({ type: ConfiguracionDto, description: 'Configuración actualizada' })
  updateSettings(@Body() dto: ActualizarConfiguracionDto) { return this.svc.updateSettings(dto as Record<string, string>) }
}
