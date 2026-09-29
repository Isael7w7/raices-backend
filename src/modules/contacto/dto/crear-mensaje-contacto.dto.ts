import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'

/** Roles de quien escribe: permite dirigir la respuesta del equipo. */
export const ASUNTO_CONTACTO = ['consulta', 'institucion', 'empresa', 'soporte', 'otro'] as const
export type AsuntoContacto = (typeof ASUNTO_CONTACTO)[number]

export class CrearMensajeContactoDto {
  @ApiProperty({ example: 'ana.perez@correo.mx', description: 'Correo para responder el mensaje' })
  @IsEmail({}, { message: 'El correo electrónico no tiene un formato válido' })
  email!: string

  @ApiProperty({ example: 'Ana Pérez', minLength: 3, maxLength: 80, description: 'Nombre de la persona que escribe' })
  @IsString()
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  @MaxLength(80)
  nombre!: string

  @ApiProperty({ enum: ASUNTO_CONTACTO, example: 'consulta', description: 'Motivo del contacto' })
  @IsIn(ASUNTO_CONTACTO, { message: 'Selecciona un motivo válido' })
  asunto!: AsuntoContacto

  @ApiProperty({
    example: 'Mi hijo tiene 8 años y necesitamos orientación sobre escuelas inclusivas…',
    minLength: 20,
    maxLength: 2000,
    description: 'Mensaje (mínimo 20 caracteres para que aporte contexto)',
  })
  @IsString()
  @MinLength(20, { message: 'El mensaje debe tener al menos 20 caracteres' })
  @MaxLength(2000, { message: 'El mensaje no puede exceder 2000 caracteres' })
  mensaje!: string

  @ApiPropertyOptional({ example: 'false', description: 'Consentimiento explícito para ser contactado ( debe enviarse como true )' })
  @IsOptional()
  @IsIn([true, 'true'], { message: 'Debes aceptar ser contactado para enviar el mensaje' })
  aceptoContacto?: boolean | 'true'
}
