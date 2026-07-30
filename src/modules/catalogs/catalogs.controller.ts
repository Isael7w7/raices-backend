import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { CatalogsService } from './catalogs.service'

@ApiTags('Catálogos')
@Controller('catalogos')
export class CatalogsController {
  constructor(private readonly svc: CatalogsService) {}

  @Get('parentescos')
  @ApiOperation({ summary: 'Catálogo de parentescos', description: 'Lista de opciones de parentesco para dependientes' })
  @ApiResponse({ status: 200, description: 'Arreglo de parentescos disponibles', example: ['Hijo/a', 'Hermano/a', 'Nieto/a'] })
  parentescos() {
    return this.svc.getParentescos()
  }

  @Get('discapacidades')
  @ApiOperation({ summary: 'Catálogo de tipos de discapacidad', description: 'Lista de tipos de discapacidad disponibles en la plataforma' })
  @ApiResponse({ status: 200, description: 'Arreglo de discapacidades', example: ['Motriz', 'Visual', 'Auditiva'] })
  discapacidades() {
    return this.svc.getDiscapacidades()
  }

  @Get('etapas-vida')
  @ApiOperation({ summary: 'Catálogo de etapas de vida', description: 'Lista de etapas de vida con rangos de edad' })
  @ApiResponse({ status: 200, description: 'Arreglo de etapas de vida', example: [{ id: 'infancia', label: 'Infancia (0-12)' }] })
  etapasVida() {
    return this.svc.getEtapasVida()
  }

  @Get('features')
  @ApiOperation({ summary: 'Catálogo de funcionalidades (features)', description: 'Lista de funcionalidades disponibles para activar/desactivar en cuentas vinculadas' })
  @ApiResponse({ status: 200, description: 'Arreglo de features', example: [{ id: 'instituciones', label: 'Instituciones', description: 'Explorar y buscar instituciones' }] })
  features() {
    return this.svc.getFeatures()
  }

  @Get('categorias')
  @ApiOperation({ summary: 'Catálogo de categorías de instituciones', description: 'Lista de categorías con identificador, etiqueta y color' })
  @ApiResponse({ status: 200, description: 'Arreglo de categorías', example: [{ id: 'funcional', label: 'Funcional', color: '#01ADFF' }] })
  categorias() {
    return this.svc.getCategorias()
  }
}
