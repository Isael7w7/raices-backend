import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

export class ActualizarConfiguracionDto {
  @ApiPropertyOptional({
    description: 'Nombre de la plataforma',
    example: 'Raíces para Florecer',
  })
  @IsOptional()
  @IsString()
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
  @IsString()
  ciudadPorDefecto?: string
}
