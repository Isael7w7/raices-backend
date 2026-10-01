import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsEmail, MaxLength } from 'class-validator'
import { Transform } from 'class-transformer'
import { sanitizeHtml } from '../../../common/utils/sanitize-html'

/**
 * Actualización parcial de los datos básicos de un usuario desde el
 * panel de administración (modal "Editar usuario").
 * Todos los campos son opcionales: solo se modifican los enviados.
 */
export class ActualizarUsuarioDto {
  @ApiPropertyOptional({ description: 'Nombre completo', example: 'Juan Pérez' })
  @IsOptional()
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString()
  @MaxLength(100, { message: 'El nombre completo no puede exceder 100 caracteres' })
  nombreCompleto?: string

  @ApiPropertyOptional({ description: 'Nombre (se combina con apellido si no se envía nombreCompleto)', example: 'Juan' })
  @IsOptional()
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString()
  @MaxLength(50, { message: 'El nombre no puede exceder 50 caracteres' })
  nombre?: string

  @ApiPropertyOptional({ description: 'Apellido (se combina con nombre si no se envía nombreCompleto)', example: 'Pérez' })
  @IsOptional()
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString()
  @MaxLength(50, { message: 'El apellido no puede exceder 50 caracteres' })
  apellido?: string

  @ApiPropertyOptional({ description: 'Correo electrónico', example: 'usuario@correo.mx' })
  @IsOptional()
  @IsEmail({}, { message: 'Correo electrónico inválido' })
  email?: string
}
