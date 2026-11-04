import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * Query de `GET /api/admin/palabras-prohibidas`.
 *
 * Todos los filtros son opcionales y se combinan con AND. Sin filtros se
 * devuelve la lista completa (activas e inactivas), igual que antes.
 */
export class ListarPalabrasProhibidasDto {
  @ApiPropertyOptional({
    description: 'Busca el término dentro de la palabra o de la categoría (sin distinguir mayúsculas ni acentos)',
    example: 'pendej',
    maxLength: 50,
  })
  @IsOptional()
  @IsString({ message: 'buscar debe ser un texto' })
  @MaxLength(50, { message: 'buscar no puede exceder 50 caracteres' })
  buscar?: string

  @ApiPropertyOptional({
    description: 'Filtra por categoría exacta del término',
    example: 'groseria',
    maxLength: 50,
  })
  @IsOptional()
  @IsString({ message: 'categoria debe ser un texto' })
  @MaxLength(50, { message: 'categoria no puede exceder 50 caracteres' })
  categoria?: string

  @ApiPropertyOptional({
    description: 'Filtra por estado: true solo activas, false solo desactivadas',
    example: true,
    type: 'boolean',
  })
  @IsOptional()
  // Los query params llegan como cadenas ("true"/"false"); sin esta
  // transformación explícita IsBoolean rechaza la petición con 400.
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean({ message: 'activa debe ser un booleano' })
  activa?: boolean
}
