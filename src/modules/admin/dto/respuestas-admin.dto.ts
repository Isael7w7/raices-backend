import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { RespuestaPaginadaDto } from '../../../common/dto/paginacion.dto'

export class EstadisticasDto {
  @ApiProperty({ example: 120 }) totalUsuarios!: number
  @ApiProperty({ example: 80 }) usuariosActivos!: number
  @ApiProperty({ example: 45 }) totalInstituciones!: number
  @ApiProperty({ example: 30 }) institucionesVerificadas!: number
  @ApiProperty({ example: 8 }) aprobacionPendiente!: number
  @ApiProperty({ example: 250 }) totalResenas!: number
  @ApiProperty({ example: 90 }) totalPublicaciones!: number
  @ApiProperty({ example: 12 }) totalGrupos!: number
  @ApiProperty({ example: 4.2, nullable: true }) calificacionPromedio!: number | null
  @ApiProperty({ example: 60 }) perfilesCompletados!: number
}

export class SerieMesDto {
  @ApiProperty({ example: '2026-07' }) mes!: string
  @ApiProperty({ example: 12 }) cantidad!: number
}

export class SerieRolDto {
  @ApiProperty({ example: 'pcd' }) rol!: string
  @ApiProperty({ example: 50 }) cantidad!: number
}

export class SerieCategoriaDto {
  @ApiProperty({ example: 'funcional' }) categoria!: string
  @ApiProperty({ example: 'Salud y terapias' }) etiqueta!: string
  @ApiProperty({ example: 20 }) cantidad!: number
}

export class SerieCalificacionDto {
  @ApiProperty({ example: 4 }) calificacion!: number
  @ApiProperty({ example: 60 }) cantidad!: number
}

export class MejorInstitucionDto {
  @ApiProperty({ example: 'inst-uid' }) id!: string
  @ApiProperty({ example: 'Centro de Rehabilitación' }) nombre!: string
  @ApiProperty({ example: 'funcional' }) categoria!: string
  @ApiProperty({ example: 4.8 }) calificacionPromedio!: number
  @ApiProperty({ example: 25 }) cantidadCalificaciones!: number
  @ApiProperty({ example: true }) verificada!: boolean
}

export class SerieCiudadDto {
  @ApiProperty({ example: 'Mérida' }) ciudad!: string
  @ApiProperty({ example: 15 }) cantidad!: number
}

export class AnaliticasDto {
  @ApiProperty({ type: [SerieMesDto] }) registrosPorMes!: SerieMesDto[]
  @ApiProperty({ type: [SerieRolDto] }) distribucionRoles!: SerieRolDto[]
  @ApiProperty({ type: [SerieCategoriaDto] }) institucionesPorCategoria!: SerieCategoriaDto[]
  @ApiProperty({ type: [SerieCalificacionDto] }) distribucionCalificaciones!: SerieCalificacionDto[]
  @ApiProperty({ type: [MejorInstitucionDto] }) mejoresInstituciones!: MejorInstitucionDto[]
  @ApiProperty({ type: [SerieMesDto] }) actividadComunitaria!: SerieMesDto[]
  @ApiProperty({ type: [SerieCiudadDto] }) institucionesPorCiudad!: SerieCiudadDto[]
}

export class CoberturaDiscapacidadDto {
  @ApiProperty({ example: 'tea' }) tipo!: string
  @ApiProperty({ example: 'TEA / Autismo' }) etiqueta!: string
  @ApiProperty({ example: 30 }) demanda!: number
  @ApiProperty({ example: 12 }) oferta!: number
  @ApiProperty({ example: 0.4, nullable: true }) relacion!: number | null
  @ApiProperty({ example: 'critica' }) estado!: string
}

export class DemandaNecesidadDto {
  @ApiProperty({ example: 'comunicacion' }) necesidad!: string
  @ApiProperty({ example: 22 }) cantidad!: number
}

export class DemandaMetaDto {
  @ApiProperty({ example: 'integracion_social' }) meta!: string
  @ApiProperty({ example: 18 }) cantidad!: number
}

