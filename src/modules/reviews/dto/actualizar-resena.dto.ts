import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsString, IsOptional, Min, Max } from 'class-validator'

export class ActualizarResenaDto {
  @ApiPropertyOptional({ description: 'Nueva calificación del 1 al 5', minimum: 1, maximum: 5, example: 4 })
  @IsOptional() @IsInt() @Min(1) @Max(5) calificacion?: number

  @ApiPropertyOptional({ description: 'Nuevo comentario', example: 'Actualización del comentario' })
  @IsOptional() @IsString() comentario?: string
}
