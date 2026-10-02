import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { RespuestaPaginadaAnidadaDto } from '../../../common/dto/paginacion.dto'

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

  @ApiProperty({ example: ['Terapia ABA', 'Fonoaudiología'], type: [String] })
  servicios!: string[]

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
