import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { RespuestaPaginadaAnidadaDto } from '../../../common/dto/paginacion.dto'

/**
 * Servicio o programa publicado por una institución en su catálogo público.
 *
 * El panel privado guarda cada servicio serializado como JSON dentro de
 * `instituciones.servicios`; el detalle público devuelve solo los que están
 * en estado `Activo`, ya parseados en esta forma.
 */
export class ServicioPublicoDto {
  @ApiProperty({ example: 's-101' })
  id!: string

  @ApiProperty({ example: 'Terapia del habla' })
  nombre!: string

  @ApiProperty({ example: 'Salud y Terapia', nullable: true })
  categoria!: string | null

  @ApiProperty({ example: 'Sesiones individuales para niños de 3 a 12 años.', nullable: true })
  descripcion!: string | null

  @ApiProperty({ example: 'Gratuito', description: 'Precio o modalidad de costo (alias: `precio`)' })
  costo!: string

  @ApiProperty({ example: 'Lunes a Viernes de 9:00 a 14:00 hrs', nullable: true })
  horario!: string | null

  @ApiProperty({ type: [String], example: ['Rampa de acceso', 'Intérprete LSM'] })
  accesibilidad!: string[]

  @ApiProperty({ enum: ['Activo'], example: 'Activo', description: 'Solo se publican servicios con estado Activo' })
  estado!: 'Activo'
}

export class InstitucionDto {
  @ApiProperty({ example: 'inst-uid' })
  id!: string

  @ApiProperty({ example: 'Centro de Rehabilitación DIF Mérida' })
  nombre!: string

  @ApiProperty({ example: 'Terapias físicas, ocupacionales y de lenguaje.', nullable: true })
  descripcion!: string | null

  @ApiProperty({ enum: ['funcional', 'educativo', 'laboral', 'social'], example: 'funcional' })
  categoria!: string | null

  @ApiProperty({ example: 'terapias', nullable: true })
  subcategoria!: string | null

  @ApiProperty({ example: 'Calle 50 x 65 #123', nullable: true })
  direccion!: string | null

  @ApiProperty({ example: 'Mérida', nullable: true })
  ciudad!: string | null

  @ApiProperty({ example: 'Yucatán', nullable: true })
  estado!: string | null

  @ApiPropertyOptional({ example: 20.9674 })
  lat?: number | null

  @ApiPropertyOptional({ example: -89.6237 })
  lng?: number | null

  @ApiProperty({ example: '9999990001', nullable: true })
  telefono!: string | null

  @ApiProperty({ example: '9991110001', nullable: true })
  whatsapp!: string | null

  @ApiProperty({ example: 'contacto@difmerida.mx', nullable: true })
  email!: string | null

  @ApiProperty({ example: 'https://difmerida.mx', nullable: true })
  sitioWeb!: string | null

  @ApiProperty({ example: 'https://storage.../logo.png', nullable: true })
  urlLogo!: string | null

  @ApiProperty({ example: 'https://storage.../cover.jpg', nullable: true })
  urlPortada!: string | null

  @ApiProperty({ example: ['tea', 'motriz'], type: [String] })
  tiposDiscapacidad!: string[]

  @ApiPropertyOptional({ example: 0 })
  edadMinima?: number | null

  @ApiPropertyOptional({ example: 99 })
  edadMaxima?: number | null

  @ApiProperty({ example: 'Lun-Vie 8:00-16:00', nullable: true })
  horarioAtencion!: string | null

  @ApiProperty({ enum: ['gratuito', 'pago', 'mixto'], example: 'gratuito' })
  tipoPlan!: string | null

  @ApiProperty({
    description:
      'Catálogo de servicios. En el detalle público (GET /instituciones/:id) se devuelven parseados como objetos y '
      + 'solo con estado Activo (ver InstitucionPublicaDto / ServicioPublicoDto). En el resto de endpoints pueden '
      + 'venir como strings (JSON serializado del panel privado o etiqueta legada).',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    example: ['{"id":"s-101","nombre":"Terapia ABA","costo":"Gratuito","horario":"Lun-Vie 9:00-14:00","activo":true}'],
  })
  servicios!: Array<string | ServicioPublicoDto>

