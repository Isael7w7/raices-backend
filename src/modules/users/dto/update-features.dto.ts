import { IsOptional, IsBoolean } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class UpdateFeaturesDto {
  @ApiPropertyOptional({ description: 'Permitir chat/mensajería directa', example: true })
  @IsOptional() @IsBoolean() chat?: boolean

  @ApiPropertyOptional({ description: 'Permitir postularse a vacantes', example: true })
  @IsOptional() @IsBoolean() postulaciones?: boolean

  @ApiPropertyOptional({ description: 'Permitir participar en comunidad (publicaciones, comentarios, me gusta)', example: true })
  @IsOptional() @IsBoolean() comunidad?: boolean

  @ApiPropertyOptional({ description: 'Permitir escribir reseñas', example: true })
  @IsOptional() @IsBoolean() resenas?: boolean

  @ApiPropertyOptional({ description: 'Permitir usar descubrimiento de instituciones', example: true })
  @IsOptional() @IsBoolean() descubrimiento?: boolean

  @ApiPropertyOptional({ description: 'Permitir guardar instituciones como favoritas', example: true })
  @IsOptional() @IsBoolean() favoritos?: boolean
}
