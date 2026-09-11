import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsArray, MaxLength, Matches } from 'class-validator'
import { Transform } from 'class-transformer'
import { sanitizeHtml } from '../../../common/utils/sanitize-html'

export class CrearDependienteDto {
  @ApiPropertyOptional({
    description: 'Nombre completo del dependiente',
    example: 'María García López',
  })
  @IsOptional()
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString()
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres' })
  @Matches(/^[a-zA-ZáéíóúñüÁÉÍÓÚÑÜ\s'-]*$/, { message: 'El nombre solo puede contener letras, espacios, guiones y apóstrofes' })
  nombreCompleto?: string

  @ApiPropertyOptional({
    description: 'Parentesco con el tutor',
    example: 'hijo',
  })
  @IsOptional()
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString()
  @MaxLength(50, { message: 'El parentesco no puede exceder 50 caracteres' })
  parentesco?: string

  @ApiPropertyOptional({
    description: 'Tipos de discapacidad del dependiente',
    example: ['tea', 'motriz'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tiposDiscapacidad?: string[]

  @ApiPropertyOptional({
    description: 'Rango de edad del dependiente',
    example: '6-12',
  })
  @IsOptional()
  @IsString()
  rangoEdad?: string

  @ApiPropertyOptional({
    description: 'Etapa de vida del dependiente',
    example: 'infancia',
  })
  @IsOptional()
  @IsString()
  etapaVida?: string

  @ApiPropertyOptional({
    description: 'Notas adicionales sobre el dependiente',
    example: 'Requiere acompañamiento en terapias',
  })
  @IsOptional()
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString()
  @MaxLength(500, { message: 'Las notas no pueden exceder 500 caracteres' })
  notas?: string
}
