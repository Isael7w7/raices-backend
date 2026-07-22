import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger'
import { InstitutionsService } from './institutions.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('Institutions')
@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly svc: InstitutionsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar instituciones', description: 'Retorna instituciones activas con filtros opcionales' })
  @ApiQuery({ name: 'categoria', required: false, description: 'Filtrar por categoria: funcional, educativo, laboral, social' })
  @ApiQuery({ name: 'ciudad', required: false, description: 'Filtrar por ciudad (busqueda parcial)' })
  @ApiQuery({ name: 'busqueda', required: false, description: 'Busqueda por nombre, descripcion o ciudad' })
  @ApiQuery({ name: 'tipoDiscapacidad', required: false, description: 'Filtrar por tipo de discapacidad: tea, motriz, visual, etc.' })
  @ApiQuery({ name: 'edad', required: false, description: 'Filtrar por edad del usuario' })
  @ApiResponse({ status: 200, description: 'Lista de instituciones' })
  findAll(@Query() q: any) { return this.svc.findAll(q) }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de institucion' })
  @ApiParam({ name: 'id', description: 'ID de la institucion' })
  @ApiResponse({ status: 200, description: 'Detalle completo de la institucion' })
  @ApiResponse({ status: 404, description: 'Institucion no encontrada' })
  findOne(@Param('id') id: string) { return this.svc.findOne(id) }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Crear institucion', description: 'Registra una nueva institucion (queda pendiente de aprobacion)' })
  @ApiResponse({ status: 201, description: 'Institucion creada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  create(@Body() body: any, @CurrentUser() user: any) { return this.svc.create(body, user.id) }
}
