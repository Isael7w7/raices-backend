import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsOptional } from 'class-validator'

export class CrearPublicacionDto {
  @ApiProperty({ description: 'Contenido de la publicación', example: '¡Hola comunidad!' })
  @IsString() contenido!: string

  @ApiProperty({ description: 'ID del grupo (opcional)', required: false })
  @IsOptional() @IsString() grupoId?: string
}
