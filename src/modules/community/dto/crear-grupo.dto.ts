import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsOptional, IsBoolean, MaxLength } from 'class-validator'
import { Transform } from 'class-transformer'
import { sanitizeHtml } from '../../../common/utils/sanitize-html'

export class CrearGrupoDto {
  @ApiProperty({ description: 'Nombre del grupo', example: 'Familias TEA Mérida' })
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString() @IsNotEmpty() @MaxLength(200, { message: 'El nombre no puede exceder 200 caracteres' }) nombre!: string

  @ApiPropertyOptional({ description: 'Descripción del grupo', example: 'Grupo de apoyo para familias con niños TEA' })
  @Transform(({ value }) => sanitizeHtml(value))
  @IsOptional() @IsString() @MaxLength(1000, { message: 'La descripción no puede exceder 1000 caracteres' }) descripcion?: string

  @ApiPropertyOptional({ description: 'El grupo es público o privado', default: true })
  @IsOptional() @IsBoolean() esPublico?: boolean

  @ApiPropertyOptional({ description: 'Si el grupo es exclusivo para padres/tutores', default: false })
  @IsOptional() @IsBoolean() exclusivoPadres?: boolean
}
