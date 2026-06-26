import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common'
import { InstitutionsService } from './institutions.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly svc: InstitutionsService) {}

  @Get()
  findAll(@Query() q: any) { return this.svc.findAll(q) }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.svc.findOne(id) }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() body: any, @CurrentUser() user: any) { return this.svc.create(body, user.id) }
}
