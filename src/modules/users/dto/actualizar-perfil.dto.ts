import { ApiPropertyOptional } from '@nestjs/swagger'

export class ActualizarPerfilDto {
  @ApiPropertyOptional({
    description: 'Nombre completo del usuario',
    example: 'Juan Pérez López',
  })
  nombreCompleto?: string

  @ApiPropertyOptional({
    description: 'Ciudad de residencia',
    example: 'Mérida',
  })
  ciudad?: string

  @ApiPropertyOptional({
    description: 'Estado o provincia',
    example: 'Yucatán',
  })
  estado?: string

  @ApiPropertyOptional({
    description: 'URL del avatar (se actualiza con POST /avatar)',
    example: 'https://storage.googleapis.com/.../avatar.jpg',
  })
  urlAvatar?: string
}
