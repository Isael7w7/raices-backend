import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { RespuestaPaginadaDto } from '../../../common/dto/paginacion.dto'

export class GrupoDto {
  @ApiProperty({ example: 'grupo-uid' }) id: string
  @ApiProperty({ example: 'Familias TEA Mérida' }) nombre: string
  @ApiProperty({ example: 'Grupo de apoyo para familias.', nullable: true }) descripcion: string | null
  @ApiProperty({ example: true }) esPublico: boolean
  @ApiProperty({ example: 'user-uid' }) creadorId: string
  @ApiProperty({ example: 15 }) cantidadMiembros: number
  @ApiProperty({ example: '2026-08-06T00:00:00.000Z' }) fechaCreacion: string
}

export class PaginaGruposDto extends RespuestaPaginadaDto<GrupoDto> {
  @ApiProperty({ type: [GrupoDto] }) datos: GrupoDto[]
}

export class PublicacionDto {
  @ApiProperty({ example: 'pub-uid' }) id: string
  @ApiProperty({ example: 'user-uid' }) autorId: string
  @ApiProperty({ example: 'Hola comunidad, ¿alguna recomendación?' }) contenido: string
  @ApiProperty({ example: 'grupo-uid', nullable: true }) grupoId: string | null
  @ApiProperty({ example: 3 }) cantidadMeGustas: number
  @ApiProperty({ example: '2026-08-06T00:00:00.000Z' }) fechaCreacion: string
  @ApiPropertyOptional({ example: 'Juan Pérez' }) nombreCompleto?: string
  @ApiPropertyOptional({ example: 'https://storage.../avatar.jpg', nullable: true }) urlAvatar?: string | null
  @ApiPropertyOptional({ example: false }) usuarioMeGusta?: boolean
}

export class PaginaPublicacionesDto extends RespuestaPaginadaDto<PublicacionDto> {
  @ApiProperty({ type: [PublicacionDto] }) datos: PublicacionDto[]
}

export class ComentarioDto {
  @ApiProperty({ example: 'com-uid' }) id: string
  @ApiProperty({ example: 'pub-uid' }) publicacionId: string
  @ApiProperty({ example: 'user-uid' }) autorId: string
  @ApiProperty({ example: 'Gracias por compartir.' }) contenido: string
  @ApiProperty({ example: '2026-08-06T00:00:00.000Z' }) fechaCreacion: string
  @ApiPropertyOptional({ example: 'Juan Pérez' }) nombreCompleto?: string
  @ApiPropertyOptional({ example: 'https://storage.../avatar.jpg', nullable: true }) urlAvatar?: string | null
}

export class PaginaComentariosDto extends RespuestaPaginadaDto<ComentarioDto> {
  @ApiProperty({ type: [ComentarioDto] }) datos: ComentarioDto[]
}

export class RespuestaMeGustaDto {
  @ApiProperty({ example: true }) meGusta: boolean
}

export class RespuestaUnirseDto {
  @ApiPropertyOptional({ example: true }) unido?: boolean
  @ApiPropertyOptional({ example: true }) yaMiembro?: boolean
}

export class RespuestaSalirDto {
  @ApiProperty({ example: true }) salido: boolean
}

export class EstadisticasComunidadDto {
  @ApiProperty({ example: 12 }) totalGrupos: number
  @ApiProperty({ example: 90 }) totalPublicaciones: number
  @ApiProperty({ example: 200 }) totalComentarios: number
}

export class MiembroDto {
  @ApiProperty({ example: 'uid-123' }) id: string
  @ApiProperty({ example: 'Juan Pérez' }) nombreCompleto: string
  @ApiProperty({ example: 'pcd', nullable: true }) rol: string | null
  @ApiProperty({ example: 'Madre de familia', nullable: true }) profesion: string | null
  @ApiProperty({ example: 'Mamá de Santiago (8 años, TEA).', nullable: true }) bio: string | null
  @ApiProperty({ example: 'Mérida', nullable: true }) ciudad: string | null
  @ApiProperty({ example: 'Yucatán', nullable: true }) estado: string | null
  @ApiProperty({ example: 'https://storage.../avatar.jpg', nullable: true }) urlAvatar: string | null
}

export class PaginaMiembrosDto extends RespuestaPaginadaDto<MiembroDto> {
  @ApiProperty({ type: [MiembroDto] }) datos: MiembroDto[]
}
