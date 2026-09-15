import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength } from 'class-validator'
import { Transform } from 'class-transformer'
import { sanitizeHtml } from '../../../common/utils/sanitize-html'

export class ActualizarConfiguracionDto {
  @ApiPropertyOptional({
    description: 'Nombre de la plataforma',
    example: 'Raíces para Florecer',
  })
  @IsOptional()
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString()
  @MaxLength(100, { message: 'El nombre de la plataforma no puede exceder 100 caracteres' })
  nombrePlataforma?: string

  @ApiPropertyOptional({
    description: 'Correo de soporte',
    example: 'soporte@raices.mx',
  })
  @IsOptional()
  @IsString()
  emailSoporte?: string

  @ApiPropertyOptional({
    description: 'Permitir registro de nuevos usuarios',
    example: 'true',
  })
  @IsOptional()
  @IsString()
  permitirRegistro?: string

  @ApiPropertyOptional({
    description: 'Requerir aprobación de nuevas instituciones',
    example: 'true',
  })
  @IsOptional()
  @IsString()
  aprobacionInstitucionRequerida?: string

  @ApiPropertyOptional({
    description: 'Habilitar asistente de IA',
    example: 'true',
  })
  @IsOptional()
  @IsString()
  iaHabilitada?: string

  @ApiPropertyOptional({
    description: 'Modo mantenimiento (deshabilita acceso)',
    example: 'false',
  })
  @IsOptional()
  @IsString()
  modoMantenimiento?: string

  @ApiPropertyOptional({
    description: 'Máximo de reseñas por usuario',
    example: '10',
  })
  @IsOptional()
  @IsString()
  maxResenasPorUsuario?: string

  @ApiPropertyOptional({
    description: 'Ciudad por defecto',
    example: 'Mérida',
  })
  @IsOptional()
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString()
  @MaxLength(100, { message: 'La ciudad no puede exceder 100 caracteres' })
  ciudadPorDefecto?: string
}
