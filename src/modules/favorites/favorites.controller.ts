import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiOkResponse, ApiCreatedResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { FavoritesService } from './favorites.service'
import { InstitucionDto } from '../institutions/dto/respuestas-institucion.dto'
import { RespuestaAlternarFavoritoDto } from './dto/respuestas-favorito.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { FeatureGuard } from '../../common/guards/feature.guard'
import { Feature } from '../../common/decorators/feature.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'

@ApiTags('Favoritos')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('favoritos')
export class FavoritesController {
  constructor(private readonly svc: FavoritesService) {}

  @Get()
  @ApiOperation({ summary: 'Instituciones guardadas', description: 'Retorna las instituciones que el usuario ha marcado como favoritas con datos completos' })
  @ApiOkResponse({ type: [InstitucionDto], description: 'Lista de instituciones favoritas' })
  findAll(@CurrentUser() user: CurrentUserPayload) { return this.svc.findByUser(user.id) }

  @Get('ids')
  @ApiOperation({ summary: 'IDs de favoritos', description: 'Retorna solo los IDs de instituciones guardadas (respuesta ligera)' })
  @ApiOkResponse({ type: [String], description: 'Arreglo de IDs' })
  getIds(@CurrentUser() user: CurrentUserPayload) { return this.svc.getFavoriteIds(user.id) }

  @Post(':institutionId/alternar')
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Feature('favoritos')
  @ApiOperation({ summary: 'Agregar/quitar de favoritos', description: 'Alterna el estado de favorito. Si ya existe lo elimina, si no existe lo crea.' })
  @ApiParam({ name: 'institutionId', description: 'ID de la institución' })
  @ApiCreatedResponse({ type: RespuestaAlternarFavoritoDto, description: 'Estado actualizado' })
  @ApiResponse({ status: 403, description: 'Funcionalidad de favoritos desactivada para tu cuenta' })
  toggle(@Param('institutionId') institutionId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.toggle(user.id, institutionId)
  }
}
