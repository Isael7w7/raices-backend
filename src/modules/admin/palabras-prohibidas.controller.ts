import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { CrearPalabraProhibidaDto } from './dto/crear-palabra-prohibida.dto'
import { ListarPalabrasProhibidasDto } from './dto/listar-palabras-prohibidas.dto'
import { PalabraProhibidaDto } from './dto/palabra-prohibida.dto'
import { PalabrasProhibidasService } from './palabras-prohibidas.service'

@ApiTags('Administración')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/palabras-prohibidas')
export class PalabrasProhibidasController {
  constructor(private readonly svc: PalabrasProhibidasService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar palabras prohibidas',
    description:
      'Devuelve la lista de insultos locales / modismos prohibidos cargada en memoria. ' +
      'Acepta filtros opcionales (buscar, categoria, activa) que se combinan entre sí.',
  })
  @ApiQuery({ name: 'buscar', required: false, description: 'Texto a buscar en la palabra o en la categoría (sin distinguir mayúsculas ni acentos)', example: 'pendej' })
  @ApiQuery({ name: 'categoria', required: false, description: 'Categoría exacta del término', example: 'groseria' })
  @ApiQuery({ name: 'activa', required: false, type: Boolean, description: 'true solo activas, false solo desactivadas' })
  @ApiOkResponse({ type: [PalabraProhibidaDto], description: 'Lista de palabras prohibidas que cumplen los filtros' })
  @ApiResponse({ status: 400, description: 'Filtro inválido (por ejemplo activa que no es booleano)' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (se requiere admin)' })
  todas(@Query() filtros: ListarPalabrasProhibidasDto) {
    return this.svc.buscar(filtros)
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Agregar palabra prohibida',
    description: 'Normaliza la palabra (minúsculas, sin acentos), rechaza duplicados y la agrega a la lista de moderación.',
  })
  @ApiBody({ type: CrearPalabraProhibidaDto })
  @ApiCreatedResponse({ type: PalabraProhibidaDto, description: 'Palabra agregada' })
  @ApiResponse({ status: 400, description: 'La palabra está vacía' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (se requiere admin)' })
  @ApiResponse({ status: 409, description: 'La palabra ya está registrada' })
  agregar(@Body() dto: CrearPalabraProhibidaDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.agregar(dto, user.id)
  }

  @Delete(':id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar palabra prohibida', description: 'Elimina la palabra de Firestore y del caché de moderación.' })
  @ApiParam({ name: 'id', description: 'ID del documento de la palabra prohibida' })
  @ApiNoContentResponse({ description: 'Palabra eliminada' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (se requiere admin)' })
  @ApiResponse({ status: 404, description: 'Palabra prohibida no encontrada' })
  eliminar(@Param('id') id: string): Promise<void> {
    return this.svc.eliminar(id)
  }
}
