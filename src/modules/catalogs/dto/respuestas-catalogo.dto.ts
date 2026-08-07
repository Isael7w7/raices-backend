import { ApiProperty } from '@nestjs/swagger'

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

export class CatalogoCompletoDto {
  @ApiProperty({ example: ['Hijo/a', 'Hermano/a'], type: [String] }) parentescos!: string[]
  @ApiProperty({ example: ['Motriz', 'Visual'], type: [String] }) discapacidades!: string[]
  @ApiProperty({ type: [EtapaVidaCatalogoDto] }) etapasVida!: EtapaVidaCatalogoDto[]
  @ApiProperty({ type: [FeatureCatalogoDto] }) features!: FeatureCatalogoDto[]
  @ApiProperty({ type: [CategoriaCatalogoDto] }) categorias!: CategoriaCatalogoDto[]
}