  @ApiProperty({ example: ['https://storage.../foto1.jpg'], type: [String] })
  fotos!: string[]

  @ApiProperty({ example: 4.5 })
  calificacionPromedio!: number

  @ApiProperty({ example: 12 })
  cantidadCalificaciones!: number

  @ApiProperty({ example: true })
  activa!: boolean

  @ApiProperty({ example: false })
  verificada!: boolean

  @ApiProperty({ example: 'owner-uid' })
  creadoPor!: string

  @ApiProperty({ example: '2026-08-06T00:00:00.000Z' })
  fechaCreacion!: string

  @ApiPropertyOptional({ example: '2026-08-06T00:00:00.000Z' })
  fechaActualizacion?: string

  @ApiPropertyOptional({ example: '2026-08-06T00:00:00.000Z' })
  fechaEliminacion?: string
}

export class PaginaInstitucionesDto extends RespuestaPaginadaAnidadaDto<InstitucionDto> {
  @ApiProperty({ description: 'Instituciones de la página', type: [InstitucionDto] })
  datos!: InstitucionDto[]
}

/**
 * Detalle público de una institución (`GET /instituciones/:id`): idéntico al
 * documento, pero con el catálogo de servicios poblado y limitado a los
 * servicios en estado `Activo`.
 */
export class InstitucionPublicaDto extends InstitucionDto {
  @ApiProperty({
    description: 'Servicios en estado Activo publicados por la institución (vacío si no hay ninguno)',
    type: [ServicioPublicoDto],
  })
  servicios!: ServicioPublicoDto[]
}

/**
 * Inscripción de una persona a un servicio/programa de una institución.
 * Flujo con aprobación: `pendiente` → `activa` | `rechazada`; `cancelada`
 * cuando la persona retira su propia inscripción.
 */
export class InscripcionServicioDto {
  @ApiProperty({ example: 's-101__uid-123' })
  id!: string

  @ApiProperty({ example: 'inst-uid' })
  institucionId!: string

  @ApiProperty({ example: 's-101' })
  servicioId!: string

  @ApiProperty({ example: 'Terapia del habla', nullable: true })
  servicioNombre!: string | null

  @ApiProperty({ example: 'uid-123' })
  usuarioId!: string

  @ApiProperty({ enum: ['pendiente', 'activa', 'rechazada', 'cancelada'], example: 'pendiente' })
  estado!: string

  @ApiProperty({ example: '2026-10-14T12:00:00.000Z', nullable: true })
  fechaCreacion!: string | null

  @ApiPropertyOptional({ example: '2026-10-14T12:00:00.000Z' })
  fechaActualizacion?: string

  @ApiPropertyOptional({ nullable: true })
  fechaResolucion?: string | null
}

/** Datos de contacto de la persona inscrita (para que la institución la ubique). */
export class UsuarioInscripcionDto {
  @ApiProperty({ example: 'uid-123' })
  id!: string

  @ApiProperty({ example: 'María López' })
  nombre!: string

  @ApiProperty({ example: 'maria@correo.mx' })
  email!: string

  @ApiPropertyOptional({ nullable: true, example: 'https://storage.../avatar.jpg' })
  urlAvatar?: string | null
}

/** Inscripción enriquecida con el perfil de la persona inscrita. */
export class InscripcionConUsuarioDto extends InscripcionServicioDto {
  @ApiProperty({ type: UsuarioInscripcionDto })
  usuario!: UsuarioInscripcionDto
}

/** Estado de la inscripción del usuario actual en un servicio (botón público). */
export class EstadoInscripcionServicioDto {
  @ApiProperty({ example: 'inst-uid' })
  institucionId!: string

  @ApiProperty({ example: 's-101' })
  servicioId!: string

  @ApiProperty({ enum: ['pendiente', 'activa', 'rechazada', 'cancelada', null], nullable: true, example: 'pendiente' })
  estado!: string | null

  @ApiProperty({ example: false, description: 'true cuando la inscripción ya fue aprobada' })
  inscrito!: boolean

