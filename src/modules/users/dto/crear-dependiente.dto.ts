import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsArray } from 'class-validator'

export class CrearDependienteDto {
  @ApiPropertyOptional({
    description: 'Nombre completo del dependiente',
    example: 'María García López',
  })
  @IsOptional()
  @IsString()
  nombreCompleto?: string

  @ApiPropertyOptional({
    description: 'Parentesco con el tutor',
    example: 'hijo',
  })
  @IsOptional()
  @IsString()
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
  @IsString()
  notas?: string
}
