import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class PerfilSocioDto {
  @ApiProperty({ example: 'user-uid' }) id!: string
  @ApiPropertyOptional({ example: 'Juan Pérez' }) nombreCompleto?: string
  @ApiPropertyOptional({ example: 'https://storage.../avatar.jpg', nullable: true }) urlAvatar?: string | null
}

export class ConversacionDto {
  @ApiProperty({ type: PerfilSocioDto }) socio!: PerfilSocioDto
  @ApiProperty({ example: 'Hola, ¿estás disponible?' }) ultimoMensaje!: string
  @ApiProperty({ example: '2026-08-06T00:00:00.000Z', nullable: true }) ultimoEn!: string | null
  @ApiProperty({ example: 2 }) noLeidos!: number
}

export class MensajeDto {
  @ApiProperty({ example: 'msg-uid' }) id!: string
  @ApiProperty({ example: 'remitente-uid' }) remitenteId!: string
  @ApiProperty({ example: 'destinatario-uid' }) destinatarioId!: string
  @ApiProperty({ example: 'Hola, ¿estás disponible?' }) contenido!: string
  @ApiPropertyOptional({ example: 'https://storage.../media.jpg', nullable: true, description: 'URL del contenido multimedia adjunto, si lo hay' }) mediaUrl?: string | null
  @ApiProperty({ example: false }) leido!: boolean
  @ApiProperty({ example: '2026-08-06T00:00:00.000Z' }) fechaCreacion!: string
}

/**
 * Respuesta del borrado lógico de una conversación: la conversación se
 * oculta SOLO para el usuario que la borra (el socio conserva su historial).
 * Si llega un mensaje nuevo posterior al borrado, la conversación reaparece.
 */
export class RespuestaOcultarConversacionDto {
  @ApiProperty({ example: true, description: 'true si la conversación quedó oculta para el usuario actual' })
  ocultado!: boolean

  @ApiProperty({ example: 'user-uid', description: 'Socio de la conversación borrada' })
  socioId!: string
}
