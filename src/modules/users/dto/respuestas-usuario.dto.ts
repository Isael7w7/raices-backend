import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { RespuestaPaginadaDto } from '../../../common/dto/paginacion.dto'

export class PerfilNecesidadesDto {
  @ApiProperty({ example: ['tea', 'motriz'], type: [String] })
  tiposDiscapacidad!: string[] | null

  @ApiProperty({ example: 'moderada', nullable: true })
  severidadDiscapacidad!: string | null

  @ApiProperty({ example: ['lenguaje_señas', 'aac'], type: [String] })
  modosComunicacion!: string[] | null

  @ApiProperty({ example: ['silla_ruedas'], type: [String] })
  necesidadesMovilidad!: string[] | null

  @ApiProperty({ example: ['tablet'], type: [String] })
  accesoTecnologia!: string[] | null

  @ApiProperty({ example: ['centro'], type: [String] })
  zonasPreferidas!: string[] | null

  @ApiProperty({ example: ['apoyo_emocional'], type: [String] })
  necesidades!: string[] | null

  @ApiProperty({ example: ['integracion_social'], type: [String] })
  metasActuales!: string[] | null

  @ApiProperty({ example: ['trabajo'], type: [String] })
  areasApoyo!: string[] | null

  @ApiProperty({ example: ['escuela_regular'], type: [String] })
  historialEducacion!: string[] | null

  @ApiProperty({ example: ['terapia_ocupacional'], type: [String] })
  historialTerapia!: string[] | null

  @ApiProperty({ example: 'adulto', nullable: true })
  etapaVida!: string | null

  @ApiProperty({ example: 'ansiedad', nullable: true })
  preocupacionesActuales!: string | null

  @ApiProperty({ example: 'medio', nullable: true })
  nivelApoyo!: string | null

  // ── Campos Spec MVP Raíces ──
  @ApiPropertyOptional({ example: { autonomia: 2, independencia: 3 }, nullable: true, description: 'Escalas "Cómo vives hoy" (8 escalas × 4 niveles)' })
  escalasVida?: Record<string, number> | null

  @ApiPropertyOptional({ example: true, nullable: true, description: 'Tiene diagnóstico formal' })
  tieneDiagnostico?: boolean | null

  @ApiPropertyOptional({ example: false, description: 'Requiere evaluación diagnóstica (si no tiene diagnóstico)' })
  requiereEvaluacion?: boolean

  @ApiPropertyOptional({ example: 'infancia', nullable: true, description: 'Temporalidad/Origen de la condición' })
  temporalidadOrigen?: string | null

  @ApiPropertyOptional({ example: 'imagenes', nullable: true, description: 'Formato preferido de contenido' })
  preferenciaFormato?: string | null

  @ApiPropertyOptional({ example: ['educacion', 'comunidad'], type: [String], nullable: true, description: 'Áreas de interés del usuario' })
  areasInteres?: string[] | null

  @ApiPropertyOptional({ example: 'bajo_costo', nullable: true, description: 'Viabilidad económica' })
  viabilidadEconomica?: string | null

  @ApiPropertyOptional({ example: [{ nombre: 'Centro TEA', tipo: 'terapia', calificacionPersonal: 4 }], nullable: true, description: 'Historial de instituciones previas' })
  historialInstituciones?: { nombre: string; tipo: string; calificacionPersonal?: number; notas?: string }[] | null

  @ApiPropertyOptional({ example: 'empatico', nullable: true, description: 'Tono contextual de la plataforma', enum: ['formal', 'cercano', 'empatico', 'directo', 'infantil'] })
  tonoContextual?: string | null
}

export class InstitucionPerfilDto {
  @ApiProperty({ example: 'inst-uid' })
  id!: string

  @ApiProperty({ example: 'Centro de Rehabilitación', nullable: true })
  nombre!: string | null

  @ApiProperty({ example: 'funcional', nullable: true })
  categoria!: string | null

  @ApiProperty({ example: 'Terapias físicas.', nullable: true })
  descripcion!: string | null

  @ApiProperty({ example: '9999990001', nullable: true })
  telefono!: string | null

  @ApiProperty({ example: ['tea'], type: [String] })
  tiposDiscapacidad!: string[]

  @ApiProperty({ example: 'Mérida', nullable: true })
  ciudad!: string | null

  @ApiProperty({ example: 'Yucatán', nullable: true })
  estado!: string | null

  @ApiProperty({ example: 'https://storage.../logo.png', nullable: true })
  urlLogo!: string | null

  @ApiProperty({ example: true })
  activa!: boolean

  @ApiProperty({ example: false })
  verificada!: boolean

  @ApiProperty({ example: 4.5 })
  calificacionPromedio!: number

  @ApiProperty({ example: 12 })
  cantidadCalificaciones!: number
}

export class PerfilUsuarioDto {
  @ApiProperty({ example: 'uid-123' })
  id!: string

  @ApiProperty({ example: 'Juan Pérez' })
  nombreCompleto!: string

  @ApiProperty({ example: 'usuario@correo.mx' })
  email!: string

  @ApiProperty({ enum: ['pcd', 'tutor', 'institucion', 'admin'], example: 'pcd' })
  rol!: string

  @ApiPropertyOptional({ example: 'Mérida' })
  ciudad?: string

  @ApiPropertyOptional({ example: 'Yucatán' })
  estado?: string

