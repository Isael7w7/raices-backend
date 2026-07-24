import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CrearDependienteDto {
  @ApiPropertyOptional({
    description: 'Nombre completo del dependiente',
    example: 'María García López',
  })
  nombreCompleto?: string

  @ApiPropertyOptional({
    description: 'Parentesco con el tutor',
    example: 'hijo',
  })
  parentesco?: string

  @ApiPropertyOptional({
    description: 'Tipos de discapacidad del dependiente',
    example: ['tea', 'motriz'],
    type: [String],
  })
  tiposDiscapacidad?: string[]

  @ApiPropertyOptional({
    description: 'Rango de edad del dependiente',
    example: '6-12',
  })
  rangoEdad?: string

  @ApiPropertyOptional({
    description: 'Etapa de vida del dependiente',
    example: 'infancia',
  })
  etapaVida?: string

  @ApiPropertyOptional({
    description: 'Notas adicionales sobre el dependiente',
    example: 'Requiere acompañamiento en terapias',
  })
  notas?: string
}
