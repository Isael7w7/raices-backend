import { Controller, Get, Put, Patch, Post, Delete, Param, Body, Query, UseGuards, UseInterceptors, UploadedFile, BadRequestException, ParseFilePipe, MaxFileSizeValidator, HttpCode } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { MultimediaMagicBytesValidator } from '../../common/validators/multimedia-magic-bytes.validator'
import { imageFileFilter } from '../../common/utils/image-filter'
import { ApiTags, ApiOperation, ApiResponse, ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse, ApiBearerAuth, ApiParam, ApiConsumes, ApiBody } from '@nestjs/swagger'
import { UsersService } from './users.service'
import { StorageService } from '../storage/storage.service'
import { GuardarPerfilNecesidadesDto } from './dto/guardar-perfil-necesidades.dto'
import { GuardarEscalasVidaDto } from './dto/guardar-escalas-vida.dto'
import { EscalasVidaGuardadasDto } from './dto/respuestas-escalas.dto'
import { CrearDependienteDto } from './dto/crear-dependiente.dto'
import { ActualizarPerfilDto } from './dto/actualizar-perfil.dto'
import { UpdateFeaturesDto } from './dto/update-features.dto'
import { SubirDocumentoIdentidadDto, DocumentoIdentidadSubidoDto, EstadoValidacionIdentidadDto } from './dto/documento-identidad.dto'
import { PerfilUsuarioDto, PerfilNecesidadesDto, RespuestaAvatarDto, DependienteDto, ConteoDependientesDto, RespuestaVinculacionDto, RespuestaDesvinculacionDto, RespuestaFeaturesDto, RespuestaPermisosDependienteDto, MisPersonaDto, PaginaMisPersonasDto } from './dto/respuestas-usuario.dto'
import { PaginacionDto } from '../../common/dto/paginacion.dto'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { UseETag } from '../../common/decorators/use-etag.decorator'
import { LimitDependientes } from '../../common/decorators/limit-dependientes.decorator'
import { LimitDependientesGuard } from '../../common/guards/limit-dependientes.guard'

@ApiTags('Usuarios')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('usuarios')
export class UsersController {
  constructor(
    private readonly svc: UsersService,
    private readonly storage: StorageService,
  ) {}

