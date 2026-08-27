import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { PaginacionMetaDto } from '../../../common/dto/paginacion.dto'

// ─── Revelación Progresiva ──────────────────────────────────────────

export class EstadoOnboardingDto {
  @ApiProperty({ description: 'Si el usuario ha completado el onboarding obligatorio', example: false })
  onboardingCompleto!: boolean

  @ApiProperty({ description: 'Lista de campos faltantes para completar el onboarding', example: ['tiposDiscapacidad', 'certificadoDiscapacidad'], type: [String] })
  camposFaltantes!: string[]

  @ApiProperty({ description: 'Porcentaje de completitud del onboarding (0-100)', example: 60 })
  porcentaje!: number
}

// ─── Especialistas Recomendados ──────────────────────────────────────

export class EspecialistaRecomendadoDto {
  @ApiProperty({ description: 'ID del especialista', example: 'esp-abc123' })
  id!: string

  @ApiProperty({ description: 'Nombre del especialista', example: 'Dra. María López' })
  nombre?: string

  @ApiProperty({ description: 'Especialidad', example: 'Neuropsicología' })
  especialidad?: string

  @ApiProperty({ description: 'Tipos de discapacidad que atiende', example: ['tea', 'tdah'], type: [String] })
  tiposDiscapacidad!: string[]

  @ApiProperty({ description: 'Edad mínima de atención', example: 3, nullable: true })
  edadMinima?: number | null

  @ApiProperty({ description: 'Edad máxima de atención', example: 18, nullable: true })
  edadMaxima?: number | null

  @ApiProperty({ description: 'Ciudad del especialista', example: 'Mérida', nullable: true })
  ciudad?: string

  @ApiProperty({ description: 'Modalidad de atención', example: 'presencial', nullable: true })
  modalidad?: string

  @ApiProperty({ description: 'Descripción del especialista', nullable: true })
  descripcion?: string

  @ApiProperty({ description: 'Calificación promedio', example: 4.8 })
  calificacionPromedio?: number

  @ApiProperty({ description: 'Número de calificaciones', example: 15 })
  cantidadCalificaciones?: number

  @ApiProperty({ description: 'Score de coincidencia de discapacidad (0 o 1)', example: 1 })
  score_discapacidad!: number

  @ApiProperty({ description: 'Score de coincidencia de edad (0 o 1)', example: 1 })
  score_edad!: number

  @ApiProperty({ description: 'Score final de matching (0 a 1)', example: 0.85 })
  final_score!: number
}

export class PaginaEspecialistasDto {
  @ApiProperty({ type: [EspecialistaRecomendadoDto], description: 'Especialistas de la página ordenados por final_score descendente' })
  datos!: EspecialistaRecomendadoDto[]

  @ApiProperty({ type: PaginacionMetaDto })
  paginacion!: PaginacionMetaDto
}
