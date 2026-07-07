import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { DiscoveryService } from './discovery.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('Discovery')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly svc: DiscoveryService) {}

  @Get()
  @ApiOperation({ summary: 'Búsqueda inteligente de instituciones', description: 'Cruza el perfil del usuario con las instituciones y ordena por coincidencia de discapacidad' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'disability_type', required: false })
  @ApiResponse({ status: 200, description: 'Instituciones ordenadas por relevancia con profile_match' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  discover(@Query() q: any, @CurrentUser() user: any) {
    return this.svc.discover(user.id, q)
  }
}
