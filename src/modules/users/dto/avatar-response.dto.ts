import { ApiProperty } from '@nestjs/swagger'

/**
 * Datos del avatar actualizado.
 */
export class AvatarDatosDto {
  @ApiProperty({ description: 'URL del avatar actualizado', example: 'https://storage.googleapis.com/avatars/user-photo.jpg' })
  urlAvatar: string
}

/**
 * DTO de respuesta para PUT/POST /avatar.
 */
export class ActualizarAvatarResponseDto {
  @ApiProperty({ description: 'Indica si la operación fue exitosa', example: true })
  exito: boolean

  @ApiProperty({ description: 'Mensaje descriptivo de la operación', example: 'Avatar actualizado correctamente' })
  mensaje: string

  @ApiProperty({ description: 'Datos del avatar actualizado', type: AvatarDatosDto })
  datos: AvatarDatosDto
}

/**
 * DTO de respuesta para DELETE /avatar.
 */
export class EliminarAvatarResponseDto {
  @ApiProperty({ description: 'Indica si la operación fue exitosa', example: true })
  exito: boolean

  @ApiProperty({ description: 'Mensaje descriptivo de la operación', example: 'Avatar eliminado correctamente' })
  mensaje: string
}
