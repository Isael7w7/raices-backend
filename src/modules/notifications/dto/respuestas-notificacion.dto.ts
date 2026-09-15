import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class NotificacionDto {
  @ApiProperty({ example: 'notif-uid' }) id!: string
  @ApiProperty({ example: 'user-uid' }) usuarioId!: string
  @ApiProperty({ example: 'institucion_aprobada' }) tipo!: string
  @ApiProperty({ example: 'Tu institución fue aprobada' }) titulo!: string
  @ApiProperty({ example: 'Ya puedes publicar vacantes.' }) cuerpo!: string
  @ApiPropertyOptional({ example: 'inst-uid', nullable: true }) referenciaId?: string | null
  @ApiProperty({ example: false }) leida!: boolean
  @ApiProperty({ example: '2026-08-06T00:00:00.000Z' }) fechaCreacion!: string
}
