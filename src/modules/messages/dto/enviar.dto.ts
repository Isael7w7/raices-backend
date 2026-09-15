import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator'
import { Transform } from 'class-transformer'
import { sanitizeHtml } from '../../../common/utils/sanitize-html'

export class EnviarDto {
  @ApiProperty({ description: 'Contenido del mensaje', example: 'Hola, me gustaría información sobre...' })
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString() @IsNotEmpty() @MaxLength(5000, { message: 'El mensaje no puede exceder 5000 caracteres' }) contenido!: string

  @ApiPropertyOptional({ description: 'URL del contenido multimedia adjunto (imagen/video). Requiere el permiso multimedia activo.', example: 'https://storage.googleapis.com/.../media.jpg' })
  @IsOptional() @IsString() mediaUrl?: string
}
