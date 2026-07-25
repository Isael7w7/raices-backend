import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, HttpCode } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger'
import { ReviewsService } from './reviews.service'
import { EnviarResenaDto } from './dto/enviar-resena.dto'
import { ActualizarResenaDto } from './dto/actualizar-resena.dto'
import { PaginacionDto } from '../../common/dto/paginacion.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'

@ApiTags('Reseñas')
@Controller('resenas')
export class ReviewsController {
  constructor(private readonly svc: ReviewsService) {}

  @Get('institucion/:id')
  @ApiOperation({ summary: 'Reseñas de una institución', description: 'Retorna reseñas con paginación' })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', example: 1 })
  @ApiQuery({ name: 'limite', required: false, description: 'Elementos por página', example: 20 })
  @ApiResponse({ status: 200, description: 'Lista paginada de reseñas con nombre y avatar del autor' })
  byInstitution(@Param('id') id: string, @Query() paginacion: PaginacionDto) { return this.svc.findByInstitution(id, paginacion.pagina, paginacion.limite) }

  @Get('mias')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Mis reseñas', description: 'Retorna las reseñas del usuario con paginación' })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', example: 1 })
  @ApiQuery({ name: 'limite', required: false, description: 'Elementos por página', example: 20 })
  @ApiResponse({ status: 200, description: 'Lista paginada de reseñas propias' })
  mine(@CurrentUser() user: CurrentUserPayload, @Query() paginacion: PaginacionDto) { return this.svc.myReviews(user.id, paginacion.pagina, paginacion.limite) }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Editar reseña', description: 'Actualiza calificación y/o comentario. Solo el autor. Recalcula promedio.' })
  @ApiParam({ name: 'id', description: 'ID de la reseña' })
  @ApiResponse({ status: 200, description: 'Reseña actualizada' })
  @ApiResponse({ status: 403, description: 'No eres el autor' })
  @ApiResponse({ status: 404, description: 'Reseña no encontrada' })
  update(@Param('id') id: string, @Body() dto: ActualizarResenaDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.update(id, user.id, dto)
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar reseña', description: 'Elimina la reseña y recalcula promedio. Solo el autor.' })
  @ApiParam({ name: 'id', description: 'ID de la reseña' })
  @ApiResponse({ status: 204, description: 'Reseña eliminada' })
  @ApiResponse({ status: 403, description: 'No eres el autor' })
  @ApiResponse({ status: 404, description: 'Reseña no encontrada' })
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.remove(id, user.id)
  }

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
