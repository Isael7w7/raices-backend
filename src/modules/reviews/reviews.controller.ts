import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { ReviewsService } from './reviews.service'
import { EnviarResenaDto } from './dto/enviar-resena.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'

@ApiTags('Reseñas')
@Controller('resenas')
export class ReviewsController {
  constructor(private readonly svc: ReviewsService) {}

  @Get('institucion/:id')
  @ApiOperation({ summary: 'Reseñas de una institución' })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiResponse({ status: 200, description: 'Lista de reseñas con nombre y avatar del autor' })
  byInstitution(@Param('id') id: string) { return this.svc.findByInstitution(id) }

  @Get('mias')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Mis reseñas', description: 'Retorna las reseñas del usuario autenticado con nombre de institución' })
  @ApiResponse({ status: 200, description: 'Lista de reseñas propias' })
  mine(@CurrentUser() user: CurrentUserPayload) { return this.svc.myReviews(user.id) }

  @Post('institucion/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Crear o actualizar reseña', description: 'Un usuario solo puede tener 1 reseña por institución (se actualiza si ya existe)' })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiResponse({ status: 200, description: 'Reseña guardada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  submit(@Param('id') id: string, @Body() dto: EnviarResenaDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.submit(user.id, id, dto.calificacion, dto.comentario ?? '')
  }
}
