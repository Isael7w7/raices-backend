import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query,
  UseGuards, UseInterceptors, UploadedFile, HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import {
  ApiTags, ApiOperation, ApiResponse, ApiBearerAuth,
  ApiParam, ApiQuery, ApiBody, ApiConsumes,
} from '@nestjs/swagger'
import { InstitutionsService } from './institutions.service'
import { CsfQrService } from './csf-qr.service'
import { CreateInstitucionDto } from './dto/create-institucion.dto'
import { UpdateInstitucionDto } from './dto/update-institucion.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('Instituciones')
@Controller('instituciones')
export class InstitutionsController {
  constructor(
    private readonly svc: InstitutionsService,
    private readonly csfQrService: CsfQrService,
  ) {}

  // ─── POST /instituciones/validar-csf-qr ────────────────────────────
  // Público: se invoca durante el registro de organizaciones ANTES de
  // iniciar sesión, por lo que NO debe llevar @UseGuards(JwtAuthGuard).
  @Post('validar-csf-qr')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('archivo', {
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
  @ApiOperation({
    summary: 'Validar código QR de la CSF',
    description: 'Extrae y valida el código QR de una Constancia de Situación Fiscal (CSF) enviada como archivo. Acepta PDF o imagen. Público: se usa durante el registro de organizaciones sin autenticación.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        archivo: { type: 'string', format: 'binary', description: 'Archivo CSF en PDF o imagen (max 10MB)' },
      },
      required: ['archivo'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'QR de la CSF leído correctamente',
    schema: {
      type: 'object',
      properties: {
        exito: { type: 'boolean', example: true },
        valido: { type: 'boolean', example: true },
        mensaje: { type: 'string', example: 'Código QR de la CSF leído correctamente' },
        urlSat: { type: 'string', example: 'https://siat.sat.gob.mx/...' },
        rfc: { type: 'string', example: 'ABC010101XYZ' },
        razonSocial: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Archivo inválido, sin QR detectado o dominio no es del SAT' })
  async validarCsfQr(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo')
    }

    const resultado = await this.csfQrService.extraerUrlSatFromCsf(file.buffer, file.mimetype)

    return {
      exito: true,
      valido: true,
      mensaje: 'Código QR de la CSF leído correctamente',
      urlSat: resultado.urlSat,
      rfc: resultado.rfc,
      razonSocial: resultado.razonSocial,
    }
  }

  // ─── GET /instituciones/mi-institucion ────────────────────────────
  @Get('mi-institucion')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Mi institución',
    description: 'Retorna la información de la institución asociada al usuario autenticado.',
  })
  @ApiResponse({ status: 200, description: 'Institución del usuario' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'El usuario no tiene institución registrada' })
  findMine(@CurrentUser() user: any) {
    return this.svc.findMine(user.id)
  }

  // ─── PUT /instituciones/mi-institucion ────────────────────────────
  @Put('mi-institucion')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Actualizar mi institución',
    description: 'Permite actualizar la información de la institución del usuario autenticado.',
  })
  @ApiBody({ type: UpdateInstitucionDto })
  @ApiResponse({ status: 200, description: 'Institución actualizada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'El usuario no tiene institución registrada' })
  updateMine(@CurrentUser() user: any, @Body() dto: UpdateInstitucionDto) {
    return this.svc.updateMine(user.id, dto)
  }

  // ─── GET /instituciones ───────────────────────────────────────────
  @Get()
  @ApiOperation({
    summary: 'Listar instituciones',
    description: 'Obtiene la lista completa de instituciones activas con paginación y búsqueda.',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Número de página (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Elementos por página (default: 20, max: 50)' })
  @ApiQuery({ name: 'busqueda', required: false, description: 'Búsqueda por nombre, descripción o ciudad' })
  @ApiQuery({ name: 'categoria', required: false, description: 'Filtrar por categoría: funcional, educativo, laboral, social' })
  @ApiQuery({ name: 'ciudad', required: false, description: 'Filtrar por ciudad (búsqueda parcial)' })
  @ApiResponse({ status: 200, description: 'Lista paginada de instituciones' })
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('busqueda') busqueda?: string,
    @Query('categoria') categoria?: string,
    @Query('ciudad') ciudad?: string,
  ) {
    return this.svc.findAll({ page, limit, busqueda, categoria, ciudad })
  }

  // ─── GET /instituciones/:id ───────────────────────────────────────
  @Get(':id')
  @ApiOperation({
    summary: 'Detalle de institución',
    description: 'Obtiene los detalles de una institución específica por su ID.',
  })
  @ApiParam({ name: 'id', description: 'ID de la institución (UID de Firestore)' })
  @ApiResponse({ status: 200, description: 'Detalle completo de la institución' })
  @ApiResponse({ status: 404, description: 'Institución no encontrada' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id)
  }

  // ─── POST /instituciones ──────────────────────────────────────────
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Crear institución',
    description: 'Crea una nueva institución en Firestore. Queda pendiente de verificación por un administrador.',
  })
  @ApiBody({ type: CreateInstitucionDto })
  @ApiResponse({ status: 201, description: 'Institución creada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  create(@Body() dto: CreateInstitucionDto, @CurrentUser() user: any) {
    return this.svc.create(dto, user.id)
  }

  // ─── PUT /instituciones/:id ───────────────────────────────────────
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Actualizar institución',
    description: 'Actualiza los datos de una institución por su ID.',
  })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiBody({ type: UpdateInstitucionDto })
  @ApiResponse({ status: 200, description: 'Institución actualizada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Institución no encontrada' })
  update(@Param('id') id: string, @Body() dto: UpdateInstitucionDto, @CurrentUser() user: any) {
    return this.svc.update(id, dto, user.id, user.rol)
  }

  // ─── DELETE /instituciones/:id ────────────────────────────────────
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Eliminar institución',
    description: 'Elimina suavemente (soft-delete) una institución de la base de datos.',
  })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiResponse({ status: 200, description: 'Institución eliminada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Institución no encontrada' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.remove(id, user.id, user.rol)
  }
}
