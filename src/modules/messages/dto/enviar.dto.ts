import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsNotEmpty } from 'class-validator'

export class EnviarDto {
  @ApiProperty({ description: 'Contenido del mensaje', example: 'Hola, me gustaría información sobre...' })
  @IsString() @IsNotEmpty() contenido: string
}
