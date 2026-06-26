import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common'
import { IsInt, IsString, IsOptional, Min, Max } from 'class-validator'
import { ReviewsService } from './reviews.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

class SubmitReviewDto {
  @IsInt() @Min(1) @Max(5) rating: number
  @IsOptional() @IsString() comment?: string
}

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly svc: ReviewsService) {}

  @Get('institution/:id')
  byInstitution(@Param('id') id: string) { return this.svc.findByInstitution(id) }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: any) { return this.svc.myReviews(user.id) }

  @Post('institution/:id')
  @UseGuards(JwtAuthGuard)
  submit(@Param('id') id: string, @Body() dto: SubmitReviewDto, @CurrentUser() user: any) {
    return this.svc.submit(user.id, id, dto.rating, dto.comment ?? '')
  }
}
