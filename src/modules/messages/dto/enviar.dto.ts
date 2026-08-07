import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsOptional } from 'class-validator'

export class EnviarDto {
  @ApiProperty({ description: 'Contenido del mensaje', example: 'Hola, me gustaría información sobre...' })
  @IsString() @IsNotEmpty() contenido!: string

  @ApiPropertyOptional({ description: 'URL del contenido multimedia adjunto (imagen/video). Requiere el permiso multimedia activo.', example: 'https://storage.googleapis.com/.../media.jpg' })
  @IsOptional() @IsString() mediaUrl?: string
}
