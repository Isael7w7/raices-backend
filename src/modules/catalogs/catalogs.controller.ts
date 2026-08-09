import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiOkResponse } from '@nestjs/swagger'
import { CatalogsService } from './catalogs.service'
import { CatalogoCompletoDto, EtapaVidaCatalogoDto, FeatureCatalogoDto, CategoriaCatalogoDto } from './dto/respuestas-catalogo.dto'
import { UseETag } from '../../common/decorators/use-etag.decorator'

@ApiTags('Catálogos')
@Controller('catalogos')
export class CatalogsController {
  constructor(private readonly svc: CatalogsService) {}

  @Get()
  @UseETag()
  @ApiOperation({ summary: 'Todos los catálogos', description: 'Retorna todos los catálogos de la plataforma en un solo objeto (parentescos, discapacidades, etapas de vida, features, categorías)' })
  @ApiOkResponse({ type: CatalogoCompletoDto, description: 'Objeto con todos los catálogos disponibles' })
  getAll() {
    return this.svc.getAll()
  }

  @Get('parentescos')
  @UseETag()
  @ApiOperation({ summary: 'Catálogo de parentescos', description: 'Lista de opciones de parentesco para dependientes' })
  @ApiOkResponse({ type: [String], description: 'Arreglo de parentescos disponibles', example: ['Hijo/a', 'Hermano/a', 'Nieto/a'] })
  parentescos() {
    return this.svc.getParentescos()
  }

  @Get('discapacidades')
  @UseETag()
  @ApiOperation({ summary: 'Catálogo de tipos de discapacidad', description: 'Lista de tipos de discapacidad disponibles en la plataforma' })
  @ApiOkResponse({ type: [String], description: 'Arreglo de discapacidades', example: ['Motriz', 'Visual', 'Auditiva'] })
  discapacidades() {
    return this.svc.getDiscapacidades()
  }

  @Get('etapas-vida')
  @UseETag()
  @ApiOperation({ summary: 'Catálogo de etapas de vida', description: 'Lista de etapas de vida con rangos de edad' })
  @ApiOkResponse({ type: [EtapaVidaCatalogoDto], description: 'Arreglo de etapas de vida' })
  etapasVida() {
    return this.svc.getEtapasVida()
  }

  @Get('features')
  @UseETag()
  @ApiOperation({ summary: 'Catálogo de funcionalidades (features)', description: 'Lista de funcionalidades disponibles para activar/desactivar en cuentas vinculadas' })
  @ApiOkResponse({ type: [FeatureCatalogoDto], description: 'Arreglo de features' })
  features() {
    return this.svc.getFeatures()
  }

  @Get('categorias')
  @UseETag()
  @ApiOperation({ summary: 'Catálogo de categorías de instituciones', description: 'Lista de categorías con identificador, etiqueta y color' })
  @ApiOkResponse({ type: [CategoriaCatalogoDto], description: 'Arreglo de categorías' })
  categorias() {
    return this.svc.getCategorias()
  }
}
