import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength } from 'class-validator'
import { Transform } from 'class-transformer'
import { sanitizeHtml } from '../../../common/utils/sanitize-html'

export class CrearComentarioDto {
  @ApiProperty({ description: 'Contenido del comentario', example: '¡Gran aporte!' })
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString() @MaxLength(2000, { message: 'El comentario no puede exceder 2000 caracteres' }) contenido!: string
}
