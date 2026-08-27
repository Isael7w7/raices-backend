import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator'
import { Transform } from 'class-transformer'
import { sanitizeHtml } from '../../../common/utils/sanitize-html'

export class CrearGrupoDto {
  @ApiProperty({ description: 'Nombre del grupo', example: 'Familias TEA Mérida' })
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString() @IsNotEmpty() nombre!: string

  @ApiPropertyOptional({ description: 'Descripción del grupo', example: 'Grupo de apoyo para familias con niños TEA' })
  @Transform(({ value }) => sanitizeHtml(value))
  @IsOptional() @IsString() descripcion?: string

  @ApiPropertyOptional({ description: 'El grupo es público o privado', default: true })
  @IsOptional() @IsBoolean() esPublico?: boolean

  @ApiPropertyOptional({ description: 'Si el grupo es exclusivo para padres/tutores', default: false })
  @IsOptional() @IsBoolean() exclusivoPadres?: boolean
}
