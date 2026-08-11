import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'
import { Transform } from 'class-transformer'
import { sanitizeHtml } from '../../../common/utils/sanitize-html'

export class PostulacionDto {
  @ApiProperty({ description: 'Carta de presentación', required: false, example: 'Me interesa esta vacante porque...' })
  @Transform(({ value }) => sanitizeHtml(value))
  @IsOptional() @IsString() cartaPresentacion?: string
}