  @ApiPropertyOptional({ example: 'https://storage.../avatar.jpg' })
  urlAvatar?: string

  @ApiPropertyOptional({ example: false })
  verificado?: boolean

  @ApiPropertyOptional({ example: 'tutor-uid', nullable: true })
  tutorId?: string | null

  @ApiPropertyOptional({ example: 'inst-uid', nullable: true })
  institucionId?: string | null

  @ApiPropertyOptional({ example: { chat: true, postulaciones: true } })
  features?: Record<string, boolean>

  @ApiPropertyOptional({ type: PerfilNecesidadesDto, description: 'Datos extendidos de discapacidad y necesidades' })
  perfilNecesidades?: PerfilNecesidadesDto | null

  @ApiPropertyOptional({ type: InstitucionPerfilDto, description: 'Datos de la institución (solo rol institución)' })
  institucion?: InstitucionPerfilDto | null
}

export class RespuestaAvatarDto {
  @ApiProperty({ description: 'URL del avatar guardado', example: 'https://storage.../avatars/abc.jpg' })
  urlAvatar!: string
}

export class DependienteDto {
  @ApiProperty({ example: 'dep-uid' })
  id!: string

  @ApiProperty({ example: 'María García' })
  nombreCompleto!: string

  @ApiProperty({ example: 'hijo', nullable: true })
  parentesco!: string | null

  @ApiProperty({ example: ['tea', 'motriz'], type: [String] })
  tiposDiscapacidad!: string[]

  @ApiProperty({ example: '6-12', nullable: true })
  rangoEdad!: string | null

  @ApiProperty({ example: 'infancia', nullable: true })
  etapaVida!: string | null

  @ApiProperty({ example: 'Requiere acompañamiento', nullable: true })
  notas!: string | null

  @ApiProperty({ example: 'moderada', nullable: true })
  discapacidad!: string | null

  @ApiProperty({ example: false })
  esCuentaVinculada!: boolean

  @ApiProperty({ example: 'pcd-uid', nullable: true })
  pcdUserId!: string | null

  @ApiProperty({ example: { chat: true, postulaciones: true } })
  features!: Record<string, boolean>

  @ApiPropertyOptional({ example: 'https://storage.../avatar.jpg', nullable: true, description: 'Foto real del perfil (solo cuentas vinculadas, en el listado enriquecido)' })
  fotoUrl?: string | null

  @ApiProperty({ example: '2026-08-06T00:00:00.000Z' })
  fechaCreacion!: string
}

export class ConteoDependientesDto {
  @ApiProperty({ example: 3 })
  total!: number

  @ApiProperty({ example: 5 })
  limite!: number

  @ApiProperty({ example: 2 })
  restantes!: number
}

export class RespuestaVinculacionDto {
  @ApiProperty({ example: true })
  vinculado!: boolean

  @ApiProperty({ example: 'pcd-uid' })
  pcdUserId!: string

  @ApiProperty({ example: 'tutor-uid' })
  tutorId!: string
}

export class RespuestaDesvinculacionDto {
  @ApiProperty({ example: true })
  desvinculado!: boolean

  @ApiProperty({ example: 'pcd-uid' })
  pcdUserId!: string

  @ApiProperty({ example: 'tutor-uid' })
  tutorId!: string
}

export class RespuestaFeaturesDto {
  @ApiProperty({ example: 'dep-uid' })
  id!: string

  @ApiProperty({ example: { chat: true, postulaciones: false } })
  features!: Record<string, boolean>
}

export class RespuestaPermisosDependienteDto {
  @ApiProperty({ example: 'dep-uid' })
  dependienteId!: string

  @ApiProperty({ example: 'María García', nullable: true })
  nombre!: string | null

  @ApiProperty({ example: false, description: 'true si es una cuenta PCD vinculada' })
  esCuentaVinculada!: boolean

  @ApiProperty({ example: 'pcd-uid', nullable: true })
  pcdUserId!: string | null

  @ApiProperty({
    example: { chat: true, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true },
    description: 'Permisos activos del dependiente (chat, postulaciones, comunidad, reseñas, descubrimiento, favoritos, multimedia)',
  })
  features!: Record<string, boolean>
}

/**
 * Interfaz común de "mis personas": consolida dependientes planos y
 * cuentas PCD vinculadas en un solo arreglo.
 */
export class MisPersonaDto {
  @ApiProperty({ example: 'dep-uid' })
  id!: string

  @ApiProperty({ example: 'María García' })
  nombre!: string

  @ApiProperty({ example: false, description: 'true si es una cuenta PCD vinculada con correo; false si es un dependiente plano' })
  esCuentaVinculada!: boolean

  @ApiProperty({ example: { chat: true, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true } })
  features!: Record<string, boolean>

  @ApiProperty({ example: 'https://storage.../avatar.jpg', nullable: true, description: 'Foto real del perfil (solo cuentas vinculadas)' })
  fotoUrl!: string | null

  @ApiProperty({ example: 'pcd-uid', nullable: true })
  pcdUserId!: string | null

  @ApiProperty({ example: '2026-08-06T00:00:00.000Z', nullable: true })
  fechaCreacion!: string | null
}

export class PaginaMisPersonasDto extends RespuestaPaginadaDto<MisPersonaDto> {
  @ApiProperty({ type: [MisPersonaDto], description: 'Personas de la página' })
  datos!: MisPersonaDto[]
}
