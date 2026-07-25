import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsOptional, IsBoolean, IsArray } from 'class-validator'

export class ActualizarVacanteDto {
  @ApiPropertyOptional({ description: 'Título de la vacante', example: 'Terapeuta Ocupacional' })
  @IsOptional() @IsString() titulo?: string

  @ApiPropertyOptional({ description: 'Descripción detallada de la vacante' })
  @IsOptional() @IsString() descripcion?: string

  @ApiPropertyOptional({ description: 'Requisitos del puesto' })
  @IsOptional() @IsString() requisitos?: string

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
