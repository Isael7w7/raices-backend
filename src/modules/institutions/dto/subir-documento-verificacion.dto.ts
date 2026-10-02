import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString } from 'class-validator'

/** Tipo de documento de verificación de una cuenta institucional/empresarial. */
export type TipoDocumentoVerificacion = 'csf' | 'identificacion_representante'

/**
 * DTO de la carga de documentos de verificación de una institución/empresa.
 * Se envía como multipart/form-data con el archivo en el campo `documento`.
 *
 * Las cuentas corporativas son personas morales: **la CURP no es aplicable**.
 * El campo `numeroCurp` se acepta opcional pero se ignora por completo para
 * estos roles; el requisito indispensable es la Constancia de Situación Fiscal
 * (CSF) y, de forma opcional, la identificación del representante legal.
 */
export class SubirDocumentoVerificacionDto {
  @ApiProperty({
    description: 'Tipo de documento a subir',
    enum: ['csf', 'identificacion_representante'],
    example: 'csf',
  })
  @IsIn(['csf', 'identificacion_representante'])
  tipo!: TipoDocumentoVerificacion

  @ApiPropertyOptional({
    description: 'Opcional y SIN efecto para instituciones/empresas: la CURP no aplica a personas morales y se ignora por completo.',
    example: 'GAPL800101HMCYRL09',
  })
  @IsOptional()
  @IsString()
  numeroCurp?: string
}
