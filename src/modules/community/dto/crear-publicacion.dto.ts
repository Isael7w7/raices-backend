import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsOptional } from 'class-validator'
import { Transform } from 'class-transformer'
import { sanitizeHtml } from '../../../common/utils/sanitize-html'

export class CrearPublicacionDto {
  @ApiProperty({ description: 'Contenido de la publicación', example: '¡Hola comunidad!' })
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString() contenido!: string

  @ApiProperty({ description: 'ID del grupo (opcional)', required: false })
  @IsOptional() @IsString() grupoId?: string

  @ApiPropertyOptional({ description: 'URL del contenido multimedia adjunto (imagen/video). Requiere el permiso multimedia activo.', example: 'https://storage.googleapis.com/.../media.jpg' })
  @IsOptional() @IsString() mediaUrl?: string
}
