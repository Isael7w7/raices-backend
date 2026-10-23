import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

/** Decisión del administrador sobre una publicación rechazada por la moderación. */
export class ResolverPublicacionDto {
  @ApiProperty({
    description: 'aprobar: la publicación pasa a ser visible en el feed. rechazar: se confirma el rechazo y permanece oculta.',
    enum: ['aprobar', 'rechazar'],
    example: 'aprobar',
  })
  @IsIn(['aprobar', 'rechazar'], { message: 'La decisión debe ser "aprobar" o "rechazar"' })
  decision!: 'aprobar' | 'rechazar'

  @ApiPropertyOptional({
    description: 'Nota del administrador (se registra como razón de la decisión y en auditoría)',
    example: 'El contenido es pertinente para la comunidad a pesar del falso positivo.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'La nota no puede estar vacía' })
  @MaxLength(500, { message: 'La nota no puede exceder 500 caracteres' })
  nota?: string
}
