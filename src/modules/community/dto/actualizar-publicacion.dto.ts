import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsNotEmpty } from 'class-validator'

export class ActualizarPublicacionDto {
  @ApiProperty({ description: 'Nuevo contenido de la publicación', example: 'Contenido actualizado' })
  @IsString() @IsNotEmpty() contenido: string
}
