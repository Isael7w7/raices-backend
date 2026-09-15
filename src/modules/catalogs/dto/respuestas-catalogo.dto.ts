import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class EtapaVidaCatalogoDto {
  @ApiProperty({ example: 'infancia' }) id!: string
  @ApiProperty({ example: 'Infancia (0-12)' }) label!: string
}

export class FeatureCatalogoDto {
  @ApiProperty({ example: 'chat' }) id!: string
  @ApiProperty({ example: 'Chat' }) label!: string
  @ApiProperty({ example: 'Enviar y recibir mensajes' }) description!: string
}

export class CategoriaCatalogoDto {
  @ApiProperty({ example: 'funcional' }) id!: string
  @ApiProperty({ example: 'Funcional' }) label!: string
  @ApiProperty({ example: '#01ADFF' }) color!: string
}

export class AreaInteresSubDto {
  @ApiProperty({ example: 'basica' }) id!: string
  @ApiProperty({ example: 'Básica' }) label!: string
  @ApiProperty({ example: 'Educación primaria/secundaria' }) description!: string
}

export class AreaInteresDto {
  @ApiProperty({ example: 'educacion' }) id!: string
  @ApiProperty({ example: 'Educación' }) label!: string
  @ApiPropertyOptional({ type: [AreaInteresSubDto] }) subcategorias?: AreaInteresSubDto[]
}

export class SubcategoriaComunidadDto {
  @ApiProperty({ example: 'por_tema' }) id!: string
  @ApiProperty({ example: 'Por tema' }) label!: string
  @ApiProperty({ type: [FeatureCatalogoDto] }) subcategorias!: FeatureCatalogoDto[]
}

export class CatalogoCompletoDto {
  @ApiProperty({ example: ['Hijo/a', 'Hermano/a'], type: [String] }) parentescos!: string[]
  @ApiProperty({ example: ['Motriz', 'Visual'], type: [String] }) discapacidades!: string[]
  @ApiProperty({ type: [EtapaVidaCatalogoDto] }) etapasVida!: EtapaVidaCatalogoDto[]
  @ApiProperty({ type: [EtapaVidaCatalogoDto] }) temporalidadOrigen!: EtapaVidaCatalogoDto[]
  @ApiProperty({ type: [FeatureCatalogoDto] }) preferenciaFormato!: FeatureCatalogoDto[]
  @ApiProperty({ type: [AreaInteresDto] }) areasInteres!: AreaInteresDto[]
  @ApiProperty({ type: [FeatureCatalogoDto] }) viabilidadEconomica!: FeatureCatalogoDto[]
  @ApiProperty({ type: [SubcategoriaComunidadDto] }) subcategoriasComunidad!: SubcategoriaComunidadDto[]
  @ApiProperty({ type: [FeatureCatalogoDto] }) tonoContextual!: FeatureCatalogoDto[]
  @ApiProperty({ type: [FeatureCatalogoDto] }) features!: FeatureCatalogoDto[]
  @ApiProperty({ type: [CategoriaCatalogoDto] }) categorias!: CategoriaCatalogoDto[]
}
