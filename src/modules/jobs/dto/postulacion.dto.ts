import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

export class PostulacionDto {
  @ApiProperty({ description: 'Carta de presentación', required: false, example: 'Me interesa esta vacante porque...' })
  @IsOptional() @IsString() cartaPresentacion?: string
}
