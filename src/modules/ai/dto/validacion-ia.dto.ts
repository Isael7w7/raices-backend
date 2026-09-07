import { ApiProperty } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString } from 'class-validator'

/**
 * Detalle de criterios de coherencia evaluados por la validación de usuarios
 * con IA (Vertex AI / Gemini) o por el mecanismo de fallback `validarPorReglas`.
 */
export class DetallesValidacionDto {
  @ApiProperty({ description: 'El nombre parece real: nombre y apellido, sin caracteres extraños', example: true })
  nombreCoherente!: boolean

  @ApiProperty({ description: 'El email tiene formato válido y es coherente con el nombre o la institución', example: true })
  emailCoherente!: boolean

  @ApiProperty({ description: 'La CURP existe, cumple el formato oficial de 18 caracteres y es consistente con el nombre', example: true })
  curpCoherente!: boolean

  @ApiProperty({ description: 'El rol (pcd, padre_tutor, tutor, institucion, admin) es consistente con el resto de los datos', example: true })
  rolCoherente!: boolean

  @ApiProperty({ description: 'Los datos de la institución asociada son completos y coherentes (solo aplica a rol institucion)', example: true })
  institucionCoherente!: boolean

  @ApiProperty({ description: 'Tipos de documentos de identidad presentes', type: [String], example: ['curp'] })
  documentosPresentes!: string[]

  @ApiProperty({ description: 'Tipos de documentos de identidad faltantes', type: [String], example: ['identificacion_oficial'] })
  documentosFaltantes!: string[]

  @ApiProperty({ description: 'Observaciones adicionales del análisis', type: [String] })
  observaciones!: string[]
}

/**
 * Resultado de la validación automática de un usuario por IA.
 *
 * Reglas de decisión (aplicadas de forma determinista por el backend):
 *  - Confianza >= 80% y criterios clave pasan → aprobado: true (verificado al instante)
 *  - Confianza 50-79% o dudas menores         → aprobado: false, requiereRevisionManual: true (único caso que va al admin)
 *  - Confianza < 50% o problemas graves       → aprobado: false, requiereRevisionManual: false (rechazado)
 */
export class ResultadoValidacionIaDto {
  @ApiProperty({ description: 'ID del usuario validado', example: 'uid-abc123' })
  usuarioId!: string

  @ApiProperty({ description: 'true = la cuenta queda verificada de inmediato', example: true })
  aprobado!: boolean

  @ApiProperty({ description: 'true = la cuenta requiere revisión manual del administrador (último recurso)', example: false })
  requiereRevisionManual!: boolean

  @ApiProperty({ description: 'Confianza del análisis en porcentaje (0-100)', example: 90, minimum: 0, maximum: 100 })
  confianza!: number

  @ApiProperty({ description: 'Explicación breve de la decisión', example: 'Nombre, email y CURP coherentes entre sí; documento de CURP presente y pendiente de revisión.' })
  razonamiento!: string

  @ApiProperty({ type: DetallesValidacionDto, description: 'Detalle de los criterios evaluados' })
  detalles!: DetallesValidacionDto

  @ApiProperty({ enum: ['gemini', 'reglas', 'admin'], description: 'Fuente del resultado: IA (Gemini), reglas de respaldo o decisión de administrador' })
  fuente!: 'gemini' | 'reglas' | 'admin'

  @ApiProperty({ description: 'Fecha ISO de la validación', example: '2026-09-07T12:00:00.000Z' })
  fechaValidacion!: string
}

/** Cuerpo del override manual de validación por parte de un administrador. */
export class OverrideValidacionDto {
  @ApiProperty({ description: 'Decisión del administrador: true = aprobar y verificar la cuenta, false = rechazar', example: true })
  @IsBoolean()
  aprobado!: boolean

  @ApiProperty({ description: 'Motivo de la decisión manual (se guarda en el historial de validaciones)', required: false, example: 'Documento revisado visualmente: la CURP es legible y coincide con el nombre' })
  @IsOptional()
  @IsString()
  motivo?: string
}
