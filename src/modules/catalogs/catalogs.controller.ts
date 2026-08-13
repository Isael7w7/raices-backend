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

  // ═══════════════════════════════════════════════════════════════════
  // Catálogos requeridos por Spec MVP Raíces
  // ═══════════════════════════════════════════════════════════════════

  @Get('temporalidad-origen')
  @UseETag()
  @ApiOperation({ summary: 'Catálogo de temporalidad/origen de la condición', description: 'Lista de opciones de origen/temporalidad de la discapacidad' })
  @ApiOkResponse({ type: [EtapaVidaCatalogoDto], description: 'Arreglo de temporalidades' })
  temporalidadOrigen() {
    return this.svc.getTemporalidadOrigen()
  }

  @Get('preferencia-formato')
  @UseETag()
  @ApiOperation({ summary: 'Catálogo de preferencia de formato', description: 'Lista de formatos de contenido preferidos' })
  @ApiOkResponse({ type: [FeatureCatalogoDto], description: 'Arreglo de formatos' })
  preferenciaFormato() {
    return this.svc.getPreferenciaFormato()
  }

  @Get('areas-interes')
  @UseETag()
  @ApiOperation({ summary: 'Catálogo de áreas de interés', description: 'Lista de áreas de interés del usuario con subcategorías (Educación, Comunidad, Empleo, etc.)' })
  @ApiOkResponse({ description: 'Arreglo de áreas de interés con subcategorías' })
  areasInteres() {
    return this.svc.getAreasInteres()
  }

  @Get('viabilidad-economica')
  @UseETag()
  @ApiOperation({ summary: 'Catálogo de viabilidad económica', description: 'Lista de opciones de viabilidad económica' })
  @ApiOkResponse({ type: [FeatureCatalogoDto], description: 'Arreglo de viabilidades económicas' })
  viabilidadEconomica() {
    return this.svc.getViabilidadEconomica()
  }

  @Get('subcategorias-comunidad')
  @UseETag()
  @ApiOperation({ summary: 'Subcategorías de comunidad', description: 'Subcategorías de grupos de comunidad: por tema, etapa de vida, condición, familias, intereses' })
  @ApiOkResponse({ description: 'Arreglo de subcategorías de comunidad' })
  subcategoriasComunidad() {
    return this.svc.getSubcategoriasComunidad()
  }

  @Get('tono-contextual')
  @UseETag()
  @ApiOperation({ summary: 'Tono contextual', description: 'Opciones de tono contextual de la plataforma' })
  @ApiOkResponse({ type: [FeatureCatalogoDto], description: 'Arreglo de tonos contextuales' })
  tonoContextual() {
    return this.svc.getTonoContextual()
  }
}
