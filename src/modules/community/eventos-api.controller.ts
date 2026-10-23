import {
  Controller,
  Delete,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody, ApiParam } from '@nestjs/swagger'
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CrearEventoDto } from './dto/crear-evento.dto'
import { ListarEventosDto } from './dto/listar-eventos.dto'
import { EventosService } from './eventos.service'
import { EventoDoc } from '../../common/interfaces/firestore-documents.interface'
import { RespuestaPaginada } from '../../common/dto/paginacion.dto'

@Controller('eventos')
@ApiTags('Eventos API')
export class EventosApiController {
  constructor(private readonly eventosService: EventosService) {}

  /** GET /api/eventos - Lista eventos públicos/autenticados con filtros */
  @Get()
  @ApiOperation({
    summary: 'Listar eventos',
    description:
      'Lista eventos con filtros opcionales: ciudad, categoria, modalidad, proximos, paginación.',
  })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', example: 1, type: 'number' })
  @ApiQuery({ name: 'limite', required: false, description: 'Elementos por página', example: 20, type: 'number' })
  @ApiQuery({ name: 'ciudad', required: false, description: 'Filtrar por ciudad', example: 'Mérida', type: 'string' })
  @ApiQuery({ name: 'categoria', required: false, description: 'Filtrar por categoría', enum: ['taller', 'deporte', 'cultural', 'encuentro', 'voluntariado', 'otro'] })
  @ApiQuery({ name: 'modalidad', required: false, description: 'Filtrar por modalidad', enum: ['presencial', 'virtual', 'hibrido'] })
  @ApiQuery({ name: 'proximos', required: false, description: 'Solo eventos con fecha >= hoy', example: true, type: 'boolean' })
  @ApiQuery({ name: 'buscar', required: false, description: 'Buscar por título o descripción', example: 'taller' })
  @ApiResponse({ status: 200, description: 'Lista de eventos con paginación' })
  async listar(
    @Query() filtros: ListarEventosDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<RespuestaPaginada<EventoDoc>> {
    return this.eventosService.listar(
      user.id,
      filtros.pagina ?? 1,
      filtros.limite ?? 20,
      {
        categoria: filtros.categoria,
        fecha: filtros.fecha,
        desde: filtros.desde,
        buscar: filtros.buscar,
        ciudad: filtros.ciudad,
        modalidad: filtros.modalidad,
        proximos: filtros.proximos ?? true,
      },
    )
  }

  /** GET /api/eventos/:id - Obtener detalle de un evento */
  @Get(':id')
  @ApiOperation({
    summary: 'Obtener evento por ID',
    description: 'Retorna el evento con su organizador y datos completos.',
  })
  @ApiParam({ name: 'id', description: 'ID del evento' })
  @ApiResponse({ status: 200, description: 'Evento encontrado' })
  @ApiResponse({ status: 404, description: 'Evento no encontrado' })
  async obtenerPorId(@Param('id') id: string): Promise<EventoDoc | null> {
    return this.eventosService.obtenerDetalle(id, '') as Promise<EventoDoc | null>
  }

  /** POST /api/eventos - Crear evento (roles: institucion, empresa, admin) */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('institucion', 'empresa', 'admin')
  @ApiOperation({
    summary: 'Crear evento',
    description:
      'Crea un nuevo evento. Solo permitido a roles: institucion, empresa, admin.',
  })
  @ApiBody({ type: CrearEventoDto })
  @ApiResponse({ status: 201, description: 'Evento creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos (fechas o categoría)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente' })
  async crear(
    @Body() dto: CrearEventoDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<EventoDoc> {
    return this.eventosService.crearEvento(user, dto) as Promise<EventoDoc>
  }

  /** DELETE /api/eventos/:id - Eliminar evento (borrado lógico, solo creador o admin) */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar evento',
    description:
      'Borrado lógico: el evento queda inactivo (activo=false) y deja de aparecer en los listados. Solo el creador del evento o un admin pueden eliminarlo.',
  })
  @ApiParam({ name: 'id', description: 'ID del evento' })
  @ApiResponse({ status: 204, description: 'Evento eliminado (borrado lógico)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'No eres el creador del evento ni admin' })
  @ApiResponse({ status: 404, description: 'Evento no encontrado' })
  async eliminar(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ eliminado: boolean }> {
    return this.eventosService.eliminarEvento(id, user.id, user.rol)
  }
}