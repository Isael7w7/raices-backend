import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { RespuestaPaginadaDto } from '../../../common/dto/paginacion.dto'

export class VacanteDto {
  @ApiProperty({ example: 'vacante-uid' })
  id!: string

  @ApiProperty({ example: 'inst-uid' })
  institucionId!: string

  @ApiProperty({ example: 'Terapeuta ocupacional' })
  titulo!: string

  @ApiProperty({ example: 'Atención a niños con discapacidad motriz.', nullable: true })
  descripcion!: string | null

  @ApiProperty({ example: 'Título en terapia ocupacional.', nullable: true })
  requisitos!: string | null

  @ApiProperty({ enum: ['presencial', 'remoto', 'hibrido'], example: 'presencial', nullable: true })
  modalidad!: string | null

  @ApiProperty({ example: 'Lun-Vie 8:00-14:00', nullable: true })
  horario!: string | null

  @ApiProperty({ example: '$8,000 - $12,000 MXN', nullable: true })
  rangoSalario!: string | null

  @ApiProperty({ example: 'Mérida', nullable: true })
  ciudad!: string | null

  @ApiProperty({ example: 'Yucatán', nullable: true })
  estado!: string | null

  @ApiProperty({ example: true })
  inclusivaDiscapacidad!: boolean

  @ApiProperty({ example: ['motriz'], type: [String] })
  tiposDiscapacidad!: string[]

  @ApiProperty({ example: true })
  activa!: boolean

  @ApiProperty({ example: '2026-08-06T00:00:00.000Z' })
  fechaCreacion!: string

  @ApiPropertyOptional({ example: 'Centro de Rehabilitación', nullable: true })
  nombreInstitucion?: string | null

  @ApiPropertyOptional({ example: 'Mérida', nullable: true })
  ciudadInstitucion?: string | null

  @ApiPropertyOptional({ example: 'Terapias físicas.', nullable: true })
  descripcionInstitucion?: string | null

  @ApiPropertyOptional({ example: '9999990001', nullable: true })
  telefonoInstitucion?: string | null

  @ApiPropertyOptional({ example: 'contacto@centro.mx', nullable: true })
  emailInstitucion?: string | null

  @ApiPropertyOptional({ example: 'https://centro.mx', nullable: true })
  sitioWebInstitucion?: string | null

  @ApiPropertyOptional({ example: true })
  institucionVerificada?: boolean

  @ApiPropertyOptional({ example: 'owner-uid', nullable: true })
  institucionOwnerId?: string | null
}

export class PaginaVacantesDto extends RespuestaPaginadaDto<VacanteDto> {
  @ApiProperty({ description: 'Vacantes de la página', type: [VacanteDto] })
  datos!: VacanteDto[]
}

export class PostulacionItemDto {
  @ApiProperty({ example: 'post-uid' })
  id!: string

  @ApiProperty({ example: 'vacante-uid' })
  vacanteId!: string

  @ApiProperty({ example: 'user-uid' })
  usuarioId!: string

  @ApiProperty({ example: 'Me interesa este puesto.', nullable: true })
  cartaPresentacion!: string | null

  @ApiProperty({ example: 'pendiente' })
  estado!: string

  @ApiProperty({ example: '2026-08-06T00:00:00.000Z' })
  fechaCreacion!: string

  @ApiPropertyOptional({ example: 'Terapeuta ocupacional', nullable: true })
  titulo?: string | null

  @ApiPropertyOptional({ example: 'presencial', nullable: true })
  modalidad?: string | null

  @ApiPropertyOptional({ example: 'Centro de Rehabilitación', nullable: true })
  nombreInstitucion?: string | null

  @ApiPropertyOptional({ example: 'inst-uid', nullable: true })
  institucionId?: string | null

  @ApiPropertyOptional({ example: 'owner-uid', nullable: true })
  institucionOwnerId?: string | null
}

export class PaginaPostulacionesDto extends RespuestaPaginadaDto<PostulacionItemDto> {
  @ApiProperty({ description: 'Postulaciones de la página', type: [PostulacionItemDto] })
  datos!: PostulacionItemDto[]
}

export class PostulacionCreadaDto {
  @ApiProperty({ example: 'post-uid' })
  id!: string

  @ApiProperty({ example: 'pendiente' })
  estado!: string
}

export class PostulacionEstadoActualizadoDto {
  @ApiProperty({ example: 'post-uid' })
  id!: string

  @ApiProperty({ example: 'aceptada' })
  estado!: string

  @ApiProperty({ example: '2026-08-06T00:00:00.000Z' })
  fechaActualizacion!: string
}

export class PostulanteItemDto {
  @ApiProperty({ example: 'post-uid' })
  id!: string

  @ApiProperty({ example: 'vacante-uid' })
  vacanteId!: string

  @ApiPropertyOptional({ example: 'Terapeuta ocupacional', nullable: true })
  tituloVacante?: string | null

  @ApiPropertyOptional({ example: 'presencial', nullable: true })
  modalidad?: string | null

  @ApiProperty({ example: 'user-uid' })
  usuarioId!: string

  @ApiPropertyOptional({ example: 'María Pérez', nullable: true })
  nombrePostulante?: string | null

  @ApiPropertyOptional({ example: 'maria@correo.mx', nullable: true })
  emailPostulante?: string | null

  @ApiPropertyOptional({ example: 'https://storage.googleapis.com/...', nullable: true })
  urlAvatar?: string | null

  @ApiPropertyOptional({ example: 'Me interesa este puesto.', nullable: true })
  cartaPresentacion?: string | null

  @ApiProperty({ example: 'pendiente' })
  estado!: string

  @ApiPropertyOptional({ example: '2026-08-06T00:00:00.000Z', nullable: true })
  fechaCreacion?: string | null
}

export class PaginaPostulantesInstitucionDto extends RespuestaPaginadaDto<PostulanteItemDto> {
  @ApiProperty({ description: 'Postulantes de la página', type: [PostulanteItemDto] })
  datos!: PostulanteItemDto[]
}

