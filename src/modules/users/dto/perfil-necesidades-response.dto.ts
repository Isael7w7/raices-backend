import { ApiProperty } from '@nestjs/swagger'

/**
 * DTO de respuesta para el perfil de necesidades (contenido interno).
 * Muestra el esquema exacto de los 14 campos del perfil en Swagger UI.
 */
export class PerfilNecesidadesResponseDto {
  @ApiProperty({ description: 'Tipos de discapacidad registrados', example: ['tea', 'motriz'], type: [String], required: false })
  tiposDiscapacidad: string[]

  @ApiProperty({ description: 'Nivel de severidad de la discapacidad', example: 'moderada', nullable: true, required: false })
  severidadDiscapacidad: string | null

  @ApiProperty({ description: 'Modos de comunicación utilizados', example: ['verbal', 'señas'], type: [String], required: false })
  modosComunicacion: string[]

  @ApiProperty({ description: 'Necesidades de movilidad', example: ['rampas', 'ascensor'], type: [String], required: false })
  necesidadesMovilidad: string[]

  @ApiProperty({ description: 'Acceso a tecnología', example: ['smartphone', 'computadora'], type: [String], required: false })
  accesoTecnologia: string[]

  @ApiProperty({ description: 'Zonas o áreas preferidas para atención', example: ['Mérida Norte', 'Centro'], type: [String], required: false })
  zonasPreferidas: string[]

  @ApiProperty({ description: 'Necesidades específicas del usuario', example: ['terapia ocupacional', 'apoyo emocional'], type: [String], required: false })
  necesidades: string[]

  @ApiProperty({ description: 'Metas actuales del usuario', example: ['autonomía', 'integración social'], type: [String], required: false })
  metasActuales: string[]

  @ApiProperty({ description: 'Áreas de apoyo requeridas', example: ['educación', 'empleo'], type: [String], required: false })
  areasApoyo: string[]

  @ApiProperty({ description: 'Historial educativo', example: ['escuela regular', 'educación especial'], type: [String], required: false })
  historialEducacion: string[]

  @ApiProperty({ description: 'Historial de terapias', example: ['fisioterapia', 'psicología'], type: [String], required: false })
  historialTerapia: string[]

  @ApiProperty({ description: 'Etapa de vida del usuario', example: 'joven_adulto', nullable: true, required: false })
  etapaVida: string | null

  @ApiProperty({ description: 'Preocupaciones o desafíos actuales del usuario', example: 'inclusión laboral', nullable: true, required: false })
  preocupacionesActuales: string | null

  @ApiProperty({ description: 'Nivel de apoyo requerido', example: 'intermedio', nullable: true, required: false })
  nivelApoyo: string | null
}

/**
 * DTO de respuesta estándar para GET /perfil-necesidades.
 */
export class ObtenerPerfilNecesidadesResponseDto {
  @ApiProperty({ description: 'Indica si la operación fue exitosa', example: true })
  exito: boolean

  @ApiProperty({ description: 'Mensaje descriptivo de la operación', example: 'Perfil de necesidades obtenido con éxito' })
  mensaje: string

  @ApiProperty({ description: 'Datos del perfil de necesidades (puede ser null si no existe)', type: PerfilNecesidadesResponseDto, nullable: true })
  datos: PerfilNecesidadesResponseDto | null
}

/**
 * DTO de respuesta estándar para POST y PUT /perfil-necesidades.
 */
export class GuardarPerfilNecesidadesResponseDto {
  @ApiProperty({ description: 'Indica si la operación fue exitosa', example: true })
  exito: boolean

  @ApiProperty({ description: 'Mensaje descriptivo de la operación', example: 'Perfil de necesidades guardado con éxito' })
  mensaje: string

  @ApiProperty({ description: 'Datos del perfil de necesidades guardado', type: PerfilNecesidadesResponseDto })
  datos: PerfilNecesidadesResponseDto
}

/**
 * DTO de respuesta estándar para DELETE /perfil-necesidades.
 */
export class EliminarPerfilNecesidadesResponseDto {
  @ApiProperty({ description: 'Indica si la operación fue exitosa', example: true })
  exito: boolean

  @ApiProperty({ description: 'Mensaje descriptivo de la operación', example: 'Perfil de necesidades eliminado con éxito' })
  mensaje: string
}
