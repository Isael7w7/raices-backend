import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiOkResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { DiscoveryService } from './discovery.service'
import { InstitucionRelevanteDto } from './dto/respuestas-descubrimiento.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { UseETag } from '../../common/decorators/use-etag.decorator'

@ApiTags('Descubrimiento')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('descubrimiento')
export class DiscoveryController {
  constructor(private readonly svc: DiscoveryService) {}

  @Get()
  @UseETag()
  @ApiOperation({ summary: 'Búsqueda inteligente de instituciones', description: 'Cruza el perfil del usuario con las instituciones y ordena por coincidencia de discapacidad' })
  @ApiQuery({ name: 'categoria', required: false })
  @ApiQuery({ name: 'ciudad', required: false })
  @ApiQuery({ name: 'busqueda', required: false })
  @ApiQuery({ name: 'tipoDiscapacidad', required: false })
  @ApiOkResponse({ type: [InstitucionRelevanteDto], description: 'Instituciones ordenadas por relevancia con coincidePerfil' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  discover(@Query() q: Record<string, string | string[]>, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.discover(user.id, q)
  }
}
