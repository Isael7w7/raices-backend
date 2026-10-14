import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query,
  UseGuards, UseInterceptors, UploadedFile, HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import {
  ApiTags, ApiOperation, ApiResponse, ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse, ApiBearerAuth,
  ApiParam, ApiQuery, ApiBody, ApiConsumes,
} from '@nestjs/swagger'
import { InstitutionsService } from './institutions.service'
import { CsfQrService } from './csf-qr.service'
import { CreateInstitucionDto } from './dto/create-institucion.dto'
import { UpdateInstitucionDto } from './dto/update-institucion.dto'
import { SubirDocumentoVerificacionDto } from './dto/subir-documento-verificacion.dto'
import { InstitucionDto, InstitucionPublicaDto, PaginaInstitucionesDto, DocumentoVerificacionSubidoDto, EstadoVerificacionInstitucionDto, InscripcionServicioDto, EstadoInscripcionServicioDto, ListadoInscripcionesServicioDto, ResumenInscripcionesServicioDto } from './dto/respuestas-institucion.dto'
import { Throttle } from '@nestjs/throttler'
import { csfDocumentFileFilter } from '../../common/utils/image-filter'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { UseETag } from '../../common/decorators/use-etag.decorator'
import { InstitucionVerificadaGuard } from '../../common/guards/institucion-verificada.guard'

@ApiTags('Instituciones')
@Controller('instituciones')
export class InstitutionsController {
  constructor(
    private readonly svc: InstitutionsService,
    private readonly csfQrService: CsfQrService,
  ) {}

