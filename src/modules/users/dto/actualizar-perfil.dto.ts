import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

export class ActualizarPerfilDto {
  @ApiPropertyOptional({
    description: 'Nombre completo del usuario',
    example: 'Juan Pérez López',
  })
  @IsOptional()
  @IsString()
  nombreCompleto?: string

  @ApiPropertyOptional({
    description: 'Ciudad de residencia',
    example: 'Mérida',
  })
  @IsOptional()
  @IsString()
  ciudad?: string

  @ApiPropertyOptional({
    description: 'Estado o provincia',
    example: 'Yucatán',
  })
  @IsOptional()
  @IsString()
  estado?: string

  @ApiPropertyOptional({
    description: 'URL del avatar (se actualiza con POST /avatar)',
    example: 'https://storage.googleapis.com/.../avatar.jpg',
  })
  @IsOptional()
  @IsString()
  urlAvatar?: string
}
