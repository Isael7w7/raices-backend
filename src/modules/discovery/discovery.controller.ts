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
  @ApiQuery({ name: 'categoria', required: false })
  @ApiQuery({ name: 'ciudad', required: false })
  @ApiQuery({ name: 'busqueda', required: false })
  @ApiQuery({ name: 'tipoDiscapacidad', required: false })
  @ApiResponse({ status: 200, description: 'Instituciones ordenadas por relevancia con coincidencia_perfil' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  discover(@Query() q: any, @CurrentUser() user: any) {
    return this.svc.discover(user.id, q)
  }
}
