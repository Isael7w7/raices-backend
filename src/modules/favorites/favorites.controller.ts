import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common'
import { FavoritesService } from './favorites.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@Controller('favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private readonly svc: FavoritesService) {}

  @Get()
  findAll(@CurrentUser() user: any) { return this.svc.findByUser(user.id) }

  @Get('ids')
  getIds(@CurrentUser() user: any) { return this.svc.getFavoriteIds(user.id) }

  @Post(':institutionId/toggle')
  toggle(@Param('institutionId') institutionId: string, @CurrentUser() user: any) {
    return this.svc.toggle(user.id, institutionId)
  }
}
