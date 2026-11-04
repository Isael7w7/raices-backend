import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

/** Categoría por defecto para los insultos/modismos locales agregados por la administración. */
export const CATEGORIA_PALABRA_PROHIBIDA_POR_DEFECTO = 'insulto_local'

/** Recorta y colapsa espacios: el servicio normaliza además mayúsculas y acentos. */
function normalizarTexto(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value
}

/**
 * Alta de una palabra prohibida / modismo local desde el panel de
 * administración. La palabra se persiste normalizada (minúsculas, sin
 * acentos) para que la moderación y la validación de duplicados coincidan.
 */
export class CrearPalabraProhibidaDto {
  @ApiProperty({
    description: 'Palabra o modismo local que la moderación debe rechazar',
    example: 'chaneque',
    maxLength: 50,
  })
  @Transform(({ value }) => normalizarTexto(value))
  @IsString({ message: 'La palabra debe ser un texto' })
  @IsNotEmpty({ message: 'La palabra es obligatoria' })
  @MaxLength(50, { message: 'La palabra no puede exceder 50 caracteres' })
  palabra!: string

  @ApiPropertyOptional({
    description: 'Categoría del término prohibido',
    example: CATEGORIA_PALABRA_PROHIBIDA_POR_DEFECTO,
    default: CATEGORIA_PALABRA_PROHIBIDA_POR_DEFECTO,
    maxLength: 50,
  })
  @Transform(({ value }) => normalizarTexto(value))
  @IsOptional()
  @IsString({ message: 'La categoría debe ser un texto' })
  @MaxLength(50, { message: 'La categoría no puede exceder 50 caracteres' })
  categoria: string = CATEGORIA_PALABRA_PROHIBIDA_POR_DEFECTO
}
