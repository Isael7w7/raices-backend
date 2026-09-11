import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsOptional, IsBoolean, IsArray, MaxLength } from 'class-validator'
import { Transform } from 'class-transformer'
import { sanitizeHtml } from '../../../common/utils/sanitize-html'

export class ActualizarVacanteDto {
  @ApiPropertyOptional({ description: 'Título de la vacante', example: 'Terapeuta Ocupacional' })
  @IsOptional() @Transform(({ value }) => sanitizeHtml(value)) @IsString() @MaxLength(200, { message: 'El título no puede exceder 200 caracteres' }) titulo?: string

  @ApiPropertyOptional({ description: 'Descripción detallada de la vacante' })
  @IsOptional() @Transform(({ value }) => sanitizeHtml(value)) @IsString() @MaxLength(2000, { message: 'La descripción no puede exceder 2000 caracteres' }) descripcion?: string

  @ApiPropertyOptional({ description: 'Requisitos del puesto' })
  @IsOptional() @Transform(({ value }) => sanitizeHtml(value)) @IsString() @MaxLength(1000, { message: 'Los requisitos no pueden exceder 1000 caracteres' }) requisitos?: string

  @ApiPropertyOptional({ description: 'Modalidad de trabajo', enum: ['presencial', 'remoto', 'híbrido'] })
  @IsOptional() @IsString() modalidad?: string

  @ApiPropertyOptional({ description: 'Horario laboral' })
  @IsOptional() @IsString() horario?: string

  @ApiPropertyOptional({ description: 'Rango salarial' })
  @IsOptional() @IsString() rangoSalario?: string

  @ApiPropertyOptional({ description: 'Ciudad de la vacante' })
  @IsOptional() @IsString() ciudad?: string

  @ApiPropertyOptional({ description: 'Estado/provincia' })
  @IsOptional() @IsString() estado?: string

  @ApiPropertyOptional({ description: 'Vacante inclusiva para discapacidad' })
  @IsOptional() @IsBoolean() inclusivaDiscapacidad?: boolean

  @ApiPropertyOptional({ description: 'Tipos de discapacidad que la vacante apoya', type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true }) tiposDiscapacidad?: string[]

  @ApiPropertyOptional({ description: 'Vacante activa o desactivada' })
  @IsOptional() @IsBoolean() activa?: boolean
}
