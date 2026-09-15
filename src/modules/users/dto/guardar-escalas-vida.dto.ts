import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional, IsBoolean, IsArray, IsString } from 'class-validator'

/**
 * DTO para guardar la evaluación "Cómo vives hoy" del Específicación Funcional MVP Raíces.
 * Incluye las 8 escalas con 4 niveles cada una, más campos complementarios
 * de diagnóstico, temporalidad, formato, áreas de interés y viabilidad económica.
 */
export class GuardarEscalasVidaDto {
  // ═══════════════════════════════════════════════════════════════════
  // Escalas "Cómo vives hoy" (8 escalas × 4 niveles)
  // ═══════════════════════════════════════════════════════════════════

  @ApiProperty({
    description: 'Nivel de autonomía (1=Necesita apoyo constante, 2=Necesita supervisión, 3=Mayormente autónomo, 4=Totalmente autónomo)',
    enum: [1, 2, 3, 4],
    example: 2,
  })
  @IsIn([1, 2, 3, 4])
  nivelAutonomia!: number

  @ApiProperty({
    description: 'Nivel de independencia (1=Muy dependiente, 2=Parcialmente independiente, 3=Independiente con apoyo puntual, 4=Totalmente independiente)',
    enum: [1, 2, 3, 4],
    example: 3,
  })
  @IsIn([1, 2, 3, 4])
  nivelIndependencia!: number

  @ApiProperty({
    description: 'Nivel de comunicación (1=No verbal, 2=Comunicación asistida, 3=Verbal con dificultad, 4=Comunicación fluida)',
    enum: [1, 2, 3, 4],
    example: 2,
  })
  @IsIn([1, 2, 3, 4])
  nivelComunicacion!: number

  @ApiProperty({
    description: 'Nivel de comprensión (1=Necesita apoyo significativo, 2=Comprensión parcial, 3=Comprensión con explicaciones simples, 4=Comprensión completa)',
    enum: [1, 2, 3, 4],
    example: 3,
  })
  @IsIn([1, 2, 3, 4])
  nivelComprension!: number

  @ApiProperty({
    description: 'Nivel de energía/resistencia (1=Muy baja, 2=Baja, 3=Moderada, 4=Alta)',
    enum: [1, 2, 3, 4],
    example: 3,
  })
  @IsIn([1, 2, 3, 4])
  nivelEnergia!: number

  @ApiProperty({
    description: 'Nivel de movilidad (1=Dependiente de silla de ruedas/ayuda, 2=Movilidad reducida, 3=Movilidad con adaptaciones, 4=Sin restricciones)',
    enum: [1, 2, 3, 4],
    example: 3,
  })
  @IsIn([1, 2, 3, 4])
  nivelMovilidad!: number

  @ApiProperty({
    description: 'Nivel social (1=Aislamiento, 2=Interacción limitada, 3=Interacción regular, 4=Vida social activa)',
    enum: [1, 2, 3, 4],
    example: 2,
  })
  @IsIn([1, 2, 3, 4])
  nivelSocial!: number

  @ApiProperty({
    description: 'Nivel emocional (1=Frecuentes crisis, 2=Regulación con apoyo, 3=Mayormente estable, 4=Estable emocionalmente)',
    enum: [1, 2, 3, 4],
    example: 3,
  })
  @IsIn([1, 2, 3, 4])
  nivelEmocional!: number

  // ═══════════════════════════════════════════════════════════════════
  // Diagnóstico y temporalidad
  // ═══════════════════════════════════════════════════════════════════

  @ApiProperty({
    description: '¿Tiene diagnóstico formal? Si es false, el backend genera un flag para sugerir especialistas.',
    example: true,
  })
  @IsBoolean()
  tieneDiagnostico!: boolean

  @ApiPropertyOptional({
    description: 'Temporalidad/Origen de la condición',
    enum: ['nacimiento', 'infancia', 'adolescencia', 'vida_adulta', 'progresiva', 'en_evaluacion'],
    example: 'infancia',
  })
  @IsOptional()
  @IsIn(['nacimiento', 'infancia', 'adolescencia', 'vida_adulta', 'progresiva', 'en_evaluacion'])
  temporalidadOrigen?: string

  // ═══════════════════════════════════════════════════════════════════
  // Preferencias de formato
  // ═══════════════════════════════════════════════════════════════════

  @ApiPropertyOptional({
    description: 'Formato preferido de contenido',
    enum: ['texto', 'imagenes', 'audio', 'video', 'presencial'],
    example: 'imagenes',
  })
  @IsOptional()
  @IsIn(['texto', 'imagenes', 'audio', 'video', 'presencial'])
  preferenciaFormato?: string

  // ═══════════════════════════════════════════════════════════════════
  // Áreas de interés y viabilidad económica
  // ═══════════════════════════════════════════════════════════════════

  @ApiPropertyOptional({
    description: 'Áreas de interés del usuario (opción múltiple)',
    example: ['educacion', 'comunidad', 'deporte_arte_bienestar'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areasInteres?: string[]

  @ApiPropertyOptional({
    description: 'Viabilidad económica del usuario',
    enum: ['gratuita_becas', 'bajo_costo', 'moderada', 'sin_restricciones'],
    example: 'bajo_costo',
  })
  @IsOptional()
  @IsIn(['gratuita_becas', 'bajo_costo', 'moderada', 'sin_restricciones'])
  viabilidadEconomica?: string
}
