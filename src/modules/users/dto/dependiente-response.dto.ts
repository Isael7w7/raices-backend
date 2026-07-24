import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/**
 * Datos de un dependiente formateado.
 */
export class DependienteDatosDto {
  @ApiProperty({ description: 'ID del dependiente', example: 'abc-123' })
  id: string

  @ApiProperty({ description: 'Nombre completo del dependiente', example: 'María García López' })
  nombreCompleto: string

  @ApiProperty({ description: 'Parentesco con el tutor', example: 'hijo' })
  parentesco: string

  @ApiProperty({ description: 'Tipos de discapacidad registrados', example: ['tea', 'motriz'], type: [String] })
  tiposDiscapacidad: string[]

  @ApiProperty({ description: 'Rango de edad', example: '6-12', nullable: true })
  rangoEdad: string | null

  @ApiProperty({ description: 'Etapa de vida', example: 'infancia', nullable: true })
  etapaVida: string | null

  @ApiProperty({ description: 'Notas adicionales', example: 'Requiere acompañamiento', required: false })
  notas: string

  @ApiProperty({ description: 'Fecha de creación', example: '2024-01-15T00:00:00.000Z' })
  fechaCreacion: string
}

/**
 * DTO de respuesta para GET /dependientes (lista).
 */
export class ObtenerDependientesResponseDto {
  @ApiProperty({ description: 'Indica si la operación fue exitosa', example: true })
  exito: boolean

  @ApiProperty({ description: 'Mensaje descriptivo de la operación', example: 'Dependientes obtenidos con éxito' })
  mensaje: string

  @ApiProperty({ description: 'Lista de dependientes', type: [DependienteDatosDto] })
  datos: DependienteDatosDto[]
}

/**
 * DTO de respuesta para GET /dependientes/:id, POST /dependientes, PUT /dependientes/:id.
 */
export class DependienteResponseDto {
  @ApiProperty({ description: 'Indica si la operación fue exitosa', example: true })
  exito: boolean

  @ApiProperty({ description: 'Mensaje descriptivo de la operación', example: 'Dependiente obtenido con éxito' })
  mensaje: string

  @ApiProperty({ description: 'Datos del dependiente', type: DependienteDatosDto })
  datos: DependienteDatosDto
}

/**
 * DTO de respuesta para DELETE /dependientes/:id.
 */
export class EliminarDependienteResponseDto {
  @ApiProperty({ description: 'Indica si la operación fue exitosa', example: true })
  exito: boolean

  @ApiProperty({ description: 'Mensaje descriptivo de la operación', example: 'Dependiente eliminado con éxito' })
  mensaje: string
}
