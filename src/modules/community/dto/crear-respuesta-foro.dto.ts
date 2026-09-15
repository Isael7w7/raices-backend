import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator'
import { Transform } from 'class-transformer'
import { sanitizeHtml } from '../../../common/utils/sanitize-html'

export class CrearRespuestaForoDto {
  @ApiProperty({ description: 'Índice de la pregunta detonante que se responde (0-based)', example: 0 })
  @IsNumber() @Min(0)
  @Transform(({ value }) => Number(value))
  preguntaIndex!: number

  @ApiProperty({ description: 'Contenido de la respuesta', example: 'En mi experiencia, la capacitación inclusiva es clave.' })
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString() @IsNotEmpty()
  contenido!: string
}
