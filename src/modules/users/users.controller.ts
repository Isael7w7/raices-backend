import { Controller, Get, Put, Post, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { UsersService } from './users.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get('profile')
  profile(@CurrentUser() user: any) { return this.svc.getProfile(user.id) }

  @Put('profile')
  updateProfile(@CurrentUser() user: any, @Body() body: any) {
    return this.svc.updateProfile(user.id, body)
  }

  @Post('profiling')
  saveProfiling(@CurrentUser() user: any, @Body() body: any) {
    return this.svc.saveProfilingData(user.id, body)
  }

  @Get('dependents')
  dependents(@CurrentUser() user: any) { return this.svc.getDependents(user.id) }

  @Post('dependents')
  addDependent(@CurrentUser() user: any, @Body() body: any) {
    return this.svc.addDependent(user.id, body)
  }

  @Put('dependents/:id')
  updateDependent(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.updateDependent(user.id, id, body)
  }

  @Delete('dependents/:id')
  deleteDependent(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.deleteDependent(user.id, id)
  }
}
