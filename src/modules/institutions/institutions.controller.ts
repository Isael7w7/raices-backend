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
import { CreateInstitucionDto } from './dto/create-institucion.dto'
import { UpdateInstitucionDto } from './dto/update-institucion.dto'
import { InstitucionDto, PaginaInstitucionesDto } from './dto/respuestas-institucion.dto'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { UseETag } from '../../common/decorators/use-etag.decorator'
import { CsfQrService } from './csf-qr.service'
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Actualizar mi institución',
    description: 'Permite actualizar la información de la institución del usuario autenticado.',
  })
  @ApiBody({ type: UpdateInstitucionDto })
  @ApiOkResponse({ type: InstitucionDto, description: 'Institución actualizada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'El usuario no tiene institución registrada' })
  updateMine(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateInstitucionDto) {
    return this.svc.updateMine(user.id, dto)
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
    description: 'Obtiene los detalles de una institución pública por su ID. Solo se exponen instituciones activas y verificadas.',
  })
  @ApiParam({ name: 'id', description: 'ID de la institución (UID de Firestore)' })
  @ApiOkResponse({ type: InstitucionDto, description: 'Detalle completo de la institución' })
  @ApiResponse({ status: 404, description: 'Institución no encontrada (o aún no aprobada)' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id)
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
