import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiTags, ApiOperation, ApiResponse, ApiBearerAuth,
  ApiParam, ApiQuery, ApiBody,
} from '@nestjs/swagger'
import { InstitutionsService } from './institutions.service'
import { CreateInstitucionDto } from './dto/create-institucion.dto'
import { UpdateInstitucionDto } from './dto/update-institucion.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('Instituciones')
@Controller('instituciones')
export class InstitutionsController {
  constructor(private readonly svc: InstitutionsService) {}

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
