import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, UseGuards, HttpCode, UseInterceptors } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiOkResponse, ApiNoContentResponse, ApiBearerAuth, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger'
import { AdminService } from './admin.service'
import { ActualizarConfiguracionDto } from './dto/actualizar-configuracion.dto'
import {
  EstadisticasDto, AnaliticasDto, NecesidadesInteligenciaDto, VisitantesActivosDto,
  InstitucionAdminDto, PaginaInstitucionesAdminDto, UsuarioAdminDto, PaginaUsuariosAdminDto,
  ResenaAdminDto, PaginaResenasAdminDto, RespuestaToggleUsuarioDto, RespuestaToggleVerificacionDto,
  RespuestaRolDto, AlertaDto, ConfiguracionDto, VerificacionIdentidadInstitucionDto,
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
import { Audit } from '../../common/decorators/audit.decorator'
import { AuditInterceptor } from '../../common/interceptors/audit.interceptor'
import { AUDIT_ACCIONES } from '../../common/interfaces/audit-log.interface'
import { AuditService } from '../../common/audit/audit.service'

@ApiTags('Administración')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('administracion')
export class AdminController {
  constructor(
    private readonly svc: AdminService,
    private readonly auditService: AuditService,
  ) {}

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

  /* ── Auditoría ── */
  @Get('auditoria')
  @UseETag()
  @ApiOperation({ summary: 'Logs de auditoría', description: 'Consulta registros de acciones críticas con paginación y filtros opcionales (usuarioId, accion, recurso, fechaDesde, fechaHasta)' })
  @ApiQuery({ name: 'pagina', required: false, example: 1 })
  @ApiQuery({ name: 'limite', required: false, example: 20 })
  @ApiQuery({ name: 'usuarioId', required: false, description: 'Filtrar por ID de usuario' })
  @ApiQuery({ name: 'accion', required: false, description: 'Filtrar por acción (ej: aprobar_institucion)' })
  @ApiQuery({ name: 'recurso', required: false, description: 'Filtrar por recurso (ej: institucion, usuario)' })
  @ApiQuery({ name: 'fechaDesde', required: false, description: 'Filtrar desde fecha ISO 8601' })
  @ApiQuery({ name: 'fechaHasta', required: false, description: 'Filtrar hasta fecha ISO 8601' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (se requiere admin)' })
  async auditLogs(
    @Query() paginacion: PaginacionDto,
    @Query('usuarioId') usuarioId?: string,
    @Query('accion') accion?: string,
    @Query('recurso') recurso?: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    return this.auditService.consultar(paginacion, { usuarioId, accion, recurso, fechaDesde, fechaHasta })
  }

  @Get('auditoria/estadisticas')
  @UseETag()
  @ApiOperation({ summary: 'Estadísticas de auditoría', description: 'Resumen de actividad de auditoría: totales, acciones frecuentes, usuarios activos, errores recientes' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (se requiere admin)' })
  auditStats() { return this.auditService.estadisticas() }

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

  @Get('instituciones/:id/verificacion-identidad')
  @UseETag()
  @ApiOperation({
    summary: 'Verificación de identidad de institución',
    description: 'Retorna el estado de verificación de identidad del representante legal de una institución. Indica si la institución puede ser aprobada (requiere identidad del representante aprobada).',
  })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiOkResponse({ type: VerificacionIdentidadInstitucionDto, description: 'Estado de verificación de identidad de la institución' })
  @ApiResponse({ status: 404, description: 'Institución no encontrada' })
  verificacionIdentidadInstitucion(@Param('id') id: string) {
    return this.svc.getVerificacionIdentidadInstitucion(id)
  }

  @Post('instituciones/:id/aprobar')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(204)
  @UseInterceptors(AuditInterceptor)
  @Audit({
    accion: AUDIT_ACCIONES.APROBAR_INSTITUCION,
    recurso: 'institucion',
    obtenerRecursoId: (id: string) => id,
  })
  @ApiOperation({
    summary: 'Aprobar institución',
    description: 'Activa la institución y envía correo de notificación. Requiere que el representante legal tenga identidad verificada (CURP + identificación oficial aprobados).',
  })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiNoContentResponse({ description: 'Institución aprobada' })
  @ApiResponse({ status: 400, description: 'Identidad del representante no verificada (faltan documentos o están pendientes/rechazados)' })
  @ApiResponse({ status: 404, description: 'Institución no encontrada' })
  approve(@Param('id') id: string) { return this.svc.approveInstitution(id) }

  @Patch('instituciones/:id/verificar')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(AuditInterceptor)
  @Audit({
    accion: AUDIT_ACCIONES.TOGGLE_VERIFICACION,
    recurso: 'institucion',
    obtenerRecursoId: (id: string) => id,
    extraerMetadatos: (resultado) => ({ verificada: resultado?.verificada }),
  })
  @ApiOperation({ summary: 'Alternar verificación de institución' })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiOkResponse({ type: RespuestaToggleVerificacionDto, description: 'Estado de verificación actualizado' })
  verify(@Param('id') id: string) { return this.svc.toggleVerifyInstitution(id) }

  @Delete('instituciones/:id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(204)
  @UseInterceptors(AuditInterceptor)
  @Audit({
    accion: AUDIT_ACCIONES.RECHAZAR_INSTITUCION,
    recurso: 'institucion',
    obtenerRecursoId: (id: string) => id,
  })
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
  @UseInterceptors(AuditInterceptor)
  @Audit({
    accion: AUDIT_ACCIONES.TOGGLE_USUARIO_ACTIVO,
    recurso: 'usuario',
    obtenerRecursoId: (id: string) => id,
    extraerMetadatos: (resultado) => ({ activo: resultado?.activo }),
  })
  @ApiOperation({ summary: 'Activar/desactivar usuario' })
  @ApiParam({ name: 'id', description: 'ID del usuario' })
  @ApiOkResponse({ type: RespuestaToggleUsuarioDto, description: 'Estado de activación actualizado' })
  @ApiResponse({ status: 400, description: 'No puedes desactivar tu propia cuenta' })
  toggleActive(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.toggleUserActive(id, user.id)
  }

  @Patch('usuarios/:id/rol')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(AuditInterceptor)
  @Audit({
    accion: AUDIT_ACCIONES.CAMBIAR_ROL_USUARIO,
    recurso: 'usuario',
    obtenerRecursoId: (id: string) => id,
    extraerMetadatos: (resultado) => ({ rol: resultado?.rol }),
  })
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
  @UseInterceptors(AuditInterceptor)
  @Audit({
    accion: AUDIT_ACCIONES.ELIMINAR_USUARIO,
    recurso: 'usuario',
    obtenerRecursoId: (id: string) => id,
  })
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
  @UseInterceptors(AuditInterceptor)
  @Audit({
    accion: AUDIT_ACCIONES.ELIMINAR_RESENA,
    recurso: 'resena',
    obtenerRecursoId: (id: string) => id,
  })
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
  @UseInterceptors(AuditInterceptor)
  @Audit({
    accion: AUDIT_ACCIONES.ACTUALIZAR_CONFIGURACION,
    recurso: 'configuracion',
    extraerMetadatos: (resultado) => ({ configuracion: resultado }),
  })
  @ApiOperation({ summary: 'Actualizar configuración', description: 'Actualiza configuración de la plataforma. Solo se modifican campos válidos.' })
  @ApiBody({ type: ActualizarConfiguracionDto })
  @ApiOkResponse({ type: ConfiguracionDto, description: 'Configuración actualizada' })
  updateSettings(@Body() dto: ActualizarConfiguracionDto) { return this.svc.updateSettings(dto as Record<string, string>) }

  // ═══════════════════════════════════════════════════════════════════
  // Validación de documentos de identidad (Spec MVP Raíces)
  // ═══════════════════════════════════════════════════════════════════

  @Get('documentos-identidad/pendientes')
  @UseETag()
  @ApiOperation({ summary: 'Documentos de identidad pendientes', description: 'Lista de documentos de identidad pendientes de revisión por un administrador.' })
  @ApiQuery({ name: 'pagina', required: false, example: 1 })
  @ApiQuery({ name: 'limite', required: false, example: 20 })
  @ApiOkResponse({ description: 'Lista paginada de documentos pendientes' })
  documentosIdentidadPendientes(@Query() paginacion: PaginacionDto) {
    return this.svc.getDocumentosIdentidadPendientes(paginacion.pagina, paginacion.limite)
  }

  @Post('documentos-identidad/:id/aprobar')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(204)
  @UseInterceptors(AuditInterceptor)
  @Audit({
    accion: 'aprobar_documento_identidad',
    recurso: 'documento_identidad',
    obtenerRecursoId: (id: string) => id,
  })
  @ApiOperation({ summary: 'Aprobar documento de identidad', description: 'Aprueba un documento de identidad y envía correo de aceptación al usuario.' })
  @ApiParam({ name: 'id', description: 'ID del documento de identidad' })
  @ApiNoContentResponse({ description: 'Documento aprobado' })
  @ApiResponse({ status: 404, description: 'Documento no encontrado' })
  aprobarDocumentoIdentidad(@Param('id') id: string) {
    return this.svc.aprobarDocumentoIdentidad(id)
  }

  @Post('documentos-identidad/:id/rechazar')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(204)
  @UseInterceptors(AuditInterceptor)
  @Audit({
    accion: 'rechazar_documento_identidad',
    recurso: 'documento_identidad',
    obtenerRecursoId: (id: string) => id,
  })
  @ApiOperation({ summary: 'Rechazar documento de identidad', description: 'Rechaza un documento de identidad con motivo. Envía correo de notificación al usuario.' })
  @ApiParam({ name: 'id', description: 'ID del documento de identidad' })
  @ApiBody({ schema: { properties: { motivo: { type: 'string', description: 'Motivo del rechazo' } }, required: ['motivo'] } })
  @ApiNoContentResponse({ description: 'Documento rechazado' })
  @ApiResponse({ status: 400, description: 'Motivo de rechazo requerido' })
  @ApiResponse({ status: 404, description: 'Documento no encontrado' })
  rechazarDocumentoIdentidad(@Param('id') id: string, @Body('motivo') motivo: string) {
    if (!motivo || motivo.trim().length === 0) {
      const { BadRequestException } = require('@nestjs/common')
      throw new BadRequestException('El motivo de rechazo es obligatorio')
    }
    return this.svc.rechazarDocumentoIdentidad(id, motivo)
  }
}
