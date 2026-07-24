import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  IsIn,
  Min,
  Max,
} from 'class-validator'

export class CreateInstitucionDto {
  @ApiProperty({ description: 'Nombre de la institución', example: 'Centro de Rehabilitación DIF Mérida' })
  @IsString()
  @IsNotEmpty()
  nombre: string

  @ApiPropertyOptional({ description: 'Descripción de la institución', example: 'Terapias físicas, ocupacionales y de lenguaje.' })
  @IsOptional()
  @IsString()
  descripcion?: string

  @ApiProperty({ description: 'Categoría', example: 'funcional', enum: ['funcional', 'educativo', 'laboral', 'social'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['funcional', 'educativo', 'laboral', 'social'])
  categoria: string

  @ApiPropertyOptional({ description: 'Subcategoría', example: 'terapias' })
  @IsOptional()
  @IsString()
  subcategoria?: string

  @ApiPropertyOptional({ description: 'Dirección', example: 'Calle 50 x 65 #123' })
  @IsOptional()
  @IsString()
  direccion?: string

  @ApiPropertyOptional({ description: 'Ciudad', example: 'Mérida' })
  @IsOptional()
  @IsString()
  ciudad?: string

  @ApiPropertyOptional({ description: 'Estado', example: 'Yucatán' })
  @IsOptional()
  @IsString()
  estado?: string

  @ApiPropertyOptional({ description: 'Latitud', example: 20.9674 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number

  @ApiPropertyOptional({ description: 'Longitud', example: -89.6237 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number

  @ApiPropertyOptional({ description: 'Teléfono', example: '9999990001' })
  @IsOptional()
  @IsString()
  telefono?: string

  @ApiPropertyOptional({ description: 'WhatsApp', example: '9991110001' })
  @IsOptional()
  @IsString()
  whatsapp?: string

  @ApiPropertyOptional({ description: 'Correo de contacto', example: 'contacto@difmerida.mx' })
  @IsOptional()
  @IsString()
  email?: string

  @ApiPropertyOptional({ description: 'Sitio web', example: 'https://difmerida.mx' })
  @IsOptional()
  @IsString()
  sitioWeb?: string

  @ApiPropertyOptional({ description: 'URL del logo', example: 'https://storage.../logo.png' })
  @IsOptional()
  @IsString()
  urlLogo?: string

  @ApiPropertyOptional({ description: 'URL de la portada', example: 'https://storage.../cover.jpg' })
  @IsOptional()
  @IsString()
  urlPortada?: string

  @ApiPropertyOptional({
    description: 'Tipos de discapacidad que atiende',
    example: ['tea', 'motriz'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tiposDiscapacidad?: string[]

  @ApiPropertyOptional({ description: 'Edad mínima de atención', example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(120)
  edadMinima?: number

  @ApiPropertyOptional({ description: 'Edad máxima de atención', example: 99 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(120)
  edadMaxima?: number

  @ApiPropertyOptional({ description: 'Horario de atención', example: 'Lun-Vie 8:00-16:00' })
  @IsOptional()
  @IsString()
  horarioAtencion?: string

  @ApiPropertyOptional({ description: 'Tipo de plan', example: 'gratuito', enum: ['gratuito', 'pago', 'mixto'] })
  @IsOptional()
  @IsString()
  @IsIn(['gratuito', 'pago', 'mixto'])
  tipoPlan?: string

  @ApiPropertyOptional({ description: 'Servicios que ofrece', example: ['Terapia ABA', 'Fonoaudiología'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  servicios?: string[]

  @ApiPropertyOptional({ description: 'URLs de fotos de la institución', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fotos?: string[]
}
