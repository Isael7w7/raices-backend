import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { Transform } from 'class-transformer'
import { sanitizeHtml } from '../../../common/utils/sanitize-html'
import { CATEGORIAS_EVENTO } from '../../../common/interfaces/firestore-documents.interface'

export class CrearEventoDto {
  @ApiProperty({ description: 'Título del evento', example: 'Taller de arte inclusivo', maxLength: 200 })
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString() @IsNotEmpty({ message: 'El título es obligatorio' })
  @MaxLength(200, { message: 'El título no puede exceder 200 caracteres' })
  titulo!: string

  @ApiPropertyOptional({ description: 'Descripción detallada del evento', example: 'Sesión abierta para crear con materiales reciclados.', maxLength: 5000 })
  @Transform(({ value }) => (value === undefined || value === null ? value : sanitizeHtml(value)))
  @IsOptional() @IsString()
  @MaxLength(5000, { message: 'La descripción no puede exceder 5000 caracteres' })
  descripcion?: string

  @ApiProperty({ description: 'Categoría del evento', enum: CATEGORIAS_EVENTO, example: 'taller' })
  @IsIn([...CATEGORIAS_EVENTO], { message: `La categoría debe ser una de: ${CATEGORIAS_EVENTO.join(', ')}` })
  categoria!: string

  @ApiProperty({ description: 'Fecha y hora de inicio (ISO 8601; acepta también `YYYY-MM-DD`)', example: '2026-10-15T10:00:00.000Z' })
  @IsDateString({}, { message: 'fechaInicio debe ser una fecha ISO 8601 válida' })
  fechaInicio!: string

  @ApiPropertyOptional({ description: 'Fecha y hora de término (ISO 8601). Debe ser posterior al inicio.', example: '2026-10-15T12:00:00.000Z' })
  @IsOptional()
  @IsDateString({}, { message: 'fechaFin debe ser una fecha ISO 8601 válida' })
  fechaFin?: string

  @ApiPropertyOptional({ description: 'Ubicación presencial o enlace virtual', example: 'Auditorio municipal, Mérida', maxLength: 300 })
  @Transform(({ value }) => (value === undefined || value === null ? value : sanitizeHtml(value)))
  @IsOptional() @IsString()
  @MaxLength(300, { message: 'La ubicación no puede exceder 300 caracteres' })
  ubicacion?: string

  @ApiPropertyOptional({ description: 'URL del banner/imagen del evento', example: 'https://storage.googleapis.com/.../banner.jpg', maxLength: 2000 })
  @IsOptional() @IsString()
  @MaxLength(2000, { message: 'La URL de la imagen no puede exceder 2000 caracteres' })
  urlImagen?: string
}
