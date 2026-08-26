import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator'

/** Tipos de interacción soportados (cada uno con un peso distinto) */
export const TIPOS_INTERACCION = ['guardar', 'ver_detalle', 'click_card'] as const
export type TipoInteraccion = (typeof TIPOS_INTERACCION)[number]

/** Categorías válidas de institución (mismo enum que registro/instituciones) */
export const CATEGORIAS_INSTITUCION = ['funcional', 'educativo', 'laboral', 'social'] as const
export type CategoriaInstitucion = (typeof CATEGORIAS_INSTITUCION)[number]

export class RegistrarInteraccionDto {
  @ApiProperty({ description: 'ID de la institución con la que se interactuó', example: 'inst-abc123' })
  @IsString()
  @IsNotEmpty()
  institucionId!: string

  @ApiProperty({
    description: 'Tipo de interacción realizada',
    enum: TIPOS_INTERACCION,
    example: 'ver_detalle',
  })
  @IsIn(TIPOS_INTERACCION)
  tipo!: TipoInteraccion

  @ApiPropertyOptional({
    description: 'Categoría de la institución (opcional; se usa para agrupar los pesos)',
    enum: CATEGORIAS_INSTITUCION,
    example: 'laboral',
  })
  @IsOptional()
  @IsIn(CATEGORIAS_INSTITUCION)
  categoria?: CategoriaInstitucion
}
