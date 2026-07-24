import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/**
 * Datos del perfil de necesidades embebido en el perfil.
 */
export class PerfilNecesidadesEmbebidoDto {
  @ApiProperty({ description: 'Tipos de discapacidad registrados', example: ['tea', 'motriz'], type: [String], required: false })
  tiposDiscapacidad: string[]

  @ApiProperty({ description: 'Nivel de severidad', example: 'moderada', nullable: true, required: false })
  severidadDiscapacidad: string | null

  @ApiProperty({ description: 'Modos de comunicación', example: ['verbal'], type: [String], required: false })
  modosComunicacion: string[]

  @ApiProperty({ description: 'Necesidades de movilidad', example: ['rampas'], type: [String], required: false })
  necesidadesMovilidad: string[]

  @ApiProperty({ description: 'Acceso a tecnología', example: ['smartphone'], type: [String], required: false })
  accesoTecnologia: string[]

  @ApiProperty({ description: 'Zonas preferidas', example: ['Mérida Norte'], type: [String], required: false })
  zonasPreferidas: string[]

  @ApiProperty({ description: 'Necesidades específicas', example: ['terapia ocupacional'], type: [String], required: false })
  necesidades: string[]

  @ApiProperty({ description: 'Metas actuales', example: ['autonomía'], type: [String], required: false })
  metasActuales: string[]

  @ApiProperty({ description: 'Áreas de apoyo', example: ['educación'], type: [String], required: false })
  areasApoyo: string[]

  @ApiProperty({ description: 'Historial educativo', example: ['escuela regular'], type: [String], required: false })
  historialEducacion: string[]

  @ApiProperty({ description: 'Historial de terapias', example: ['fisioterapia'], type: [String], required: false })
  historialTerapia: string[]

  @ApiProperty({ description: 'Etapa de vida', example: 'joven_adulto', nullable: true, required: false })
  etapaVida: string | null

  @ApiProperty({ description: 'Preocupaciones actuales', example: 'inclusión laboral', nullable: true, required: false })
  preocupacionesActuales: string | null

  @ApiProperty({ description: 'Nivel de apoyo requerido', example: 'intermedio', nullable: true, required: false })
  nivelApoyo: string | null
}

/**
 * Datos completos del perfil del usuario.
 */
export class PerfilDatosDto {
  @ApiProperty({ description: 'ID del perfil', example: 'abc-123' })
  id: string

  @ApiPropertyOptional({ description: 'Nombre completo del usuario', example: 'Juan Pérez López' })
  nombreCompleto?: string

  @ApiPropertyOptional({ description: 'Correo electrónico', example: 'juan@example.com' })
  email?: string

  @ApiPropertyOptional({ description: 'Ciudad de residencia', example: 'Mérida' })
  ciudad?: string

  @ApiPropertyOptional({ description: 'Estado o provincia', example: 'Yucatán' })
  estado?: string

  @ApiPropertyOptional({ description: 'URL del avatar', example: 'https://storage.googleapis.com/.../avatar.jpg' })
  urlAvatar?: string

  @ApiPropertyOptional({ description: 'Rol del usuario', example: 'user' })
  rol?: string

  @ApiProperty({ description: 'Perfil de necesidades del usuario (puede ser null si no existe)', type: PerfilNecesidadesEmbebidoDto, nullable: true })
  perfilNecesidades: PerfilNecesidadesEmbebidoDto | null
}

/**
 * DTO de respuesta para GET /perfil.
 */
export class ObtenerPerfilResponseDto {
  @ApiProperty({ description: 'Indica si la operación fue exitosa', example: true })
  exito: boolean

  @ApiProperty({ description: 'Mensaje descriptivo de la operación', example: 'Perfil obtenido con éxito' })
  mensaje: string

  @ApiProperty({ description: 'Datos completos del perfil del usuario', type: PerfilDatosDto })
  datos: PerfilDatosDto
}

/**
 * DTO de respuesta para PUT /perfil.
 */
export class ActualizarPerfilResponseDto {
  @ApiProperty({ description: 'Indica si la operación fue exitosa', example: true })
  exito: boolean

  @ApiProperty({ description: 'Mensaje descriptivo de la operación', example: 'Perfil actualizado con éxito' })
  mensaje: string

  @ApiProperty({ description: 'Datos del perfil actualizado', type: PerfilDatosDto })
  datos: PerfilDatosDto
}
