import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { IsInt, IsString, IsOptional, Min, Max } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { ReviewsService } from './reviews.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

export class EnviarResenaDto {
  @ApiProperty({ description: 'Calificacion del 1 al 5', minimum: 1, maximum: 5, example: 4 })
  @IsInt() @Min(1) @Max(5) calificacion: number
  @ApiProperty({ description: 'Comentario opcional', required: false, example: 'Excelente servicio' })
  @IsOptional() @IsString() comentario?: string
}

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly svc: ReviewsService) {}

  @Get('institution/:id')
  @ApiOperation({ summary: 'Resenas de una institucion' })
  @ApiParam({ name: 'id', description: 'ID de la institucion' })
  @ApiResponse({ status: 200, description: 'Lista de resenas con nombre y avatar del autor' })
  byInstitution(@Param('id') id: string) { return this.svc.findByInstitution(id) }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Mis resenas', description: 'Retorna las resenas del usuario autenticado con nombre de institucion' })
  @ApiResponse({ status: 200, description: 'Lista de resenas propias' })
  mine(@CurrentUser() user: any) { return this.svc.myReviews(user.id) }

  @Post('institution/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Crear o actualizar resena', description: 'Un usuario solo puede tener 1 resena por institucion (se actualiza si ya existe)' })
  @ApiParam({ name: 'id', description: 'ID de la institucion' })
  @ApiResponse({ status: 200, description: 'Resena guardada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  submit(@Param('id') id: string, @Body() dto: EnviarResenaDto, @CurrentUser() user: any) {
    return this.svc.submit(user.id, id, dto.calificacion, dto.comentario ?? '')
  }
}
