import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { IsInt, IsString, IsOptional, Min, Max } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { ReviewsService } from './reviews.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

export class SubmitReviewDto {
  @ApiProperty({ description: 'Calificación del 1 al 5', minimum: 1, maximum: 5, example: 4 })
  @IsInt() @Min(1) @Max(5) rating: number
  @ApiProperty({ description: 'Comentario opcional', required: false, example: 'Excelente servicio' })
  @IsOptional() @IsString() comment?: string
}

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly svc: ReviewsService) {}

  @Get('institution/:id')
  @ApiOperation({ summary: 'Reseñas de una institución' })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiResponse({ status: 200, description: 'Lista de reseñas con nombre y avatar del autor' })
  byInstitution(@Param('id') id: string) { return this.svc.findByInstitution(id) }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Mis reseñas', description: 'Retorna las reseñas del usuario autenticado con nombre de institución' })
  @ApiResponse({ status: 200, description: 'Lista de reseñas propias' })
  mine(@CurrentUser() user: any) { return this.svc.myReviews(user.id) }

  @Post('institution/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Crear o actualizar reseña', description: 'Un usuario solo puede tener 1 reseña por institución (se actualiza si ya existe)' })
  @ApiParam({ name: 'id', description: 'ID de la institución' })
  @ApiResponse({ status: 200, description: 'Reseña guardada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  submit(@Param('id') id: string, @Body() dto: SubmitReviewDto, @CurrentUser() user: any) {
    return this.svc.submit(user.id, id, dto.rating, dto.comment ?? '')
  }
}
