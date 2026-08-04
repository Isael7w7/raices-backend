import { IsEmail, IsString, MinLength, IsIn, IsOptional, IsArray } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class RegisterDto {
  @ApiProperty({ description: 'Correo electrónico del usuario', example: 'usuario@correo.mx' })
  @IsEmail() email: string
  @ApiProperty({ description: 'Contraseña (mínimo 6 caracteres)', example: 'MiPassword123' })
  @IsString() @MinLength(6) password: string
  @ApiProperty({ description: 'Nombre completo', example: 'Juan Pérez' })
  @IsString() nombreCompleto: string
  @ApiProperty({ description: 'Rol del usuario', enum: ['pcd', 'tutor', 'institucion'] })
  @IsIn(['pcd', 'tutor', 'institucion']) rol: string
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
}
