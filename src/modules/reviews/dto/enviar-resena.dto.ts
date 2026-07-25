import { ApiProperty } from '@nestjs/swagger'
import { IsInt, IsString, IsOptional, Min, Max } from 'class-validator'

export class EnviarResenaDto {
  @ApiProperty({ description: 'Calificación del 1 al 5', minimum: 1, maximum: 5, example: 4 })
  @IsInt() @Min(1) @Max(5) calificacion: number

  @ApiProperty({ description: 'Comentario opcional', required: false, example: 'Excelente servicio' })
  @IsOptional() @IsString() comentario?: string
}
