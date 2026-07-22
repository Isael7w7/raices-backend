import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger'
import { InstitutionsService } from './institutions.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('Instituciones')
@Controller('instituciones')
export class InstitutionsController {
  constructor(private readonly svc: InstitutionsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar instituciones', description: 'Retorna instituciones activas con filtros opcionales' })
  @ApiQuery({ name: 'categoria', required: false, description: 'Filtrar por categoría: funcional, educativo, laboral, social' })
  @ApiQuery({ name: 'ciudad', required: false, description: 'Filtrar por ciudad (búsqueda parcial)' })
  @ApiQuery({ name: 'busqueda', required: false, description: 'Búsqueda por nombre, descripción o ciudad' })
  @ApiQuery({ name: 'tipoDiscapacidad', required: false, description: 'Filtrar por tipo de discapacidad: tea, motriz, visual, etc.' })
  @ApiQuery({ name: 'edad', required: false, description: 'Filtrar por edad del usuario' })
  @ApiResponse({ status: 200, description: 'Lista de instituciones' })
  findAll(@Query() q: any) { return this.svc.findAll(q) }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de institución' })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiResponse({ status: 200, description: 'Detalle completo de la institución' })
  @ApiResponse({ status: 404, description: 'Institución no encontrada' })
  findOne(@Param('id') id: string) { return this.svc.findOne(id) }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Crear institución', description: 'Registra una nueva institución (queda pendiente de aprobación)' })
  @ApiResponse({ status: 201, description: 'Institución creada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  create(@Body() body: any, @CurrentUser() user: any) { return this.svc.create(body, user.id) }
}
