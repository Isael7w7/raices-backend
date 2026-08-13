import { IsEmail, IsString, MinLength, IsIn, IsOptional, IsArray, Length } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class RegisterDto {
  @ApiProperty({ description: 'Correo electrónico del usuario', example: 'usuario@correo.mx' })
  @IsEmail() email!: string
  @ApiProperty({ description: 'Contraseña (mínimo 6 caracteres)', example: 'MiPassword123' })
  @IsString() @MinLength(6) password!: string
  @ApiProperty({ description: 'Nombre completo', example: 'Juan Pérez' })
  @IsString() nombreCompleto!: string
  @ApiProperty({ description: 'Rol del usuario', enum: ['pcd', 'tutor', 'institucion'] })
  @IsIn(['pcd', 'tutor', 'institucion']) rol!: string
  @ApiPropertyOptional({ description: 'Ciudad', example: 'Mérida' })
  @IsOptional() @IsString() ciudad?: string
  @ApiPropertyOptional({ description: 'Estado', example: 'Yucatán' })
  @IsOptional() @IsString() estado?: string
  @ApiPropertyOptional({ description: 'Categoría de la institución (obligatoria si rol = institucion)', example: 'funcional', enum: ['funcional', 'educativo', 'laboral', 'social'] })
  @IsOptional() @IsIn(['funcional', 'educativo', 'laboral', 'social']) categoria?: string
  @ApiPropertyOptional({ description: 'Descripción de la institución', example: 'Terapias físicas y ocupacionales para personas con discapacidad.' })
  @IsOptional() @IsString() descripcion?: string
  @ApiPropertyOptional({ description: 'Teléfono de contacto de la institución', example: '9999990001' })
  @IsOptional() @IsString() telefono?: string
  @ApiPropertyOptional({ description: 'Tipos de discapacidad que atiende la institución', example: ['tea', 'motriz'], type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true }) tiposDiscapacidad?: string[]
  @ApiPropertyOptional({ description: 'ID del tutor si esta PCD está vinculada a un tutor', example: 'tutor-demo-uid' })
  @IsOptional() @IsString() tutorId?: string
  @ApiPropertyOptional({ description: 'Banderas de funcionalidades (por defecto todas activas)' })
  @IsOptional() features?: Record<string, boolean>
  @ApiPropertyOptional({ description: 'Profesión o rol descriptivo del usuario', example: 'Madre de familia' })
  @IsOptional() @IsString() profesion?: string
  @ApiPropertyOptional({ description: 'Biografía corta del usuario', example: 'Mamá de Santiago (8 años, TEA).' })
  @IsOptional() @IsString() bio?: string

  // ═══════════════════════════════════════════════════════════════════
  // Campos requeridos por el Especificación Funcional MVP Raíces
  // ═══════════════════════════════════════════════════════════════════

  @ApiPropertyOptional({
    description: 'Para quién se realiza el registro (destinatario del perfil)',
    enum: ['para_mi', 'para_hijo', 'para_familiar', 'para_cuidado'],
    example: 'para_hijo',
  })
  @IsOptional()
  @IsIn(['para_mi', 'para_hijo', 'para_familiar', 'para_cuidado'])
  destinatarioRegistro?: string

  @ApiPropertyOptional({
    description: 'CURP del usuario (18 caracteres alfanuméricos, formato oficial mexicano)',
    example: 'GAPL800101MCYRL093',
  })
  @IsOptional()
  @IsString()
  @Length(18, 18, { message: 'La CURP debe tener exactamente 18 caracteres' })
  curp?: string

  @ApiPropertyOptional({
    description: 'Teléfono o WhatsApp de contacto del usuario',
    example: '9991234567',
  })
  @IsOptional()
  @IsString()
  telefonoContacto?: string

  @ApiPropertyOptional({
    description: 'Preferencia de cómo recibir acompañamiento en la plataforma',
    enum: ['explorar_solo', 'recomendaciones_paso', 'apoyo_necesite'],
    example: 'recomendaciones_paso',
  })
  @IsOptional()
  @IsIn(['explorar_solo', 'recomendaciones_paso', 'apoyo_necesite'])
  preferenciasAcompanamiento?: string

  @ApiPropertyOptional({
    description: 'Tono contextual de la plataforma (cómo quiere recibir la información)',
    enum: ['formal', 'cercano', 'empatico', 'directo', 'infantil'],
    example: 'empatico',
  })
  @IsOptional()
  @IsIn(['formal', 'cercano', 'empatico', 'directo', 'infantil'])
  tonoContextual?: string
}