export class DemandaEtapaDto {
  @ApiProperty({ example: 'adulto' }) etapa!: string
  @ApiProperty({ example: 40 }) cantidad!: number
}

export class DemandaAreaDto {
  @ApiProperty({ example: 'familia' }) area!: string
  @ApiProperty({ example: 14 }) cantidad!: number
}

export class PercepcionDto {
  @ApiProperty({ example: 'brecha_cobertura' }) tipo!: string
  @ApiProperty({ example: 'alta' }) severidad!: string
  @ApiProperty({ example: 'Cobertura crítica en...' }) texto!: string
}

export class NecesidadesInteligenciaDto {
  @ApiProperty({ example: '2026-08-06T00:00:00.000Z' }) generadoEn!: string
  @ApiProperty({ example: 100 }) totalPerfiles!: number
  @ApiProperty({ example: 40 }) totalInstituciones!: number
  @ApiProperty({ type: [CoberturaDiscapacidadDto] }) cobertura!: CoberturaDiscapacidadDto[]
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'object' } },
    description: 'Demanda por necesidad, meta, etapa de vida y área de apoyo',
  })
  demanda!: {
    necesidades: DemandaNecesidadDto[]
    metas: DemandaMetaDto[]
    etapasVida: DemandaEtapaDto[]
    areasApoyo: DemandaAreaDto[]
  }
  @ApiProperty({ type: [PercepcionDto] }) percepciones!: PercepcionDto[]
}

export class VisitantesActivosDto {
  @ApiProperty({ example: 3 }) personasActivas!: number
  @ApiProperty({ example: 5 }) promedioDiario!: number
  @ApiProperty({ example: 4 }) promedioSemanal!: number
  @ApiProperty({ example: 10 }) promedioMensual!: number
  @ApiProperty({ example: [25, 45, 48], type: [Number] }) historialMinutos!: number[]
}

export class InstitucionAdminDto {
  @ApiProperty({ example: 'inst-uid' }) id!: string
  @ApiProperty({ example: 'Centro de Rehabilitación' }) nombre!: string
  @ApiProperty({ example: 'funcional' }) categoria!: string
  @ApiProperty({ example: 'Mérida' }) ciudad!: string
  @ApiProperty({ example: true }) activa!: boolean
  @ApiProperty({ example: false }) verificada!: boolean
  @ApiProperty({ example: 4.2 }) calificacionPromedio!: number
  @ApiProperty({ example: 12 }) cantidadCalificaciones!: number
  @ApiProperty({ example: '2026-08-06T00:00:00.000Z' }) fechaCreacion!: string
}

export class PaginaInstitucionesAdminDto extends RespuestaPaginadaDto<InstitucionAdminDto> {
  @ApiProperty({ type: [InstitucionAdminDto] }) datos!: InstitucionAdminDto[]
}

export class UsuarioAdminDto {
  @ApiProperty({ example: 'uid-123' }) id!: string
  @ApiProperty({ example: 'usuario@correo.mx' }) email!: string
  @ApiProperty({ example: 'Juan Pérez' }) nombreCompleto!: string
  @ApiProperty({ example: 'pcd' }) rol!: string
  @ApiProperty({ example: 'Mérida', nullable: true }) ciudad!: string | null
  @ApiProperty({ example: true }) activo!: boolean
  @ApiProperty({ example: false }) verificado!: boolean
  @ApiProperty({ example: '2026-08-06T00:00:00.000Z' }) fechaCreacion!: string
}

export class PaginaUsuariosAdminDto extends RespuestaPaginadaDto<UsuarioAdminDto> {
  @ApiProperty({ type: [UsuarioAdminDto] }) datos!: UsuarioAdminDto[]
}

