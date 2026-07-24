import { ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsString,
  IsOptional,
  IsNumber,
  IsIn,
  IsArray,
  Min,
  Max,
} from 'class-validator'

export class UpdateInstitucionDto {
  @ApiPropertyOptional({ description: 'Nombre de la institución', example: 'Centro de Rehabilitación DIF Mérida' })
  @IsOptional()
  @IsString()
  nombre?: string

  @ApiPropertyOptional({ description: 'Descripción de la institución' })
  @IsOptional()
  @IsString()
  descripcion?: string

  @ApiPropertyOptional({ description: 'Categoría', enum: ['funcional', 'educativo', 'laboral', 'social'] })
  @IsOptional()
  @IsString()
  @IsIn(['funcional', 'educativo', 'laboral', 'social'])
  categoria?: string

  @ApiPropertyOptional({ description: 'Subcategoría' })
  @IsOptional()
  @IsString()
  subcategoria?: string

  @ApiPropertyOptional({ description: 'Dirección' })
  @IsOptional()
  @IsString()
  direccion?: string

  @ApiPropertyOptional({ description: 'Ciudad' })
  @IsOptional()
  @IsString()
  ciudad?: string

  @ApiPropertyOptional({ description: 'Estado' })
  @IsOptional()
  @IsString()
  estado?: string

  @ApiPropertyOptional({ description: 'Latitud' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number

  @ApiPropertyOptional({ description: 'Longitud' })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number

  @ApiPropertyOptional({ description: 'Teléfono' })
  @IsOptional()
  @IsString()
  telefono?: string

  @ApiPropertyOptional({ description: 'WhatsApp' })
  @IsOptional()
  @IsString()
  whatsapp?: string

  @ApiPropertyOptional({ description: 'Correo de contacto' })
  @IsOptional()
  @IsString()
  email?: string

  @ApiPropertyOptional({ description: 'Sitio web' })
  @IsOptional()
  @IsString()
  sitioWeb?: string

  @ApiPropertyOptional({ description: 'URL del logo' })
  @IsOptional()
  @IsString()
  urlLogo?: string

  @ApiPropertyOptional({ description: 'URL de la portada' })
  @IsOptional()
  @IsString()
  urlPortada?: string

  @ApiPropertyOptional({ description: 'Tipos de discapacidad', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tiposDiscapacidad?: string[]

  @ApiPropertyOptional({ description: 'Edad mínima de atención' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(120)
  edadMinima?: number

  @ApiPropertyOptional({ description: 'Edad máxima de atención' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(120)
  edadMaxima?: number

  @ApiPropertyOptional({ description: 'Horario de atención' })
  @IsOptional()
  @IsString()
  horarioAtencion?: string

  @ApiPropertyOptional({ description: 'Tipo de plan', enum: ['gratuito', 'pago', 'mixto'] })
  @IsOptional()
  @IsString()
  @IsIn(['gratuito', 'pago', 'mixto'])
  tipoPlan?: string

  @ApiPropertyOptional({ description: 'Servicios que ofrece', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  servicios?: string[]

  @ApiPropertyOptional({ description: 'URLs de fotos', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fotos?: string[]
}
