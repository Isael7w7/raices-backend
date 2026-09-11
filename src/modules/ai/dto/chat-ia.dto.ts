import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsArray, IsOptional, MaxLength } from 'class-validator'
import { Transform } from 'class-transformer'
import { sanitizeHtml, sanitizeObject } from '../../../common/utils/sanitize-html'

export class ChatIaDto {
  @ApiProperty({ description: 'Mensaje del usuario', example: 'Que instituciones hay para autismo en Merida?' })
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString() @MaxLength(2000, { message: 'El mensaje no puede exceder 2000 caracteres' }) mensaje!: string

  @ApiProperty({ description: 'Historial de conversación previa', required: false, type: [Object] })
  @IsOptional() @IsArray()
  @Transform(({ value }) => sanitizeObject(value))
  historial?: { role: string; content: string }[]
}
