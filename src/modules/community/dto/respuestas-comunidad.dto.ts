import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { RespuestaPaginadaDto } from '../../../common/dto/paginacion.dto'

export class GrupoDto {
  @ApiProperty({ example: 'grupo-uid' }) id!: string
  @ApiProperty({ example: 'Familias TEA Mérida' }) nombre!: string
  @ApiProperty({ example: 'Grupo de apoyo para familias.', nullable: true }) descripcion!: string | null
  @ApiProperty({ example: true }) esPublico!: boolean
  @ApiProperty({ example: false, description: 'Si el grupo es exclusivo para padres/tutores' }) exclusivoPadres!: boolean
  @ApiProperty({ example: 'user-uid' }) creadorId!: string
  @ApiProperty({ example: 15 }) cantidadMiembros!: number
  @ApiProperty({ example: '2026-08-06T00:00:00.000Z' }) fechaCreacion!: string
}

export class PaginaGruposDto extends RespuestaPaginadaDto<GrupoDto> {
  @ApiProperty({ type: [GrupoDto] }) datos!: GrupoDto[]
}

export class PublicacionDto {
  @ApiProperty({ example: 'pub-uid' }) id!: string
  @ApiProperty({ example: 'user-uid' }) autorId!: string
  @ApiProperty({ example: 'Hola comunidad, ¿alguna recomendación?' }) contenido!: string
  @ApiProperty({ example: 'grupo-uid', nullable: true }) grupoId!: string | null
  @ApiProperty({ example: 3 }) cantidadMeGustas!: number
  @ApiProperty({ example: '2026-08-06T00:00:00.000Z' }) fechaCreacion!: string
  @ApiPropertyOptional({ example: 'Juan Pérez' }) nombreCompleto?: string
  @ApiPropertyOptional({ example: 'pcd', nullable: true, description: 'Rol del autor' }) rol?: string | null
  @ApiPropertyOptional({ example: 'Persona con discapacidad', nullable: true, description: 'Etiqueta visual del rol del autor' }) etiquetaRol?: string | null
  @ApiPropertyOptional({ example: 'https://storage.../avatar.jpg', nullable: true }) urlAvatar?: string | null
  @ApiPropertyOptional({ example: false }) usuarioMeGusta?: boolean
  @ApiPropertyOptional({ example: 'https://storage.../media.jpg', nullable: true, description: 'URL del contenido multimedia adjunto, si lo hay' }) mediaUrl?: string | null
  @ApiPropertyOptional({ example: 'arte', nullable: true, description: 'Categoría creativa (solo para espacio Conectemos)' }) categoriaCreativa?: string | null
  @ApiPropertyOptional({ example: false, description: 'Si la publicación es exclusiva para padres/tutores' }) exclusivoPadres?: boolean
}

export class PaginaPublicacionesDto extends RespuestaPaginadaDto<PublicacionDto> {
  @ApiProperty({ type: [PublicacionDto] }) datos!: PublicacionDto[]
}

export class ComentarioDto {
  @ApiProperty({ example: 'com-uid' }) id!: string
  @ApiProperty({ example: 'pub-uid' }) publicacionId!: string
  @ApiProperty({ example: 'user-uid' }) autorId!: string
  @ApiProperty({ example: 'Gracias por compartir.' }) contenido!: string
  @ApiProperty({ example: '2026-08-06T00:00:00.000Z' }) fechaCreacion!: string
  @ApiPropertyOptional({ example: 'Juan Pérez' }) nombreCompleto?: string
  @ApiPropertyOptional({ example: 'pcd', nullable: true, description: 'Rol del autor' }) rol?: string | null
  @ApiPropertyOptional({ example: 'Persona con discapacidad', nullable: true, description: 'Etiqueta visual del rol del autor' }) etiquetaRol?: string | null
  @ApiPropertyOptional({ example: 'https://storage.../avatar.jpg', nullable: true }) urlAvatar?: string | null
}

export class PaginaComentariosDto extends RespuestaPaginadaDto<ComentarioDto> {
  @ApiProperty({ type: [ComentarioDto] }) datos!: ComentarioDto[]
}

export class RespuestaMeGustaDto {
  @ApiProperty({ example: true }) meGusta!: boolean
}

