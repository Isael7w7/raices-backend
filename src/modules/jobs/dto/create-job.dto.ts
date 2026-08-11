import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsArray } from 'class-validator'
import { Transform } from 'class-transformer'
import { sanitizeHtml } from '../../../common/utils/sanitize-html'

export class CreateJobDto {
  @ApiProperty({ description: 'Título de la vacante', example: 'Terapeuta Ocupacional' })
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString() @IsNotEmpty() titulo!: string

  @ApiProperty({ description: 'Descripción detallada de la vacante', required: false, example: 'Buscamos terapeuta ocupacional para atención a niños con TEA...' })
  @Transform(({ value }) => sanitizeHtml(value))
  @IsOptional() @IsString() descripcion?: string

  @ApiProperty({ description: 'Requisitos del puesto', required: false, example: 'Título en terapia ocupacional, experiencia mínima de 2 años' })
  @Transform(({ value }) => sanitizeHtml(value))
  @IsOptional() @IsString() requisitos?: string

  @ApiProperty({ description: 'Modalidad de trabajo', required: false, example: 'presencial', enum: ['presencial', 'remoto', 'híbrido'] })
  @IsOptional() @IsString() modalidad?: string

  @ApiProperty({ description: 'Horario laboral', required: false, example: 'Lunes a viernes 8:00 - 15:00' })
  @IsOptional() @IsString() horario?: string

  @ApiProperty({ description: 'Rango salarial', required: false, example: '$15,000 - $20,000 MXN' })
  @IsOptional() @IsString() rangoSalario?: string

  @ApiProperty({ description: 'Ciudad de la vacante', required: false, example: 'Mérida' })
  @IsOptional() @IsString() ciudad?: string

  @ApiProperty({ description: 'Estado/provincia', required: false, example: 'Yucatán' })
  @IsOptional() @IsString() estado?: string

  @ApiProperty({ description: 'Vacante inclusiva para discapacidad', required: false, default: true })
  @IsOptional() @IsBoolean() inclusivaDiscapacidad?: boolean

  @ApiProperty({ description: 'Tipos de discapacidad que la vacante apoya', required: false, example: ['tea', 'motriz'], type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true }) tiposDiscapacidad?: string[]

  @ApiProperty({ description: 'ID de la institución (solo admin)', required: false })
  @IsOptional() @IsString() institucionId?: string
}
