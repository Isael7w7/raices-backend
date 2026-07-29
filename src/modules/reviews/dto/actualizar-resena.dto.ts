import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsString, IsOptional, Min, Max } from 'class-validator'
import { Type } from 'class-transformer'

export class ActualizarResenaDto {
  @ApiPropertyOptional({ description: 'Nueva calificación del 1 al 5', minimum: 1, maximum: 5, example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La calificación debe ser un número entero' })
  @Min(1, { message: 'La calificación no puede ser menor a 1' })
  @Max(5, { message: 'La calificación no puede ser mayor a 5' })
  calificacion?: number

  @ApiPropertyOptional({ description: 'Nuevo comentario', example: 'Actualización del comentario' })
  @IsOptional()
  @IsString({ message: 'El comentario debe ser un texto válido' })
  comentario?: string
}
