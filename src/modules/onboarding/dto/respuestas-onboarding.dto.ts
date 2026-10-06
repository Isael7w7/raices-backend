import { ApiProperty } from '@nestjs/swagger'

// ─── Navegación por etapas (Sidebar) ───────────────────────────────

/** Estado de una etapa del Sidebar. */
export class EstadoEtapaDto {
  @ApiProperty({ description: 'Nombre de la etapa', example: 'Conocer quién eres' })
  nombre!: string

  @ApiProperty({ description: 'Si la etapa está completamente resuelta', example: true })
  completada!: boolean

  @ApiProperty({
    description: 'Si la etapa está desbloqueada (requiere completar la etapa anterior)',
    example: true,
  })
  desbloqueada!: boolean

  @ApiProperty({ description: 'Porcentaje de avance de la etapa (0-100)', example: 100 })
  porcentaje!: number
}

/** Mapa de las 3 etapas de navegación del ecosistema Raíces. */
export class EtapasNavegacionDto {
  @ApiProperty({ type: EstadoEtapaDto, description: 'Etapa 1: perfilamiento / onboarding inicial' })
  etapa1!: EstadoEtapaDto

  @ApiProperty({ type: EstadoEtapaDto, description: 'Etapa 2: rutinas, apoyos y terapias' })
  etapa2!: EstadoEtapaDto

  @ApiProperty({ type: EstadoEtapaDto, description: 'Etapa 3: caminos, oportunidades y comunidad' })
  etapa3!: EstadoEtapaDto
}

// ─── Diapositiva 1 · Estado del Onboarding ──────────────────────────

/**
 * Sección pendiente con etiqueta amigable.
 * `etiqueta` es el texto que la UI debe mostrar; `clave` solo sirve para
 * navegar al paso correspondiente (no es texto de interfaz).
 */
export class SeccionFaltanteDto {
  @ApiProperty({ description: 'Clave técnica de la sección (solo navegación interna)', example: 'datosGenerales' })
  clave!: string

  @ApiProperty({
    description: 'Etiqueta en lenguaje natural para mostrar al usuario',
    example: 'Datos generales',
  })
  etiqueta!: string

  @ApiProperty({
    description: 'Campos concretos que faltan dentro de la sección',
    example: ['curp', 'ciudad'],
    type: [String],
  })
  camposFaltantes!: string[]
}

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

  @ApiProperty({
    description: 'Alias booleano de onboardingCompleto, para que la UI no dependa del nombre técnico',
    example: false,
  })
  completado!: boolean

  @ApiProperty({
    description: 'Secciones pendientes CON etiqueta amigable (array vacío al completar el onboarding)',
    example: [{ clave: 'datosGenerales', etiqueta: 'Datos generales', camposFaltantes: ['curp'] }],
    type: [SeccionFaltanteDto],
  })
  seccionesFaltantes!: SeccionFaltanteDto[]

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
    description: 'Secciones obligatorias que faltan por responder (claves técnicas; usar seccionesFaltantes para mostrar texto al usuario)',
    example: ['historialEducativo', 'terapias'],
    type: [String],
  })
  pasosPendientes!: string[]

  @ApiProperty({
    type: EtapasNavegacionDto,
    description: 'Progreso y desbloqueo de las 3 etapas del Sidebar',
  })
  etapas!: EtapasNavegacionDto

  @ApiProperty({
    description: 'Módulos del menú lateral permitidos (etapas desbloqueadas)',
    example: ['inicio', 'perfil_pcd', 'terapias', 'rutinas'],
    type: [String],
  })
  modulosPermitidos!: string[]
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
    description: 'Secciones obligatorias que faltan por responder (claves técnicas; usar seccionesFaltantes para mostrar texto al usuario)',
    example: ['historialEducativo', 'terapias'],
    type: [String],
  })
  pasosPendientes!: string[]

  @ApiProperty({
    description: 'Secciones pendientes CON etiqueta amigable',
    example: [{ clave: 'terapias', etiqueta: 'Terapias y diagnóstico', camposFaltantes: ['tieneDiagnostico'] }],
    type: [SeccionFaltanteDto],
  })
  seccionesFaltantes!: SeccionFaltanteDto[]
}

// ─── Cierre del onboarding (POST /api/onboarding/completar) ──────────

/**
 * Respuesta de la consolidación: el borrador se promovió a
 * `perfilesExtendidos` y el perfil quedó marcado al 100%.
 */
export class OnboardingCompletadoDto extends BorradorOnboardingDto {
  @ApiProperty({ description: 'Alias booleano de onboardingCompleto', example: true })
  completado!: boolean

  @ApiProperty({ description: 'Si las respuestas ya fueron promovidas a perfilesExtendidos', example: true })
  consolidado!: boolean

  @ApiProperty({ description: 'ISO 8601 del cierre', example: '2026-10-05T12:00:00.000Z' })
  fechaCompletado!: string
}
