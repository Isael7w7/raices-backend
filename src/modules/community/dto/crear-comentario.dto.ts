import { ApiProperty } from '@nestjs/swagger'
import { IsString } from 'class-validator'

export class CrearComentarioDto {
  @ApiProperty({ description: 'Contenido del comentario', example: '¡Gran aporte!' })
  @IsString() contenido!: string
}
