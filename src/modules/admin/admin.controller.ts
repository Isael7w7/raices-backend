import { Controller, Get, Post, Put, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger'
import { AdminService } from './admin.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('Admin')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  /* ── Stats y analítica ── */
  @Get('stats')
  @ApiOperation({ summary: 'Estadísticas generales', description: 'Retorna contadores de usuarios, instituciones, reseñas, posts, etc.' })
  @ApiResponse({ status: 200, description: 'Estadísticas del dashboard' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (se requiere admin)' })
  stats() { return this.svc.getStats() }

  @Get('analytics')
  @ApiOperation({ summary: 'Analytics detallados', description: 'Registros por mes, distribución de roles, categorías, ratings, actividad comunitaria, distribución geográfica' })
  @ApiResponse({ status: 200, description: 'Datos de analítica completa' })
  analytics() { return this.svc.getAnalytics() }

  @Get('needs-intelligence')
  @ApiOperation({ summary: 'Inteligencia de necesidades', description: 'Motor de análisis: demanda vs oferta por tipo de discapacidad, brechas de cobertura, insights automáticos' })
  @ApiResponse({ status: 200, description: 'Análisis de cobertura con insights' })
  needsIntelligence() { return this.svc.getNeedsIntelligence() }

  /* ── Instituciones ── */
  @Get('institutions')
  @ApiOperation({ summary: 'Todas las instituciones (admin)' })
  @ApiResponse({ status: 200, description: 'Lista completa de instituciones con estado y verificación' })
  institutions() { return this.svc.getAllInstitutions() }

  @Get('institutions/pending')
  @ApiOperation({ summary: 'Instituciones pendientes de aprobación' })
  @ApiResponse({ status: 200, description: 'Instituciones con is_active=false' })
  pending() { return this.svc.getPendingInstitutions() }

  @Post('institutions/:id/approve')
  @ApiOperation({ summary: 'Aprobar institución', description: 'Activa la institución y envía email de notificación' })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiResponse({ status: 200, description: 'Institución aprobada' })
  @ApiResponse({ status: 404, description: 'Institución no encontrada' })
  approve(@Param('id') id: string) { return this.svc.approveInstitution(id) }

  @Patch('institutions/:id/verify')
  @ApiOperation({ summary: 'Toggle verificación de institución' })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiResponse({ status: 200, description: 'Estado de verificación actualizado' })
  verify(@Param('id') id: string) { return this.svc.toggleVerifyInstitution(id) }

  @Delete('institutions/:id')
  @ApiOperation({ summary: 'Rechazar/eliminar institución', description: 'Elimina permanentemente la institución' })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiResponse({ status: 200, description: 'Institución eliminada' })
  @ApiResponse({ status: 404, description: 'Institución no encontrada' })
  reject(@Param('id') id: string) { return this.svc.rejectInstitution(id) }

  /* ── Usuarios ── */
  @Get('users')
  @ApiOperation({ summary: 'Todos los usuarios' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios con email, nombre, rol, estado' })
  users() { return this.svc.getUsers() }

  @Patch('users/:id/active')
  @ApiOperation({ summary: 'Activar/desactivar usuario' })
  @ApiParam({ name: 'id', description: 'ID del usuario' })
  @ApiResponse({ status: 200, description: 'Estado de activación actualizado' })
  @ApiResponse({ status: 400, description: 'No puedes desactivar tu propia cuenta' })
  toggleActive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.toggleUserActive(id, user.id)
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Cambiar rol de usuario', description: 'Roles válidos: pcd, tutor, institution, admin' })
  @ApiParam({ name: 'id', description: 'ID del usuario' })
  @ApiBody({ schema: { properties: { role: { type: 'string', enum: ['pcd', 'tutor', 'institution', 'admin'] } } } })
  @ApiResponse({ status: 200, description: 'Rol actualizado' })
  @ApiResponse({ status: 400, description: 'Rol inválido o intento de cambiar propio rol' })
  changeRole(@Param('id') id: string, @Body('role') role: string, @CurrentUser() user: any) {
    return this.svc.changeUserRole(id, role, user.id)
  }

  /* ── Reseñas ── */
  @Get('reviews')
  @ApiOperation({ summary: 'Moderar reseñas', description: 'Lista las últimas 100 reseñas con info de usuario e institución' })
  @ApiResponse({ status: 200, description: 'Lista de reseñas para moderación' })
  reviews() { return this.svc.getReviews() }

  @Delete('reviews/:id')
  @ApiOperation({ summary: 'Eliminar reseña', description: 'Elimina la reseña y recalcula el rating de la institución' })
  @ApiParam({ name: 'id', description: 'ID de la reseña' })
  @ApiResponse({ status: 200, description: 'Reseña eliminada y rating recalculado' })
  @ApiResponse({ status: 404, description: 'Reseña no encontrada' })
  deleteReview(@Param('id') id: string) { return this.svc.deleteReview(id) }

  /* ── Alertas de riesgo ── */
  @Get('alerts')
  @ApiOperation({ summary: 'Alertas de riesgo', description: 'Genera alertas automáticas: calificaciones críticas, instituciones sin verificar, cobertura incompleta, retención, etc.' })
  @ApiResponse({ status: 200, description: 'Lista de alertas ordenadas por severidad (crítica → media → info)' })
  alerts() { return this.svc.getAlerts() }

  /* ── Configuración ── */
  @Get('settings')
  @ApiOperation({ summary: 'Obtener configuración de plataforma' })
  @ApiResponse({ status: 200, description: 'Configuración actual (nombre, email soporte, registro, mantenimiento, etc.)' })
  settings() { return this.svc.getSettings() }

  @Put('settings')
  @ApiOperation({ summary: 'Actualizar configuración', description: 'Actualiza configuración de la plataforma. Solo se modifican keys válidas.' })
  @ApiBody({ schema: { properties: { platform_name: { type: 'string' }, maintenance_mode: { type: 'boolean' }, ai_enabled: { type: 'boolean' } } } })
  @ApiResponse({ status: 200, description: 'Configuración actualizada' })
  updateSettings(@Body() body: Record<string, string>) { return this.svc.updateSettings(body) }
}
