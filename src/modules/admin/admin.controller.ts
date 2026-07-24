import { Controller, Get, Post, Put, Patch, Delete, Param, Body, UseGuards, HttpCode } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger'
import { AdminService } from './admin.service'
import { ActualizarConfiguracionDto } from './dto/actualizar-configuracion.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('Administración')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('administracion')
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  /* ── Stats y analítica ── */
  @Get('estadisticas')
  @ApiOperation({ summary: 'Estadísticas generales', description: 'Retorna contadores de usuarios, instituciones, reseñas, publicaciones, etc.' })
  @ApiResponse({ status: 200, description: 'Estadísticas del panel de control' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (se requiere admin)' })
  stats() { return this.svc.getStats() }

  @Get('analiticas')
  @ApiOperation({ summary: 'Analíticas detalladas', description: 'Registros por mes, distribución de roles, categorías, calificaciones, actividad comunitaria, distribución geográfica' })
  @ApiResponse({ status: 200, description: 'Datos de analítica completa' })
  analytics() { return this.svc.getAnalytics() }

  @Get('inteligencia-necesidades')
  @ApiOperation({ summary: 'Inteligencia de necesidades', description: 'Motor de análisis: demanda vs oferta por tipo de discapacidad, brechas de cobertura, análisis automáticos' })
  @ApiResponse({ status: 200, description: 'Análisis de cobertura con hallazgos' })
  needsIntelligence() { return this.svc.getNeedsIntelligence() }

  /* ── Instituciones ── */
  @Get('instituciones')
  @ApiOperation({ summary: 'Todas las instituciones (admin)' })
  @ApiResponse({ status: 200, description: 'Lista completa de instituciones con estado y verificación' })
  institutions() { return this.svc.getAllInstitutions() }

  @Get('instituciones/pendientes')
  @ApiOperation({ summary: 'Instituciones pendientes de aprobación' })
  @ApiResponse({ status: 200, description: 'Instituciones con activa=false' })
  pending() { return this.svc.getPendingInstitutions() }

  @Post('instituciones/:id/aprobar')
  @HttpCode(204)
  @ApiOperation({ summary: 'Aprobar institución', description: 'Activa la institución y envía correo de notificación' })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiResponse({ status: 204, description: 'Institución aprobada' })
  @ApiResponse({ status: 404, description: 'Institución no encontrada' })
  approve(@Param('id') id: string) { return this.svc.approveInstitution(id) }

  @Patch('instituciones/:id/verificar')
  @ApiOperation({ summary: 'Alternar verificación de institución' })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiResponse({ status: 200, description: 'Estado de verificación actualizado' })
  verify(@Param('id') id: string) { return this.svc.toggleVerifyInstitution(id) }

  @Delete('instituciones/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Rechazar/eliminar institución', description: 'Elimina permanentemente la institución' })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiResponse({ status: 204, description: 'Institución eliminada' })
  @ApiResponse({ status: 404, description: 'Institución no encontrada' })
  reject(@Param('id') id: string) { return this.svc.rejectInstitution(id) }

  /* ── Usuarios ── */
  @Get('usuarios')
  @ApiOperation({ summary: 'Todos los usuarios' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios con correo, nombre, rol, estado' })
  users() { return this.svc.getUsers() }

  @Patch('usuarios/:id/activo')
  @ApiOperation({ summary: 'Activar/desactivar usuario' })
  @ApiParam({ name: 'id', description: 'ID del usuario' })
  @ApiResponse({ status: 200, description: 'Estado de activación actualizado' })
  @ApiResponse({ status: 400, description: 'No puedes desactivar tu propia cuenta' })
  toggleActive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.toggleUserActive(id, user.id)
  }

  @Patch('usuarios/:id/rol')
  @ApiOperation({ summary: 'Cambiar rol de usuario', description: 'Roles válidos: pcd, tutor, institución, administrador' })
  @ApiParam({ name: 'id', description: 'ID del usuario' })
  @ApiBody({ schema: { properties: { role: { type: 'string', enum: ['pcd', 'tutor', 'institution', 'admin'] } } } })
  @ApiResponse({ status: 200, description: 'Rol actualizado' })
  @ApiResponse({ status: 400, description: 'Rol inválido o intento de cambiar propio rol' })
  changeRole(@Param('id') id: string, @Body('role') role: string, @CurrentUser() user: any) {
    return this.svc.changeUserRole(id, role, user.id)
  }

  @Delete('usuarios/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar cuenta de usuario', description: 'Elimina permanentemente el usuario, su avatar en Storage, perfil extendido y dependientes. No se puede eliminar la propia cuenta.' })
  @ApiParam({ name: 'id', description: 'ID del usuario a eliminar' })
  @ApiResponse({ status: 204, description: 'Cuenta eliminada permanentemente' })
  @ApiResponse({ status: 400, description: 'Intento de eliminar la propia cuenta' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (se requiere admin)' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  deleteUser(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.deleteUser(id, user.id)
  }

  /* ── Reseñas ── */
  @Get('resenas')
  @ApiOperation({ summary: 'Moderar reseñas', description: 'Lista las últimas 100 reseñas con información de usuario e institución' })
  @ApiResponse({ status: 200, description: 'Lista de reseñas para moderación' })
  reviews() { return this.svc.getReviews() }

  @Delete('resenas/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar reseña', description: 'Elimina la reseña y recalcula la calificación de la institución' })
  @ApiParam({ name: 'id', description: 'ID de la reseña' })
  @ApiResponse({ status: 204, description: 'Reseña eliminada y calificación recalculada' })
  @ApiResponse({ status: 404, description: 'Reseña no encontrada' })
  deleteReview(@Param('id') id: string) { return this.svc.deleteReview(id) }

  /* ── Alertas de riesgo ── */
  @Get('alertas')
  @ApiOperation({ summary: 'Alertas de riesgo', description: 'Genera alertas automáticas: calificaciones críticas, instituciones sin verificar, cobertura incompleta, retención, etc.' })
  @ApiResponse({ status: 200, description: 'Lista de alertas ordenadas por severidad (crítica → media → info)' })
  alerts() { return this.svc.getAlerts() }

  /* ── Configuración ── */
  @Get('configuracion')
  @ApiOperation({ summary: 'Obtener configuración de plataforma' })
  @ApiResponse({ status: 200, description: 'Configuración actual (nombre, correo de soporte, registro, mantenimiento, etc.)' })
  settings() { return this.svc.getSettings() }

  @Put('configuracion')
  @ApiOperation({ summary: 'Actualizar configuración', description: 'Actualiza configuración de la plataforma. Solo se modifican campos válidos.' })
  @ApiBody({ type: ActualizarConfiguracionDto })
  @ApiResponse({ status: 200, description: 'Configuración actualizada' })
  updateSettings(@Body() dto: ActualizarConfiguracionDto) { return this.svc.updateSettings(dto as any) }
}
