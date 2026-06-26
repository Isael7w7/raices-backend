import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common'
import { IsOptional, IsString } from 'class-validator'
import { JobsService } from './jobs.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

class ApplyDto {
  @IsOptional() @IsString() cover_letter?: string
}

@Controller('jobs')
export class JobsController {
  constructor(private readonly svc: JobsService) {}

  @Get()
  findAll(@Query('city') city?: string, @Query('modality') modality?: string) {
    return this.svc.findAll({ city, modality })
  }

  @Get('applied')
  @UseGuards(JwtAuthGuard)
  appliedIds(@CurrentUser() user: any) {
    return this.svc.getAppliedJobIds(user.id)
  }

  @Get('my-applications')
  @UseGuards(JwtAuthGuard)
  myApplications(@CurrentUser() user: any) {
    return this.svc.myApplications(user.id)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id)
  }

  @Post(':id/apply')
  @UseGuards(JwtAuthGuard)
  apply(@Param('id') id: string, @Body() dto: ApplyDto, @CurrentUser() user: any) {
    return this.svc.apply(user.id, id, dto.cover_letter ?? '')
  }
}
