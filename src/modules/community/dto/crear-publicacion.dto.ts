import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsOptional, IsIn, IsBoolean } from 'class-validator'
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

  @ApiPropertyOptional({ description: 'Categoría creativa para el espacio Conectemos (solo para contenido de PCD)', enum: ['arte', 'dibujo', 'historia', 'general'], example: 'arte' })
  @IsOptional() @IsIn(['arte', 'dibujo', 'historia', 'general']) categoriaCreativa?: string

  @ApiPropertyOptional({ description: 'Si la publicación es exclusiva para padres/tutores', default: false })
  @IsOptional() @IsBoolean() exclusivoPadres?: boolean
}
