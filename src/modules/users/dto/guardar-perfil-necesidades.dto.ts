import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class GuardarPerfilNecesidadesDto {
  @ApiProperty({
    description: 'Tipos de discapacidad del usuario',
    example: ['tea', 'motriz', 'visual'],
    type: [String],
  })
  tiposDiscapacidad?: string[]

  @ApiPropertyOptional({
    description: 'Nivel de severidad de la discapacidad',
    example: 'moderado',
  })
  severidadDiscapacidad?: string

  @ApiProperty({
    description: 'Modos de comunicación que utiliza',
    example: ['lenguaje_señas', 'aac', 'verbal'],
    type: [String],
  })
  modosComunicacion?: string[]

  @ApiProperty({
    description: 'Necesidades de movilidad',
    example: ['silla_ruedas', 'andador'],
    type: [String],
  })
  necesidadesMovilidad?: string[]

  @ApiProperty({
    description: 'Acceso a tecnología',
    example: ['tablet', 'computadora', 'smartphone'],
    type: [String],
  })
  accesoTecnologia?: string[]

  @ApiProperty({
    description: 'Zonas o áreas preferidas para atención',
    example: ['centro', 'norte', 'sur'],
    type: [String],
  })
  zonasPreferidas?: string[]

  @ApiProperty({
    description: 'Necesidades específicas del usuario',
    example: ['comunicacion', 'movilidad', 'educacion'],
    type: [String],
  })
  necesidades?: string[]

  @ApiProperty({
    description: 'Metas actuales del usuario',
    example: ['mejorar_comunicacion', 'independencia_movilidad'],
    type: [String],
  })
  metasActuales?: string[]

  @ApiProperty({
    description: 'Áreas de apoyo requeridas',
    example: ['familia', 'terapeutas', 'educadores'],
    type: [String],
  })
  areasApoyo?: string[]

  @ApiProperty({
    description: 'Historial educativo',
    example: ['escuela_regular', 'educacion_especial', 'tutorias'],
    type: [String],
  })
  historialEducacion?: string[]

  @ApiProperty({
    description: 'Historial de terapias',
    example: ['terapia_ocupacional', 'fonoaudiologia', 'psicologia'],
    type: [String],
  })
  historialTerapia?: string[]

  @ApiPropertyOptional({
    description: 'Etapa de vida del usuario',
    example: 'infancia',
  })
  etapaVida?: string

  @ApiPropertyOptional({
    description: 'Preocupaciones o desafíos actuales del usuario',
    example: 'Dificultad para encontrar terapias cerca de casa',
  })
  preocupacionesActuales?: string

  @ApiPropertyOptional({
    description: 'Nivel de apoyo requerido',
    example: 'moderado',
  })
  nivelApoyo?: string
}
