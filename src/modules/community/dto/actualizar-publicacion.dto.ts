import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsOptional } from 'class-validator'

export class ActualizarPublicacionDto {
  @ApiProperty({ description: 'Nuevo contenido de la publicación', example: 'Contenido actualizado' })
  @IsString() @IsNotEmpty() contenido!: string

  @ApiPropertyOptional({ description: 'URL del contenido multimedia adjunto (imagen/video). Requiere el permiso multimedia activo. Omitir para no modificar el existente.', example: 'https://storage.googleapis.com/.../media.jpg' })
  @IsOptional() @IsString() mediaUrl?: string
}
