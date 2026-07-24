import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsArray, IsString, IsIn } from 'class-validator'

export class GuardarPerfilNecesidadesDto {
  @ApiProperty({
    description: 'Tipos de discapacidad del usuario',
    example: ['tea', 'motriz', 'visual'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tiposDiscapacidad?: string[]

  @ApiPropertyOptional({
    description: 'Nivel de severidad de la discapacidad',
    example: 'moderada',
  })
  @IsOptional()
  @IsString()
  severidadDiscapacidad?: string

  @ApiProperty({
    description: 'Modos de comunicación que utiliza',
    example: ['verbal'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  modosComunicacion?: string[]

  @ApiProperty({
    description: 'Necesidades de movilidad',
    example: ['rampas'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  necesidadesMovilidad?: string[]

  @ApiProperty({
    description: 'Acceso a tecnología',
    example: ['smartphone'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accesoTecnologia?: string[]

  @ApiProperty({
    description: 'Zonas o áreas preferidas para atención',
    example: ['Mérida Norte'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  zonasPreferidas?: string[]

  @ApiProperty({
    description: 'Necesidades específicas del usuario',
    example: ['terapia ocupacional'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  necesidades?: string[]

  @ApiProperty({
    description: 'Metas actuales del usuario',
    example: ['autonomía'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  metasActuales?: string[]

  @ApiProperty({
    description: 'Áreas de apoyo requeridas',
    example: ['educación'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areasApoyo?: string[]

  @ApiProperty({
    description: 'Historial educativo',
    example: ['educación especial'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  historialEducacion?: string[]

  @ApiProperty({
    description: 'Historial de terapias',
    example: ['fisioterapia'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  historialTerapia?: string[]

  @ApiPropertyOptional({
    description: 'Etapa de vida del usuario',
    example: 'joven_adulto',
  })
  @IsOptional()
  @IsString()
  etapaVida?: string

  @ApiPropertyOptional({
    description: 'Preocupaciones o desafíos actuales del usuario',
    example: 'inclusión laboral',
  })
  @IsOptional()
  @IsString()
  preocupacionesActuales?: string

  @ApiPropertyOptional({
    description: 'Nivel de apoyo requerido',
    example: 'intermedio',
  })
  @IsOptional()
  @IsString()
  nivelApoyo?: string
}
