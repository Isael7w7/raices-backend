import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsOptional, IsArray, IsBoolean, IsIn } from 'class-validator'
import { Transform } from 'class-transformer'
import { sanitizeHtml } from '../../../common/utils/sanitize-html'

export class CrearForoDto {
  @ApiProperty({ description: 'Título del foro', example: 'Estrategias de inclusión laboral' })
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString() @IsNotEmpty() titulo!: string

  @ApiPropertyOptional({ description: 'Descripción del foro', example: 'Espacio para discutir estrategias de inclusión laboral para personas con discapacidad.' })
  @Transform(({ value }) => sanitizeHtml(value))
  @IsOptional() @IsString() descripcion?: string

  @ApiProperty({ description: 'Preguntas detonantes que guían la discusión', example: ['¿Qué estrategias han funcionado?', '¿Cuáles son las principales barreras?'], type: [String] })
  @IsArray() @IsString({ each: true }) @IsNotEmpty({ each: true })
  preguntasDetonantes!: string[]

  @ApiPropertyOptional({ description: 'Si el foro es exclusivo para padres/tutores', default: false })
  @IsOptional() @IsBoolean() exclusivoPadres?: boolean
}