export class RespuestaUnirseDto {
  @ApiPropertyOptional({ example: true }) unido?: boolean
  @ApiPropertyOptional({ example: true }) yaMiembro?: boolean
}

export class RespuestaSalirDto {
  @ApiProperty({ example: true }) salido!: boolean
}

export class EstadisticasComunidadDto {
  @ApiProperty({ example: 12 }) totalGrupos!: number
  @ApiProperty({ example: 90 }) totalPublicaciones!: number
  @ApiProperty({ example: 200 }) totalComentarios!: number
}

export class MiembroDto {
  @ApiProperty({ example: 'uid-123' }) id!: string
  @ApiProperty({ example: 'Juan Pérez' }) nombreCompleto!: string
  @ApiProperty({ example: 'pcd', nullable: true }) rol!: string | null
  @ApiProperty({ example: 'Madre de familia', nullable: true }) profesion!: string | null
  @ApiProperty({ example: 'Mamá de Santiago (8 años, TEA).', nullable: true }) bio!: string | null
  @ApiProperty({ example: 'Mérida', nullable: true }) ciudad!: string | null
  @ApiProperty({ example: 'Yucatán', nullable: true }) estado!: string | null
  @ApiProperty({ example: 'https://storage.../avatar.jpg', nullable: true }) urlAvatar!: string | null
}

export class PaginaMiembrosDto extends RespuestaPaginadaDto<MiembroDto> {
  @ApiProperty({ type: [MiembroDto] }) datos!: MiembroDto[]
}

// ─── Foros Institucionales ─────────────────────────────────────────

export class ForoDto {
  @ApiProperty({ example: 'foro-uid' }) id!: string
  @ApiProperty({ example: 'Estrategias de inclusión laboral' }) titulo!: string
  @ApiProperty({ example: 'Espacio para discutir estrategias.', nullable: true }) descripcion!: string | null
  @ApiProperty({ example: 'inst-uid' }) institucionId!: string
  @ApiProperty({ example: 'user-uid' }) creadorId!: string
  @ApiProperty({ example: ['¿Qué estrategias han funcionado?'], type: [String] }) preguntasDetonantes!: string[]
  @ApiProperty({ example: false, description: 'Si el foro es exclusivo para padres/tutores' }) exclusivoPadres!: boolean
  @ApiProperty({ example: true }) activo!: boolean
  @ApiProperty({ example: '2026-08-27T00:00:00.000Z' }) fechaCreacion!: string
  @ApiPropertyOptional({ example: 'Centro de Rehabilitación', nullable: true, description: 'Nombre de la institución creadora' }) nombreInstitucion?: string | null
}

export class PaginaForosDto extends RespuestaPaginadaDto<ForoDto> {
  @ApiProperty({ type: [ForoDto] }) datos!: ForoDto[]
}

export class RespuestaForoDto {
  @ApiProperty({ example: 'resp-uid' }) id!: string
  @ApiProperty({ example: 'foro-uid' }) foroId!: string
  @ApiProperty({ example: 0, description: 'Índice de la pregunta detonante' }) preguntaIndex!: number
  @ApiProperty({ example: 'user-uid' }) autorId!: string
  @ApiProperty({ example: 'En mi experiencia, la capacitación inclusiva es clave.' }) contenido!: string
  @ApiProperty({ example: '2026-08-27T00:00:00.000Z' }) fechaCreacion!: string
  @ApiPropertyOptional({ example: 'Juan Pérez' }) nombreCompleto?: string
  @ApiPropertyOptional({ example: 'pcd', nullable: true, description: 'Rol del autor' }) rol?: string | null
  @ApiPropertyOptional({ example: 'Persona con discapacidad', nullable: true, description: 'Etiqueta visual del rol del autor' }) etiquetaRol?: string | null
  @ApiPropertyOptional({ example: 'https://storage.../avatar.jpg', nullable: true }) urlAvatar?: string | null
}

export class ForoConRespuestasDto extends ForoDto {
  @ApiProperty({ type: [Object], description: 'Respuestas agrupadas por pregunta detonante' })
  preguntasConRespuestas!: { pregunta: string; respuestas: RespuestaForoDto[] }[]
}