  // ─── POST /instituciones/validar-csf-qr ──────────────────────────
  @Post('validar-csf-qr')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 validaciones por minuto
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('documento', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          'application/pdf',
          'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp',
        ]
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(new BadRequestException('Solo se permiten archivos PDF o imágenes (PNG, JPEG, GIF, WebP, BMP)'), false)
        }
      },
    }),
  )
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Validar código QR de la CSF',
    description: 'Extrae y valida el código QR de una Constancia de Situación Fiscal (CSF) enviada como archivo. Acepta PDF o imagen. Retorna la URL del SAT si el QR es válido.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        documento: { type: 'string', format: 'binary', description: 'Archivo CSF en PDF o imagen (max 10MB)' },
      },
      required: ['documento'],
    },
  })
  @ApiOkResponse({
    description: 'QR de la CSF leído correctamente',
    schema: {
      type: 'object',
      properties: {
        exito: { type: 'boolean', example: true },
        mensaje: { type: 'string', example: 'Código QR de la CSF leído correctamente' },
        urlSat: { type: 'string', example: 'https://siat.sat.gob.mx/...' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Archivo inválido, sin QR detectado o dominio no es del SAT' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async validarCsfQr(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo')
    }

    const urlSat = await this.csfQrService.extraerUrlSatFromCsf(file.buffer, file.mimetype)

    return {
      exito: true,
      mensaje: 'Código QR de la CSF leído correctamente',
      urlSat,
    }
  }

  // ─── POST /instituciones/verificacion/documentos ─────────────────
  @Post('verificacion/documentos')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 cargas por minuto
  @UseGuards(JwtAuthGuard, RolesGuard)
  // La empresa se registra con `rol: 'empresa'` y comparte la entidad institución
  // (`instituciones/{uid}` con `tipo: 'empresa'`, ver auth.service.registrar),
  // así que debe poder subir su CSF por aquí: si se queda fuera, el único
  // endpoint de identidad disponible es /usuarios/documento-identidad, que
  // rechaza 'csf' con 400 y además no alimenta `documentoCsf`, que es el campo
  // que el admin lee para decidir si la persona moral puede aprobarse.
  @Roles('institucion', 'empresa', 'admin')
  @ApiBearerAuth('jwt-auth')
  @UseInterceptors(FileInterceptor('documento', {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: csfDocumentFileFilter,
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Subir documento de verificación (institución/empresa)',
    description:
      'Carga documentos de verificación de una cuenta institucional/empresarial (persona moral). ' +
      'Requisito indispensable: `tipo=csf` (Constancia de Situación Fiscal). Opcional: ' +
      '`tipo=identificacion_representante` (INE/pasaporte del representante legal). ' +
      'La CURP NO es aplicable a personas morales: `numeroCurp` es opcional y se ignora por completo.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['documento', 'tipo'],
      properties: {
        documento: { type: 'string', format: 'binary', description: 'Archivo PDF o imagen (máx 10MB)' },
        tipo: { type: 'string', enum: ['csf', 'identificacion_representante'], example: 'csf' },
        numeroCurp: { type: 'string', description: 'Opcional e ignorado: la CURP no aplica a personas morales', nullable: true },
      },
    },
  })
  @ApiCreatedResponse({ type: DocumentoVerificacionSubidoDto, description: 'Documento subido' })
  @ApiResponse({ status: 400, description: 'Sin archivo o tipo inválido' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (se requiere institución o admin)' })
  @ApiResponse({ status: 404, description: 'El usuario no tiene institución registrada' })
  subirDocumentoVerificacion(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SubirDocumentoVerificacionDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.svc.subirDocumentoVerificacion(user.id, dto.tipo, file!)
  }

  // ─── GET /instituciones/mi-institucion/estado-verificacion ───────
  @Get('mi-institucion/estado-verificacion')
  @UseETag()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Estado de verificación de mi institución',
    description:
      'Lista de pasos de verificación válidos para personas morales: CSF (indispensable), ' +
      'Aprobación del Administrador (indispensable) e Identificación del Representante Legal (opcional). ' +
      'No incluye el paso de CURP: no aplica a instituciones/empresas.',
  })
  @ApiOkResponse({ type: EstadoVerificacionInstitucionDto, description: 'Estado de verificación con pasos y porcentaje' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'El usuario no tiene institución registrada' })
  getEstadoVerificacion(@CurrentUser() user: CurrentUserPayload) {
    return this.svc.getEstadoVerificacion(user.id)
  }

  // ─── GET /instituciones/mi-institucion ────────────────────────────
  @Get('mi-institucion')
  @UseETag()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Mi institución',
    description: 'Retorna la información de la institución asociada al usuario autenticado.',
  })
  @ApiOkResponse({ type: InstitucionDto, description: 'Institución del usuario' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'El usuario no tiene institución registrada' })
  findMine(@CurrentUser() user: CurrentUserPayload) {
    return this.svc.findMine(user.id)
  }

  // ─── PUT /instituciones/mi-institucion ────────────────────────────
  @Put('mi-institucion')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 actualizaciones por minuto
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('institucion', 'admin')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Actualizar mi institución',
    description: 'Permite actualizar la información de la institución del usuario autenticado. Solo cuentas con rol institución o admin.',
  })
  @ApiBody({ type: UpdateInstitucionDto })
  @ApiOkResponse({ type: InstitucionDto, description: 'Institución actualizada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente: se requiere rol institución o admin' })
  @ApiResponse({ status: 404, description: 'El usuario no tiene institución registrada' })
  updateMine(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateInstitucionDto) {
    return this.svc.updateMine(user.id, dto)
  }

  // ─── DELETE /instituciones/mi-institucion ─────────────────────────
  @Delete('mi-institucion')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 eliminaciones por minuto
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('institucion', 'admin')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Eliminar mi institución',
    description: 'Elimina suavemente (soft-delete) la institución del usuario autenticado. Solo cuentas con rol institución o admin.',
  })
  @ApiNoContentResponse({ description: 'Institución eliminada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente: se requiere rol institución o admin' })
  @ApiResponse({ status: 404, description: 'El usuario no tiene institución registrada (o ya fue eliminada)' })
  removeMine(@CurrentUser() user: CurrentUserPayload) {
    return this.svc.removeMine(user.id)
  }

  // ─── GET /instituciones ───────────────────────────────────────────
  @Get()
  @UseETag()
  @ApiOperation({
    summary: 'Listar instituciones',
    description: 'Obtiene la lista completa de instituciones activas con paginación y búsqueda.',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Número de página (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Elementos por página (default: 20, max: 50)' })
  @ApiQuery({ name: 'busqueda', required: false, description: 'Búsqueda por nombre, descripción o ciudad' })
  @ApiQuery({ name: 'categoria', required: false, description: 'Filtrar por categoría: funcional, educativo, laboral, social' })
  @ApiQuery({ name: 'ciudad', required: false, description: 'Filtrar por ciudad (búsqueda parcial)' })
  @ApiOkResponse({ type: PaginaInstitucionesDto, description: 'Lista paginada de instituciones' })
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('busqueda') busqueda?: string,
    @Query('categoria') categoria?: string,
    @Query('ciudad') ciudad?: string,
  ) {
    return this.svc.findAll({ page, limit, busqueda, categoria, ciudad })
  }

  // ─── GET /instituciones/:id/detalle (admin o propietario) ──────────
  @Get(':id/detalle')
  @UseETag()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Detalle de institución (admin o propietario)',
    description: 'Retorna una institución sin importar su estado (pendiente, inactiva o verificada). Solo el propietario o un administrador pueden consultarla.',
  })
  @ApiParam({ name: 'id', description: 'ID de la institución (UID de Firestore)' })
  @ApiOkResponse({ type: InstitucionDto, description: 'Detalle completo de la institución' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'No tienes permisos para consultar esta institución' })
  @ApiResponse({ status: 404, description: 'Institución no encontrada' })
  findOneProtegido(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.findOneProtegido(id, user.id, user.rol)
  }

  // ─── GET /instituciones/:id ───────────────────────────────────────
  @Get(':id')
  @UseETag()
  @ApiOperation({
    summary: 'Detalle de institución',
    description:
      'Obtiene los detalles de una institución pública por su ID. Solo se exponen instituciones activas y verificadas. '
      + 'El catálogo `servicios` viene poblado y contiene únicamente los servicios en estado Activo.',
  })
  @ApiParam({ name: 'id', description: 'ID de la institución (UID de Firestore)' })
  @ApiOkResponse({ type: InstitucionPublicaDto, description: 'Detalle completo de la institución (con servicios activos)' })
  @ApiResponse({ status: 404, description: 'Institución no encontrada (o aún no aprobada)' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id)
  }

  // ─── Inscripciones a servicios (flujo con aprobación) ─────────────

  // ─── GET /instituciones/mi-institucion/servicios/inscripciones/resumen ──
  @Get('mi-institucion/servicios/inscripciones/resumen')
  @UseETag()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Resumen de inscripciones por servicio (panel de la institución)',
    description: 'Cuenta pendientes, activas y rechazadas por servicio de la institución del usuario autenticado.',
  })
  @ApiOkResponse({ type: ResumenInscripcionesServicioDto, description: 'Conteo por servicio' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'El usuario no tiene institución registrada' })
  resumenInscripciones(@CurrentUser() user: CurrentUserPayload) {
    return this.svc.resumenInscripcionesServicio(user.id)
  }

  // ─── GET /instituciones/:id/mis-inscripciones ────────────────────
  @Get(':id/mis-inscripciones')
  @UseETag()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Mis inscripciones en los servicios de una institución',
    description: 'Estado de las inscripciones del usuario autenticado en cada servicio de la institución (alimenta el botón Inscribirme/Inscrito).',
  })
  @ApiParam({ name: 'id', description: 'ID de la institución (UID de Firestore)' })
  @ApiOkResponse({ description: '{ institucionId, datos: [{ institucionId, servicioId, estado }] }' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  misInscripciones(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.misInscripcionesServicio(id, user.id)
  }

  // ─── POST /instituciones/:id/servicios/:servicioId/inscripcion ───
  @Post(':id/servicios/:servicioId/inscripcion')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 solicitudes por minuto
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Solicitar inscripción a un servicio',
    description: 'Registra la solicitud de la persona autenticada en un servicio ACTIVO. La inscripción queda `pendiente` hasta que la institución la apruebe. Es idempotente.',
  })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiParam({ name: 'servicioId', description: 'ID del servicio dentro del catálogo' })
  @ApiCreatedResponse({ type: InscripcionServicioDto, description: 'Solicitud registrada (estado pendiente)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Institución o servicio no encontrado (o servicio inactivo)' })
  inscribirAServicio(
    @Param('id') id: string,
    @Param('servicioId') servicioId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.svc.inscribirAServicio(id, servicioId, user.id)
  }

  // ─── GET /instituciones/:id/servicios/:servicioId/inscripcion ────
  @Get(':id/servicios/:servicioId/inscripcion')
  @UseETag()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Mi estado de inscripción en un servicio', description: 'Indica si el usuario está inscrito, con solicitud pendiente o sin inscripción.' })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiParam({ name: 'servicioId', description: 'ID del servicio' })
  @ApiOkResponse({ type: EstadoInscripcionServicioDto, description: 'Estado de la inscripción del usuario' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  miInscripcion(
    @Param('id') id: string,
    @Param('servicioId') servicioId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.svc.miInscripcionServicio(id, servicioId, user.id)
  }

  // ─── DELETE /instituciones/:id/servicios/:servicioId/inscripcion ─
  @Delete(':id/servicios/:servicioId/inscripcion')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 cancelaciones por minuto
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Cancelar mi inscripción a un servicio', description: 'La inscripción pasa a estado `cancelada` (no se elimina el historial).' })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiParam({ name: 'servicioId', description: 'ID del servicio' })
  @ApiOkResponse({ type: InscripcionServicioDto, description: 'Inscripción cancelada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'No existe la inscripción del usuario en ese servicio' })
  cancelarInscripcion(
    @Param('id') id: string,
    @Param('servicioId') servicioId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.svc.cancelarInscripcionServicio(id, servicioId, user.id)
  }

  // ─── GET /instituciones/:id/servicios/:servicioId/inscripciones ──
  @Get(':id/servicios/:servicioId/inscripciones')
  @UseETag()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Inscripciones de un servicio (institución dueña o admin)',
    description: 'Lista de personas inscritas con nombre, correo y avatar para que la institución las ubique (foros, publicaciones, mensajes). Solo la institución dueña o un administrador.',
  })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiParam({ name: 'servicioId', description: 'ID del servicio' })
  @ApiQuery({ name: 'estado', required: false, description: 'Filtrar por estado: pendiente, activa, rechazada, cancelada o todas (default: todas menos cancelada)' })
  @ApiOkResponse({ type: ListadoInscripcionesServicioDto, description: 'Inscripciones con datos de contacto' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'No eres la institución dueña ni un administrador' })
  @ApiResponse({ status: 404, description: 'Institución no encontrada' })
  listarInscripciones(
    @Param('id') id: string,
    @Param('servicioId') servicioId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('estado') estado?: string,
  ) {
    return this.svc.listarInscripcionesServicio(id, servicioId, { id: user.id, rol: user.rol }, estado)
  }

  // ─── POST /instituciones/:id/servicios/:servicioId/inscripciones/:inscripcionId/aprobar ──
  @Post(':id/servicios/:servicioId/inscripciones/:inscripcionId/aprobar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Aprobar inscripción pendiente', description: 'La solicitud pasa a estado `activa`. Solo la institución dueña o un administrador.' })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiParam({ name: 'servicioId', description: 'ID del servicio' })
  @ApiParam({ name: 'inscripcionId', description: 'ID de la inscripción' })
  @ApiOkResponse({ type: InscripcionServicioDto, description: 'Inscripción aprobada' })
  @ApiResponse({ status: 400, description: 'La solicitud ya fue resuelta' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'No eres la institución dueña ni un administrador' })
  @ApiResponse({ status: 404, description: 'Inscripción no encontrada' })
  aprobarInscripcion(
    @Param('id') id: string,
    @Param('inscripcionId') inscripcionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.svc.resolverInscripcionServicio(id, inscripcionId, 'activa', { id: user.id, rol: user.rol })
  }

  // ─── POST /instituciones/:id/servicios/:servicioId/inscripciones/:inscripcionId/rechazar ──
  @Post(':id/servicios/:servicioId/inscripciones/:inscripcionId/rechazar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Rechazar inscripción pendiente', description: 'La solicitud pasa a estado `rechazada`. Solo la institución dueña o un administrador.' })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiParam({ name: 'servicioId', description: 'ID del servicio' })
  @ApiParam({ name: 'inscripcionId', description: 'ID de la inscripción' })
  @ApiOkResponse({ type: InscripcionServicioDto, description: 'Inscripción rechazada' })
  @ApiResponse({ status: 400, description: 'La solicitud ya fue resuelta' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'No eres la institución dueña ni un administrador' })
  @ApiResponse({ status: 404, description: 'Inscripción no encontrada' })
  rechazarInscripcion(
    @Param('id') id: string,
    @Param('inscripcionId') inscripcionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.svc.resolverInscripcionServicio(id, inscripcionId, 'rechazada', { id: user.id, rol: user.rol })
  }

  // ─── POST /instituciones ──────────────────────────────────────────
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 creaciones por minuto
  @UseGuards(JwtAuthGuard, RolesGuard, InstitucionVerificadaGuard)
  @Roles('institucion', 'admin')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Crear institución',
    description: 'Crea una nueva institución en Firestore. Queda pendiente de verificación por un administrador. Solo cuentas con rol institución o administrador.',
  })
  @ApiBody({ type: CreateInstitucionDto })
  @ApiCreatedResponse({ type: InstitucionDto, description: 'Institución creada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente: se requiere rol institución o admin' })
  create(@Body() dto: CreateInstitucionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.create(dto, user.id, user.rol)
  }

  // ─── PUT /instituciones/:id ───────────────────────────────────────
  @Put(':id')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 actualizaciones por minuto
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('institucion', 'admin')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Actualizar institución',
    description: 'Actualiza los datos de una institución por su ID. Solo cuentas con rol institución o admin (la propiedad se valida en el servicio).',
  })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiBody({ type: UpdateInstitucionDto })
  @ApiOkResponse({ type: InstitucionDto, description: 'Institución actualizada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente: se requiere rol institución o admin (o no eres propietario)' })
  @ApiResponse({ status: 404, description: 'Institución no encontrada (o eliminada/inactiva)' })
  update(@Param('id') id: string, @Body() dto: UpdateInstitucionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.update(id, dto, user.id, user.rol)
  }

  // ─── DELETE /instituciones/:id ────────────────────────────────────
  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('institucion', 'admin')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Eliminar institución',
    description: 'Elimina suavemente (soft-delete) una institución de la base de datos. Solo cuentas con rol institución o admin (la propiedad se valida en el servicio).',
  })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiNoContentResponse({ description: 'Institución eliminada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente: se requiere rol institución o admin (o no eres propietario)' })
  @ApiResponse({ status: 404, description: 'Institución no encontrada' })
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.remove(id, user.id, user.rol)
  }
}
