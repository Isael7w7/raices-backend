import { ApiProperty } from '@nestjs/swagger'

// ─── Diapositiva 1 · Estado del Onboarding ──────────────────────────

/**
 * Contrato del endpoint GET /api/onboarding/estado.
 * Expone el progreso del formulario y las variables de contexto que el
 * Frontend necesita para personalizar las preguntas en todo momento.
 */
export class EstadoOnboardingDto {
  @ApiProperty({
    description: 'Si el usuario completó todas las secciones obligatorias del onboarding',
    example: false,
  })
  onboardingCompleto!: boolean

  @ApiProperty({ description: 'Porcentaje de completitud del onboarding (0-100)', example: 45 })
  porcentajeProgreso!: number

  @ApiProperty({
    description: 'Identificador numérico del último paso completado (0 si ninguno)',
    example: 5,
  })
  ultimoPasoCompletado!: number

  @ApiProperty({
    description: 'Destinatario del perfil: para sí mismo o para un tercero',
    enum: ['PARA_MI', 'PARA_MI_HIJO'],
    example: 'PARA_MI_HIJO',
  })
  destinatarioPerfil!: string

  @ApiProperty({
    description: 'Nombre de la PCD (ej. "Diego"); null si aún no se conoce',
    example: 'Diego',
    nullable: true,
  })
  nombrePcd!: string | null

  @ApiProperty({
    description: 'Secciones obligatorias que faltan por responder',
    example: ['historialEducativo', 'terapias'],
    type: [String],
  })
  pasosPendientes!: string[]
}

// ─── Guardado parcial (POST /api/onboarding/borrador) ───────────────

/**
 * Respuesta del guardado parcial: el borrador actualizado (solo las
 * respuestas conocidas) más el progreso recalculado.
 */
export class BorradorOnboardingDto {
  @ApiProperty({
    description: 'Borrador actualizado: fusión de lo previo con lo enviado en esta petición',
    type: 'object',
    additionalProperties: true,
  })
  borrador!: Record<string, unknown>

  @ApiProperty({ description: 'Si el usuario completó todas las secciones obligatorias', example: false })
  onboardingCompleto!: boolean

  @ApiProperty({ description: 'Porcentaje de completitud recalculado (0-100)', example: 45 })
  porcentajeProgreso!: number

  @ApiProperty({ description: 'Identificador numérico del último paso completado', example: 5 })
  ultimoPasoCompletado!: number

  @ApiProperty({
    description: 'Secciones obligatorias que faltan por responder',
    example: ['historialEducativo', 'terapias'],
    type: [String],
  })
  pasosPendientes!: string[]
}
