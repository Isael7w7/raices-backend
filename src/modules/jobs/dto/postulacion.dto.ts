import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength } from 'class-validator'
import { Transform } from 'class-transformer'
import { sanitizeHtml } from '../../../common/utils/sanitize-html'

export class PostulacionDto {
  @ApiProperty({ description: 'Carta de presentación', required: false, example: 'Me interesa esta vacante porque...' })
  @Transform(({ value }) => sanitizeHtml(value))
  @IsOptional() @IsString() @MaxLength(5000, { message: 'La carta de presentación no puede exceder 5000 caracteres' }) cartaPresentacion?: string
}