export class ResenaAdminDto {
  @ApiProperty({ example: 'resena-uid' }) id!: string
  @ApiProperty({ example: 4 }) calificacion!: number
  @ApiProperty({ example: 'Excelente atención.', nullable: true }) comentario!: string | null
  @ApiProperty({ example: '2026-08-06T00:00:00.000Z' }) fechaCreacion!: string
  @ApiProperty({ example: 'Juan Pérez', nullable: true }) nombreUsuario!: string | null
  @ApiProperty({ example: 'usuario@correo.mx', nullable: true }) emailUsuario!: string | null
  @ApiProperty({ example: 'Centro de Rehabilitación', nullable: true }) nombreInstitucion!: string | null
}

export class PaginaResenasAdminDto extends RespuestaPaginadaDto<ResenaAdminDto> {
  @ApiProperty({ type: [ResenaAdminDto] }) datos!: ResenaAdminDto[]
}

export class RespuestaToggleUsuarioDto {
  @ApiProperty({ example: false }) activo!: boolean
}

export class RespuestaToggleVerificacionDto {
  @ApiProperty({ example: true }) verificada!: boolean
}

export class RespuestaRolDto {
  @ApiProperty({ example: 'tutor' }) rol!: string
}

export class AlertaDto {
  @ApiProperty({ example: 'rating-risk-inst-1' }) id!: string
  @ApiProperty({ example: 'critica' }) severidad!: string
  @ApiProperty({ example: 'rating_risk' }) tipo!: string
  @ApiProperty({ example: 'Calificación crítica: Centro X' }) titulo!: string
  @ApiProperty({ example: 'Promedio de 2.1/5 con 5 reseñas.' }) descripcion!: string
  @ApiProperty({ example: 'Ver institución' }) accion!: string
  @ApiProperty({ example: 'institution' }) tipoEntidad!: string
  @ApiPropertyOptional({ example: 'inst-uid' }) idEntidad?: string
}

/**
 * Configuración de la plataforma como mapa clave-valor (nombre, correo de soporte,
 * flags de registro/mantenimiento, etc.). Los decoradores no son válidos sobre
 * index signatures; OpenAPI lo documenta como object.
 */
export class ConfiguracionDto {
  [clave: string]: string
}

export class VerificacionIdentidadInstitucionDto {
  @ApiProperty({ example: 'inst-uid' }) institucionId!: string
  @ApiProperty({ example: 'Centro de Rehabilitación', nullable: true }) nombreInstitucion!: string | null
  @ApiProperty({
    type: 'object',
    properties: {
      usuarioId: { type: 'string', example: 'uid-123' },
      nombre: { type: 'string', example: 'Juan Pérez', nullable: true },
      email: { type: 'string', example: 'juan@test.com', nullable: true },
      curp: { type: 'string', example: 'GAPL800101HMCYRL09', nullable: true },
    },
    nullable: true,
  })
  representante!: { usuarioId: string; nombre: string | null; email: string | null; curp: string | null } | null
  @ApiProperty({
    type: 'object',
    properties: {
      estado: { type: 'string', example: 'aprobado', enum: ['sin_documentos', 'pendiente', 'aprobado', 'rechazado'] },
      tieneCurp: { type: 'boolean', example: true },
      tieneIdentificacion: { type: 'boolean', example: true },
      puedeAprobarse: { type: 'boolean', example: true },
      motivo: { type: 'string', example: null, nullable: true, description: 'Razón por la que no puede aprobarse (si aplica)' },
    },
  })
  verificacionIdentidad!: {
    estado: string
    tieneCurp: boolean
    tieneIdentificacion: boolean
    puedeAprobarse: boolean
    motivo: string | null
  }
  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        tipo: { type: 'string', enum: ['curp', 'identificacion_oficial'] },
        estado: { type: 'string', enum: ['pendiente', 'aprobado', 'rechazado'] },
        motivoRechazo: { type: 'string', nullable: true },
        fechaSubida: { type: 'string', nullable: true },
        fechaRevision: { type: 'string', nullable: true },
      },
    },
  })
  documentos!: { id: string; tipo: string; estado: string; motivoRechazo: string | null; fechaSubida: string | null; fechaRevision: string | null }[]
}
