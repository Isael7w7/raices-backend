import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsArray, IsOptional } from 'class-validator'
import { Transform, Type } from 'class-transformer'
import { sanitizeHtml, sanitizeObject } from '../../../common/utils/sanitize-html'

export class ChatIaDto {
  @ApiProperty({ description: 'Mensaje del usuario', example: 'Que instituciones hay para autismo en Merida?' })
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString() mensaje!: string

  @ApiProperty({ description: 'Historial de conversación previa', required: false, type: [Object] })
  @IsOptional() @IsArray()
  @Transform(({ value }) => sanitizeObject(value))
  historial?: { role: string; content: string }[]
}
