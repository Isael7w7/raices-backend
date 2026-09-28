import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator'
import { Transform } from 'class-transformer'
import { sanitizeHtml } from '../../../common/utils/sanitize-html'
import { IsCurpValida } from '../../../common/decorators/is-curp-valida.decorator'

/**
 * DTO del guardado parcial del onboarding ("Quiero continuar después").
 *
 * TODOS los campos son opcionales (@IsOptional): el Frontend puede enviar
 * cualquier subconjunto de preguntas respondidas hasta el paso actual sin
 * que el backend exija los campos faltantes (nunca 400 por incompletitud).
 * El servicio hace la fusión (merge) con el borrador previo sin sobrescribir
 * con null/undefined.
 *
 * Sigue la misma estrategia de validación (class-validator + Swagger) que
 * el resto de DTOs del proyecto (ej. ActualizarPerfilDto).
 */
export class SaveDraftOnboardingDto {
  // ═══════════════════════════════════════════════════════════════════
  // Diapositiva 1 · Observaciones Generales
  // ═══════════════════════════════════════════════════════════════════

  @ApiPropertyOptional({
    description: 'Observaciones generales del proceso de onboarding',
    example: 'Diego necesita acompañamiento para transiciones.',
  })
  @IsOptional()
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString()
  @MaxLength(1000, { message: 'Las observaciones no pueden exceder 1000 caracteres' })
  observacionesGenerales?: string

  @ApiPropertyOptional({
    description: 'Fecha de nacimiento de la PCD (YYYY-MM-DD)',
    example: '2015-03-15',
  })
  @IsOptional()
  @IsString()
  fechaNacimiento?: string

  @ApiPropertyOptional({
    description: 'CURP de la PCD (18 caracteres, formato oficial mexicano)',
    example: 'GAPL800101MCYRL093',
  })
  @IsOptional()
  @IsCurpValida({ message: 'La CURP no tiene un formato válido. Debe ser una CURP oficial mexicana de 18 caracteres' })
  curp?: string

  @ApiPropertyOptional({ description: 'Ciudad de residencia', example: 'Mérida' })
  @IsOptional()
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString()
  @MaxLength(100, { message: 'La ciudad no puede exceder 100 caracteres' })
  ciudad?: string

  // NOTA: `destinatarioPerfil` y `nombrePcd` NO se reciben aquí: el status
  // los deriva de datos ya existentes (perfiles.destinatarioRegistro y
  // perfil/dependiente del tutor) para no duplicar la fuente de verdad.

  // ═══════════════════════════════════════════════════════════════════
  // Historial educativo
  // ═══════════════════════════════════════════════════════════════════

  @ApiPropertyOptional({
    description: 'Historial educativo de la PCD',
    example: ['educacion_regular', 'educacion_especial'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  historialEducacion?: string[]

  @ApiPropertyOptional({ description: 'Etapa de vida', example: 'primera_infancia' })
  @IsOptional()
  @IsString()
  etapaVida?: string

  // ═══════════════════════════════════════════════════════════════════
  // Terapias
  // ═══════════════════════════════════════════════════════════════════

  @ApiPropertyOptional({
    description: 'Historial de terapias',
    example: ['fisioterapia', 'terapia_de_habla'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  historialTerapia?: string[]

  @ApiPropertyOptional({
    description: '¿Tiene diagnóstico formal?',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  tieneDiagnostico?: boolean

  // ═══════════════════════════════════════════════════════════════════
  // Perfil de necesidades
  // ═══════════════════════════════════════════════════════════════════

  @ApiPropertyOptional({
    description: 'Tipos de discapacidad',
    example: ['tea', 'motriz'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tiposDiscapacidad?: string[]

  @ApiPropertyOptional({
    description: 'Necesidades específicas',
    example: ['terapia ocupacional'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  necesidades?: string[]

  @ApiPropertyOptional({
    description: 'Metas actuales',
    example: ['autonomía', 'escuela inclusiva'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  metasActuales?: string[]

  // ═══════════════════════════════════════════════════════════════════
  // Preferencias y escalas de vida
  // ═══════════════════════════════════════════════════════════════════

  @ApiPropertyOptional({
    description: 'Preferencia de acompañamiento',
    enum: ['explorar_solo', 'recomendaciones_paso', 'apoyo_necesite'],
    example: 'recomendaciones_paso',
  })
  @IsOptional()
  @IsIn(['explorar_solo', 'recomendaciones_paso', 'apoyo_necesite'])
  preferenciasAcompanamiento?: string

  @ApiPropertyOptional({
    description: 'Tono contextual de la plataforma',
    enum: ['formal', 'cercano', 'empatico', 'directo', 'infantil'],
    example: 'empatico',
  })
  @IsOptional()
  @IsIn(['formal', 'cercano', 'empatico', 'directo', 'infantil'])
  tonoContextual?: string

  @ApiPropertyOptional({
    description: 'Áreas de interés',
    example: ['educacion', 'comunidad'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areasInteres?: string[]

  @ApiPropertyOptional({
    description: 'Escalas de vida (8 escalas: autonomia, independencia, comunicacion, comprension, energia, movilidad, social, emocional)',
    example: { autonomia: 2, movilidad: 3 },
    type: 'object',
  })
  @IsOptional()
  @IsObject()
  escalasVida?: Record<string, number>
}