  @ApiProperty({ example: true, description: 'true cuando la solicitud espera aprobación de la institución' })
  solicitado!: boolean
}

/** Listado de inscripciones de un servicio (solo la institución dueña o admin). */
export class ListadoInscripcionesServicioDto {
  @ApiProperty({ example: 'inst-uid' })
  institucionId!: string

  @ApiProperty({ example: 's-101' })
  servicioId!: string

  @ApiProperty({ type: [InscripcionConUsuarioDto] })
  datos!: InscripcionConUsuarioDto[]

  @ApiProperty({ example: 3 })
  total!: number

  @ApiProperty({ example: 1 })
  pendientes!: number

  @ApiProperty({ example: 2 })
  activas!: number

  @ApiProperty({ example: 0 })
  rechazadas!: number
}

/** Conteo de inscripciones por servicio de la institución autenticada (panel). */
export class ResumenServicioDto {
  @ApiProperty({ example: 's-101' })
  servicioId!: string

  @ApiProperty({ example: 'Terapia del habla', nullable: true })
  servicioNombre!: string | null

  @ApiProperty({ example: 1 })
  pendientes!: number

  @ApiProperty({ example: 2 })
  activas!: number

  @ApiProperty({ example: 0 })
  rechazadas!: number

  @ApiProperty({ example: 3 })
  total!: number
}

export class ResumenInscripcionesServicioDto {
  @ApiProperty({ example: 'inst-uid' })
  institucionId!: string

  @ApiProperty({ type: [ResumenServicioDto] })
  datos!: ResumenServicioDto[]
}

/** Documento de verificación subido (CSF o identificación del representante). */
export class DocumentoVerificacionSubidoDto {
  @ApiProperty({ enum: ['csf', 'identificacion_representante'], example: 'csf' })
  tipo!: string

  @ApiProperty({ example: 'https://storage.googleapis.com/raices-bucket/instituciones/inst-uid.pdf' })
  urlDocumento!: string

  @ApiProperty({ example: 'pendiente', enum: ['pendiente', 'aprobado', 'rechazado'] })
  estado!: string

  @ApiProperty({ example: '2026-08-13T00:00:00.000Z' })
  fechaSubida!: string
}

/**
 * Paso de verificación de una institución/empresa (persona moral).
 * La CURP no existe como paso: no aplica a personas morales.
 */
export class PasoVerificacionDto {
  @ApiProperty({ enum: ['csf', 'aprobacion_admin', 'identificacion_representante'], example: 'csf' })
  clave!: string

  @ApiProperty({ example: 'Constancia de Situación Fiscal (CSF)' })
  titulo!: string

  @ApiProperty({ example: true, description: 'true si es obligatorio para considerar verificada a la institución' })
  obligatorio!: boolean

  @ApiProperty({ example: false, description: 'true si el paso ya está completado' })
  completado!: boolean

  @ApiProperty({ example: 'Documento fiscal de la persona moral (RFC). Requisito indispensable.', nullable: true })
  descripcion!: string | null
}

/**
 * Estado de verificación de una institución/empresa: lista de pasos válidos
 * para personas morales (CSF + Aprobación del Administrador; identificación
 * del representante legal como opcional). No incluye CURP.
 */
export class EstadoVerificacionInstitucionDto {
  @ApiProperty({ example: 'inst-uid' })
  institucionId!: string

  @ApiProperty({ example: 'Centro de Rehabilitación', nullable: true })
  nombre!: string | null

  @ApiProperty({ example: false, description: 'true cuando un administrador aprobó la institución' })
  verificada!: boolean

  @ApiProperty({ example: 50, description: 'Porcentaje sobre los pasos obligatorios (CSF + Aprobación del Administrador)' })
  porcentaje!: number

  @ApiProperty({ type: [PasoVerificacionDto] })
  pasos!: PasoVerificacionDto[]

  @ApiProperty({ type: [String], example: ['csf'], description: 'Claves de los pasos obligatorios pendientes' })
  pasosPendientes!: string[]

  @ApiProperty({ type: [String], example: ['csf'], description: 'Documentos indispensables que faltan (solo CSF; nunca CURP)' })
  documentosFaltantes!: string[]
}
