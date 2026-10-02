import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsOptional, IsString } from 'class-validator'

/**
 * Actualización parcial de las preferencias y condiciones del perfil
 * (formulario "Editar Preferencias"). Todos los campos son opcionales: solo
 * se modifican los que se envían; los ausentes conservan su valor actual.
 */
export class ActualizarPerfilNecesidadesDto {
  @ApiPropertyOptional({ description: 'Tipos de discapacidad', example: ['tea', 'motriz'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tiposDiscapacidad?: string[]

  @ApiPropertyOptional({ description: 'Etapa de vida', example: 'joven_adulto' })
  @IsOptional()
  @IsString()
  etapaVida?: string

  @ApiPropertyOptional({ description: 'Necesidades de movilidad', example: ['rampas'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  necesidadesMovilidad?: string[]

  @ApiPropertyOptional({ description: 'Áreas de interés', example: ['arte', 'deporte'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areasInteres?: string[]

  @ApiPropertyOptional({ description: 'Condiciones médicas o diagnósticos asociados', example: ['diabetes tipo 2'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  condiciones?: string[]
}
