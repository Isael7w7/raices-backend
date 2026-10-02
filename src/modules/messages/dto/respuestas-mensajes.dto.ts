import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class PerfilSocioDto {
  @ApiProperty({ example: 'user-uid' }) id!: string
  @ApiPropertyOptional({ example: 'Juan Pérez', description: 'Se omite cuando el socio es un usuario eliminado (ver `isDeleted`) para no exponer datos de cuentas dadas de baja.' }) nombreCompleto?: string
  @ApiPropertyOptional({ example: 'https://storage.../avatar.jpg', nullable: true }) urlAvatar?: string | null
}

export class ConversacionDto {
  @ApiProperty({ type: PerfilSocioDto }) socio!: PerfilSocioDto
  @ApiProperty({ example: 'Hola, ¿estás disponible?' }) ultimoMensaje!: string
  @ApiProperty({ example: '2026-08-06T00:00:00.000Z', nullable: true }) ultimoEn!: string | null
  @ApiProperty({ example: 2 }) noLeidos!: number
  @ApiProperty({
    example: false,
    description: '`true` cuando el socio es un "usuario fantasma": su perfil ya no existe en la base de datos o su cuenta fue eliminada/desactivada. El historial se conserva intacto, solo se marca para que el cliente muestre "Usuario Eliminado" y bloquee el envío.',
  }) isDeleted!: boolean
  @ApiProperty({ example: true, description: 'Alias semántico de `isDeleted`: `false` cuando el destinatario ya no está disponible.' }) destinatarioActivo!: boolean
}

export class EliminarConversacionDto {
  @ApiProperty({ example: true }) exito!: boolean
  @ApiProperty({ example: 'Conversación eliminada' }) mensaje!: string
  @ApiProperty({ example: 42, description: 'Cantidad de mensajes ocultos para el usuario que solicitó la eliminación.' }) eliminados!: number
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
