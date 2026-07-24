import { ApiPropertyOptional } from '@nestjs/swagger'

export class ActualizarConfiguracionDto {
  @ApiPropertyOptional({
    description: 'Nombre de la plataforma',
    example: 'Raíces para Florecer',
  })
  nombrePlataforma?: string

  @ApiPropertyOptional({
    description: 'Correo de soporte',
    example: 'soporte@raices.mx',
  })
  emailSoporte?: string

  @ApiPropertyOptional({
    description: 'Permitir registro de nuevos usuarios',
    example: 'true',
  })
  permitirRegistro?: string

  @ApiPropertyOptional({
    description: 'Requerir aprobación de nuevas instituciones',
    example: 'true',
  })
  aprobacionInstitucionRequerida?: string

  @ApiPropertyOptional({
    description: 'Habilitar asistente de IA',
    example: 'true',
  })
  iaHabilitada?: string

  @ApiPropertyOptional({
    description: 'Modo mantenimiento (deshabilita acceso)',
    example: 'false',
  })
  modoMantenimiento?: string

  @ApiPropertyOptional({
    description: 'Máximo de reseñas por usuario',
    example: '10',
  })
  maxResenasPorUsuario?: string

  @ApiPropertyOptional({
    description: 'Ciudad por defecto',
    example: 'Mérida',
  })
  ciudadPorDefecto?: string
}
