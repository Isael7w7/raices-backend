import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString } from 'class-validator'

/**
 * Tipo de documento de identidad que se puede subir.
 */
export type TipoDocumentoIdentidad = 'curp' | 'identificacion_oficial'

/**
 * Estado de validación de los documentos de identidad.
 */
export type EstadoValidacionIdentidad =
  | 'sin_documentos'     // No ha subido ningún documento
  | 'pendiente'          // Documentos subidos, esperando revisión
  | 'aprobado'           // Documentos verificados por admin
  | 'rechazado'          // Documentos rechazados por admin

/**
 * DTO para registrar la subida de documentos de identidad.
 * Se envía como multipart/form-data.
 */
export class SubirDocumentoIdentidadDto {
  @ApiProperty({
    description: 'Tipo de documento',
    enum: ['curp', 'identificacion_oficial'],
    example: 'curp',
  })
  @IsIn(['curp', 'identificacion_oficial'])
  tipo!: TipoDocumentoIdentidad

  @ApiPropertyOptional({
    description: 'Número de CURP (si el tipo es curp). Se valida automáticamente.',
    example: 'GAPL800101MCYRL093',
  })
  @IsOptional()
  @IsString()
  numeroCurp?: string
}

/**
 * DTO de respuesta al subir un documento de identidad.
 */
export class DocumentoIdentidadSubidoDto {
  @ApiProperty({ example: 'curp' })
  tipo!: TipoDocumentoIdentidad

  @ApiProperty({ example: 'https://firebasestorage.googleapis.com/.../identidad/abc.pdf' })
  urlDocumento!: string

  @ApiProperty({ example: 'pendiente', enum: ['pendiente', 'aprobado', 'rechazado'] })
  estado!: string

  @ApiProperty({ example: '2026-08-13T00:00:00.000Z' })
  fechaSubida!: string

  @ApiProperty({ example: 'GAPL800101MCYRL093', nullable: true })
  numeroCurp?: string | null
}

/**
 * DTO de respuesta del estado de validación de identidad.
 */
export class EstadoValidacionIdentidadDto {
  @ApiProperty({ example: 'pendiente', enum: ['sin_documentos', 'pendiente', 'aprobado', 'rechazado'] })
  estado!: EstadoValidacionIdentidad

  @ApiProperty({ example: true })
  tieneCurp!: boolean

  @ApiProperty({ example: true })
  tieneIdentificacion!: boolean

  @ApiProperty({ example: 'GAPL800101MCYRL093', nullable: true })
  numeroCurp?: string | null

  @ApiProperty({ example: null, nullable: true, description: 'Motivo de rechazo (si aplica)' })
  motivoRechazo?: string | null

  @ApiProperty({ example: '2026-08-13T00:00:00.000Z', nullable: true })
  fechaSubida?: string | null

  @ApiProperty({ example: null, nullable: true })
  fechaRevision?: string | null
}
