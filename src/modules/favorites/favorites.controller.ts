import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { FavoritesService } from './favorites.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('Favorites')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly svc: FavoritesService) {}

  @Get()
  @ApiOperation({ summary: 'Instituciones guardadas', description: 'Retorna las instituciones que el usuario ha marcado como favoritas con datos completos' })
  @ApiResponse({ status: 200, description: 'Lista de instituciones favoritas' })
  findAll(@CurrentUser() user: any) { return this.svc.findByUser(user.id) }

  @Get('ids')
  @ApiOperation({ summary: 'IDs de favoritos', description: 'Retorna solo los IDs de instituciones guardadas (respuesta ligera)' })
  @ApiResponse({ status: 200, description: 'Array de IDs' })
  getIds(@CurrentUser() user: any) { return this.svc.getFavoriteIds(user.id) }

  @Post(':institutionId/toggle')
  @ApiOperation({ summary: 'Agregar/quitar de favoritos', description: 'Alterna el estado de favorito. Si ya existe lo elimina, si no existe lo crea.' })
  @ApiParam({ name: 'institutionId', description: 'ID de la institución' })
  @ApiResponse({ status: 200, description: 'Estado actualizado: { favorited: boolean }' })
  toggle(@Param('institutionId') institutionId: string, @CurrentUser() user: any) {
    return this.svc.toggle(user.id, institutionId)
  }
}
