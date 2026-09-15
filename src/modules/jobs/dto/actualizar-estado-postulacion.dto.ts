import { ApiProperty } from '@nestjs/swagger'
import { IsIn } from 'class-validator'

/** Estados válidos de una postulación a vacante */
export const ESTADOS_POSTULACION = ['pendiente', 'aceptada', 'rechazada'] as const
export type EstadoPostulacion = (typeof ESTADOS_POSTULACION)[number]

export class ActualizarEstadoPostulacionDto {
  @ApiProperty({ enum: ESTADOS_POSTULACION, example: 'aceptada', description: 'Nuevo estado de la postulación' })
  @IsIn(ESTADOS_POSTULACION, { message: 'El estado debe ser uno de: pendiente, aceptada, rechazada' })
  estado!: EstadoPostulacion
}