  @Get('perfil')
  @UseETag()
  @ApiOperation({ summary: 'Obtener perfil completo del usuario', description: 'Retorna perfil + datos de profiling (discapacidad, necesidades, etc.)' })
  @ApiOkResponse({ type: PerfilUsuarioDto, description: 'Perfil completo' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  profile(@CurrentUser() user: CurrentUserPayload) { return this.svc.getProfile(user.id) }

  @Put('perfil')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 actualizaciones de perfil por minuto
  @ApiOperation({ summary: 'Actualizar perfil básico', description: 'Actualiza nombre, ciudad, estado o urlAvatar del usuario autenticado.' })
  @ApiBody({ type: ActualizarPerfilDto })
  @ApiOkResponse({ type: PerfilUsuarioDto, description: 'Perfil actualizado' })
  updateProfile(@CurrentUser() user: CurrentUserPayload, @Body() dto: ActualizarPerfilDto) {
    return this.svc.updateProfile(user.id, dto)
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('avatar', {
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: imageFileFilter,
  }))
  @ApiOperation({ summary: 'Subir/actualizar foto de perfil', description: 'Sube una imagen (JPEG, PNG, WebP o GIF) de hasta 5MB para usarla como avatar del usuario autenticado. Se valida el tipo MIME y las magic bytes reales del archivo.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { avatar: { type: 'string', format: 'binary' } } } })
  @ApiCreatedResponse({ type: RespuestaAvatarDto, description: 'Avatar actualizado correctamente' })
  @ApiResponse({ status: 400, description: 'Archivo inválido: tipo no permitido, demasiado grande, o magic bytes no coinciden con el MIME declarado' })
  @ApiResponse({ status: 503, description: 'No se pudo guardar el avatar en la base de datos (Firestore inaccesible)' })
  async uploadAvatar(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MultimediaMagicBytesValidator(),
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo')
    }
    const urlAvatar = await this.storage.upload(file.buffer, file.originalname, 'avatars')
    return this.svc.updateAvatar(user.id, urlAvatar)
  }

  @Delete('avatar')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar foto de perfil', description: 'Elimina el avatar del usuario de Firebase Storage y limpia el campo en la base de datos.' })
  @ApiNoContentResponse({ description: 'Foto de perfil eliminada correctamente' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  deleteAvatar(@CurrentUser() user: CurrentUserPayload) {
    return this.svc.deleteAvatar(user.id)
  }

  @Post('perfil-necesidades')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 guardados por minuto
  @ApiOperation({ summary: 'Guardar perfil de necesidades', description: 'Guarda tipos de discapacidad, necesidades, metas, historial, etc.' })
  @ApiBody({ type: GuardarPerfilNecesidadesDto })
  @ApiCreatedResponse({ type: PerfilNecesidadesDto, description: 'Perfil de necesidades guardado con éxito' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  saveProfiling(@CurrentUser() user: CurrentUserPayload, @Body() dto: GuardarPerfilNecesidadesDto) {
    return this.svc.saveProfilingData(user.id, dto)
  }

  // ═══════════════════════════════════════════════════════════════════
  // Escalas "Cómo vives hoy" (Spec MVP Raíces)
  // ═══════════════════════════════════════════════════════════════════

  @Post('escalas-vida')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Guardar evaluación "Cómo vives hoy"',
    description: 'Guarda las 8 escalas de vida (autonomía, independencia, comunicación, comprensión, energía, movilidad, social, emocional), diagnóstico, temporalidad, formato preferido, áreas de interés y viabilidad económica. Si no tiene diagnóstico, genera un flag para sugerir conexión con especialistas.',
  })
  @ApiBody({ type: GuardarEscalasVidaDto })
  @ApiCreatedResponse({ type: EscalasVidaGuardadasDto, description: 'Escalas guardadas con éxito' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  saveEscalasVida(@CurrentUser() user: CurrentUserPayload, @Body() dto: GuardarEscalasVidaDto) {
    return this.svc.saveEscalasVida(user.id, dto)
  }

  // ═══════════════════════════════════════════════════════════════════
  // Documentos de identidad (Validación diferida)
  // ═══════════════════════════════════════════════════════════════════

  @Post('documento-identidad')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('documento', {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true)
      } else {
        cb(new BadRequestException('Solo se permiten archivos JPEG, PNG, WebP o PDF'), false)
      }
    },
  }))
  @ApiOperation({
    summary: 'Subir documento de identidad',
    description: 'Sube un documento de identidad (CURP o identificación oficial) para validación. Formato: multipart/form-data con campo "documento" y campo "tipo". Si es CURP, incluir "numeroCurp".',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['curp', 'identificacion_oficial'], description: 'Tipo de documento' },
        numeroCurp: { type: 'string', description: 'Número de CURP (solo si tipo=curp)' },
        documento: { type: 'string', format: 'binary', description: 'Archivo del documento (JPEG, PNG, WebP o PDF, max 10MB)' },
      },
      required: ['tipo', 'documento'],
    },
  })
  @ApiCreatedResponse({ type: DocumentoIdentidadSubidoDto, description: 'Documento subido exitosamente, pendiente de revisión' })
  @ApiResponse({ status: 400, description: 'Archivo inválido o tipo no permitido' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  subirDocumentoIdentidad(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: Express.Multer.File,
    @Body('tipo') tipo: 'curp' | 'identificacion_oficial',
    @Body('numeroCurp') numeroCurp?: string,
  ) {
    if (!file) throw new BadRequestException('No se proporcionó ningún archivo')
    if (!tipo || !['curp', 'identificacion_oficial'].includes(tipo)) {
      throw new BadRequestException('Tipo de documento inválido. Debe ser "curp" o "identificacion_oficial"')
    }
    return this.svc.subirDocumentoIdentidad(user.id, tipo, file, numeroCurp)
  }

  @Get('estado-validacion-identidad')
  @UseETag()
  @ApiOperation({
    summary: 'Estado de validación de identidad',
    description: 'Retorna el estado de validación de los documentos de identidad del usuario (sin_documentos, pendiente, aprobado, rechazado).',
  })
  @ApiOkResponse({ type: EstadoValidacionIdentidadDto, description: 'Estado de validación' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  getEstadoValidacionIdentidad(@CurrentUser() user: CurrentUserPayload) {
    return this.svc.getEstadoValidacionIdentidad(user.id)
  }

  @Get('dependientes/count')
  @UseETag()
  @ApiOperation({ summary: 'Conteo de dependientes', description: 'Retorna el número de dependientes registrados y el límite restante permitido.' })
  @ApiOkResponse({ type: ConteoDependientesDto, description: 'Conteo y límite restante' })
  dependentsCount(@CurrentUser() user: CurrentUserPayload) { return this.svc.getDependentsCount(user.id) }

  @Get('dependientes')
  @UseETag()
  @ApiOperation({ summary: 'Listar dependientes', description: 'Retorna personas bajo cuidado del usuario (hijos, pacientes)' })
  @ApiOkResponse({ type: [DependienteDto], description: 'Lista de dependientes' })
  dependents(@CurrentUser() user: CurrentUserPayload) { return this.svc.getDependents(user.id) }

  @Get('mis-personas')
  @UseETag()
  @ApiOperation({ summary: 'Mis personas', description: 'Lista consolidada y paginada de dependientes planos y cuentas PCD vinculadas bajo una interfaz común (id, nombre, esCuentaVinculada, features, fotoUrl). Permite búsqueda por nombre y ordenamiento.' })
  @ApiOkResponse({ type: PaginaMisPersonasDto, description: 'Lista paginada de personas bajo cuidado' })
  misPersonas(@CurrentUser() user: CurrentUserPayload, @Query() paginacion: PaginacionDto) {
    return this.svc.getMisPersonas(user.id, paginacion.pagina, paginacion.limite, paginacion.ordenarPor, paginacion.direccion, paginacion.buscar)
  }

  @Post('dependientes')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 dependientes por minuto
  @UseGuards(LimitDependientesGuard)
  @LimitDependientes()
  @ApiOperation({ summary: 'Agregar dependiente', description: 'Crea un dependiente directo. Valida automáticamente el límite máximo de dependientes por tutor.' })
  @ApiBody({ type: CrearDependienteDto })
  @ApiCreatedResponse({ type: DependienteDto, description: 'Dependiente creado' })
  @ApiResponse({ status: 400, description: 'Límite máximo de dependientes alcanzado' })
  addDependent(@CurrentUser() user: CurrentUserPayload, @Body() dto: CrearDependienteDto) {
    return this.svc.addDependent(user.id, dto)
  }

  @Get('dependientes/:dependienteId/permisos')
  @UseETag()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor', 'admin')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Permisos de dependiente', description: 'Retorna los permisos (features) de un dependiente plano o cuenta PCD vinculada. Solo el tutor dueño o un administrador pueden consultarlos.' })
  @ApiParam({ name: 'dependienteId', description: 'ID del dependiente' })
  @ApiOkResponse({ type: RespuestaPermisosDependienteDto, description: 'Permisos del dependiente' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (se requiere tutor o admin)' })
  @ApiResponse({ status: 404, description: 'Dependiente no encontrado' })
  getDependentPermissions(@CurrentUser() user: CurrentUserPayload, @Param('dependienteId') dependienteId: string) {
    return this.svc.getDependentPermissions(user.id, dependienteId, user.rol)
  }

  @Get('dependientes/:id')
  @UseETag()
  @ApiOperation({ summary: 'Detalle de dependiente', description: 'Retorna la información de un dependiente específico por su ID.' })
  @ApiParam({ name: 'id', description: 'ID del dependiente' })
  @ApiOkResponse({ type: DependienteDto, description: 'Dependiente encontrado' })
  @ApiResponse({ status: 404, description: 'Dependiente no encontrado' })
  getDependent(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.svc.getDependent(user.id, id)
  }

  @Put('dependientes/:id')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 actualizaciones por minuto
  @ApiOperation({ summary: 'Actualizar dependiente' })
  @ApiBody({ type: CrearDependienteDto })
  @ApiParam({ name: 'id', description: 'ID del dependiente' })
  @ApiOkResponse({ type: DependienteDto, description: 'Dependiente actualizado' })
  @ApiResponse({ status: 404, description: 'Dependiente no encontrado' })
  updateDependent(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: CrearDependienteDto) {
    return this.svc.updateDependent(user.id, id, dto)
  }

  @Delete('dependientes/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar dependiente' })
  @ApiParam({ name: 'id', description: 'ID del dependiente' })
  @ApiNoContentResponse({ description: 'Dependiente eliminado' })
  @ApiResponse({ status: 404, description: 'Dependiente no encontrado' })
  deleteDependent(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.svc.deleteDependent(user.id, id)
  }

  // ─── Endpoints de vinculación y features ────────────────────────────

  @Post('vincular-pcd')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 vinculaciones por minuto
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Vincular PCD a tutor', description: 'Vincula una cuenta PCD existente a la cuenta del tutor autenticado utilizando el correo electrónico.' })
  @ApiBody({ schema: { type: 'object', properties: { email: { type: 'string', description: 'Correo electrónico de la cuenta PCD a vincular' } }, required: ['email'] } })
  @ApiCreatedResponse({ type: RespuestaVinculacionDto, description: 'PCD vinculada exitosamente' })
  @ApiResponse({ status: 400, description: 'La cuenta ya está vinculada o no es una PCD' })
  @ApiResponse({ status: 404, description: 'No se encontró un usuario PCD asociado a ese correo' })
  linkPcdToTutor(@CurrentUser() user: CurrentUserPayload, @Body('email') email: string) {
    const normalizedEmail = email?.trim().toLowerCase()
    return this.svc.linkPcdToTutor(user.id, normalizedEmail)
  }

  @Patch('dependientes/:dependienteId/features')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Actualizar features de dependiente (PATCH)', description: 'Actualiza parcialmente el mapa features de un dependiente plano. Valida que el dependiente pertenezca al tutor autenticado.' })
  @ApiParam({ name: 'dependienteId', description: 'ID del dependiente' })
  @ApiBody({ type: UpdateFeaturesDto })
  @ApiOkResponse({ type: RespuestaFeaturesDto, description: 'Features actualizadas' })
  @ApiResponse({ status: 404, description: 'Dependiente no encontrado' })
  updateDependentFeaturesPatch(@CurrentUser() user: CurrentUserPayload, @Param('dependienteId') dependienteId: string, @Body() dto: UpdateFeaturesDto) {
    return this.svc.updateDependentFeatures(user.id, dependienteId, dto)
  }

  @Patch('dependientes/:dependienteId/permisos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Guardar permisos de dependiente', description: 'Alias de PATCH /dependientes/:dependienteId/features: actualiza los switches de permisos (chat, postulaciones, comunidad, reseñas, etc.) de un dependiente plano. Para cuentas PCD vinculadas actualiza el perfil real de la PCD.' })
  @ApiParam({ name: 'dependienteId', description: 'ID del dependiente' })
  @ApiBody({ type: UpdateFeaturesDto })
  @ApiOkResponse({ type: RespuestaFeaturesDto, description: 'Permisos actualizados' })
  @ApiResponse({ status: 404, description: 'Dependiente no encontrado' })
  saveDependentPermissions(@CurrentUser() user: CurrentUserPayload, @Param('dependienteId') dependienteId: string, @Body() dto: UpdateFeaturesDto) {
    return this.svc.updateDependentFeatures(user.id, dependienteId, dto)
  }

  @Patch('vincular-pcd/:pcdId/features')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Actualizar features de PCD vinculada (PATCH)', description: 'Actualiza parcialmente el objeto features del perfil real de una cuenta PCD vinculada al tutor autenticado.' })
  @ApiParam({ name: 'pcdId', description: 'ID de la cuenta PCD vinculada' })
  @ApiBody({ type: UpdateFeaturesDto })
  @ApiOkResponse({ type: RespuestaFeaturesDto, description: 'Features actualizadas' })
  @ApiResponse({ status: 403, description: 'La PCD no está vinculada a tu cuenta' })
  @ApiResponse({ status: 404, description: 'Usuario PCD no encontrado' })
  updateLinkedPcdFeaturesPatch(@CurrentUser() user: CurrentUserPayload, @Param('pcdId') pcdId: string, @Body() dto: UpdateFeaturesDto) {
    return this.svc.updateLinkedPcdFeatures(user.id, pcdId, dto)
  }

  // ── Alias deprecados (compatibilidad): usa PATCH /dependientes/:dependienteId/features

  @Put('dependientes/:id/features')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Configurar features de dependiente (deprecado)', description: 'DEPRECADO — usa PATCH /dependientes/:dependienteId/features. Activa/desactiva funcionalidades para un dependiente plano.' })
  @ApiParam({ name: 'id', description: 'ID del dependiente' })
  @ApiBody({ type: UpdateFeaturesDto })
  @ApiOkResponse({ type: RespuestaFeaturesDto, description: 'Features actualizadas' })
  @ApiResponse({ status: 404, description: 'Dependiente no encontrado' })
  updateDependentFeatures(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: UpdateFeaturesDto) {
    return this.svc.updateDependentFeatures(user.id, id, dto)
  }

  @Put('pcd-vinculado/:pcdUserId/features')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Configurar features de PCD vinculada (deprecado)', description: 'DEPRECADO — usa PATCH /vincular-pcd/:pcdId/features. Activa/desactiva funcionalidades para una cuenta PCD vinculada al tutor.' })
  @ApiParam({ name: 'pcdUserId', description: 'ID de la cuenta PCD vinculada' })
  @ApiBody({ type: UpdateFeaturesDto })
  @ApiOkResponse({ type: RespuestaFeaturesDto, description: 'Features actualizadas' })
  @ApiResponse({ status: 403, description: 'La PCD no está vinculada a tu cuenta' })
  @ApiResponse({ status: 404, description: 'Usuario PCD no encontrado' })
  updateLinkedPcdFeatures(@CurrentUser() user: CurrentUserPayload, @Param('pcdUserId') pcdUserId: string, @Body() dto: UpdateFeaturesDto) {
    return this.svc.updateLinkedPcdFeatures(user.id, pcdUserId, dto)
  }

  @Delete('pcd-vinculado/:pcdUserId/desvincular')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor', 'admin')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Desvincular PCD de tutor', description: 'Desvincula una cuenta PCD de su tutor de forma atómica: limpia tutorId del perfil y elimina las relaciones en dependientes. Solo el tutor dueño o un administrador.' })
  @ApiParam({ name: 'pcdUserId', description: 'ID de la cuenta PCD a desvincular' })
  @ApiOkResponse({ type: RespuestaDesvinculacionDto, description: 'PCD desvinculada exitosamente' })
  @ApiResponse({ status: 400, description: 'La cuenta PCD no está vinculada a ningún tutor' })
  @ApiResponse({ status: 403, description: 'Solo el tutor dueño puede desvincular esta cuenta' })
  @ApiResponse({ status: 404, description: 'Usuario PCD no encontrado' })
  unlinkPcdFromTutor(@CurrentUser() user: CurrentUserPayload, @Param('pcdUserId') pcdUserId: string) {
    return this.svc.unlinkPcdFromTutor(user.id, user.rol, pcdUserId)
  }
}
