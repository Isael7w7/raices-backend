import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator'

export class CrearGrupoDto {
  @ApiProperty({ description: 'Nombre del grupo', example: 'Familias TEA Mérida' })
  @IsString() @IsNotEmpty() nombre: string

  @ApiPropertyOptional({ description: 'Descripción del grupo', example: 'Grupo de apoyo para familias con niños TEA' })
  @IsOptional() @IsString() descripcion?: string

  @ApiPropertyOptional({ description: 'El grupo es público o privado', default: true })
  @IsOptional() @IsBoolean() esPublico?: boolean
}
