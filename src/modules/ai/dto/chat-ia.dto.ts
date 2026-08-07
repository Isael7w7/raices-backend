import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsArray, IsOptional } from 'class-validator'

export class ChatIaDto {
  @ApiProperty({ description: 'Mensaje del usuario', example: 'Que instituciones hay para autismo en Merida?' })
  @IsString() mensaje!: string

  @ApiProperty({ description: 'Historial de conversación previa', required: false, type: [Object] })
  @IsOptional() @IsArray() historial?: { role: string; content: string }[]
}
