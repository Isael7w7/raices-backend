import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class RespuestaChatDto {
  @ApiProperty({ example: 'Te recomiendo explorar las instituciones de la categoría funcional en tu ciudad.' })
  respuesta: string

  @ApiProperty({ description: 'true si la respuesta es simulada (sin API key o fallo)', example: false })
  simulado: boolean
}

export class SugerenciaInstitucionDto {
  @ApiProperty({ example: 'Terapia' }) categoria: string
  @ApiProperty({ example: 'Evaluación diagnóstica' }) razon: string
}

export class RespuestaRecomendacionDto {
  @ApiProperty({ example: ['Agenda una evaluación diagnóstica', 'Completa tu perfil', 'Explora la comunidad'], type: [String] })
  proximosPasos: string[]

  @ApiProperty({ example: 'Sin diagnóstico registrado — prioridad: evaluación (modo demo)' })
  razonamiento: string

  @ApiPropertyOptional({ type: [SugerenciaInstitucionDto] })
  sugerenciasInstitucion?: SugerenciaInstitucionDto[]

  @ApiProperty({ example: false })
  simulado: boolean
}
