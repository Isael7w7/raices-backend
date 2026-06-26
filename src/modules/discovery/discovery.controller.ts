import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { DiscoveryService } from './discovery.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@Controller('discovery')
@UseGuards(JwtAuthGuard)
export class DiscoveryController {
  constructor(private readonly svc: DiscoveryService) {}

  @Get()
  discover(@Query() q: any, @CurrentUser() user: any) {
    return this.svc.discover(user.id, q)
  }
}
