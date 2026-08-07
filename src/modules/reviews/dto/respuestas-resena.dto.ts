import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { RespuestaPaginadaDto } from '../../../common/dto/paginacion.dto'

export class ResenaDto {
  @ApiProperty({ example: 'resena-uid' })
  id!: string

  @ApiProperty({ example: 4 })
  calificacion!: number

  @ApiProperty({ example: 'Excelente atención.', nullable: true })
  comentario!: string | null

  @ApiProperty({ example: '2026-08-06T00:00:00.000Z' })
  fechaCreacion!: string

  @ApiPropertyOptional({ example: 'Juan Pérez', nullable: true })
  nombreCompleto?: string | null

  @ApiPropertyOptional({ example: 'https://storage.../avatar.jpg', nullable: true })
  urlAvatar?: string | null

  @ApiPropertyOptional({ example: 'Centro de Rehabilitación', nullable: true })
  nombreInstitucion?: string | null

  @ApiPropertyOptional({ example: 'funcional', nullable: true })
  categoria?: string | null
}

export class PaginaResenasDto extends RespuestaPaginadaDto<ResenaDto> {
  @ApiProperty({ description: 'Reseñas de la página', type: [ResenaDto] })
  datos!: ResenaDto[]
}

export class ResenaGuardadaDto {
  @ApiProperty({ example: 'resena-uid' })
  id!: string

  @ApiProperty({ example: 'user-uid' })
  usuarioId!: string

  @ApiProperty({ example: 'inst-uid' })
  institucionId!: string

  @ApiProperty({ example: 4 })
  calificacion!: number

  @ApiProperty({ example: 'Excelente atención.', nullable: true })
  comentario!: string | null

  @ApiProperty({ example: '2026-08-06T00:00:00.000Z' })
  fechaCreacion!: string
}

