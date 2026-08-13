import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString, IsArray, IsNumber, Min, Max } from 'class-validator'

/**
 * Estado de una ruta de desarrollo.
 */
export type EstadoRuta = 'activa' | 'completada' | 'pausada' | 'cancelada'

/**
 * Prioridad de una ruta de desarrollo.
 */
export type PrioridadRuta = 'baja' | 'media' | 'alta'

/**
 * DTO para crear una nueva ruta de desarrollo.
 */
export class CrearRutaDto {
  @ApiProperty({
    description: 'Área de interés a la que pertenece la ruta',
    example: 'educacion',
  })
  @IsString()
  areaInteres!: string

  @ApiProperty({
    description: 'Nombre de la ruta',
    example: 'Ingreso a educación media superior',
  })
  @IsString()
  nombre!: string

  @ApiPropertyOptional({
    description: 'Descripción de la ruta',
    example: 'Meta: Ingresar a una escuela de educación media superior inclusiva',
  })
  @IsOptional()
  @IsString()
  descripcion?: string

  @ApiPropertyOptional({
    description: 'Meta final de la ruta',
    example: 'Inscripción exitosa en escuela inclusiva',
  })
  @IsOptional()
  @IsString()
  metaFinal?: string

  @ApiPropertyOptional({
    description: 'Prioridad de la ruta',
    enum: ['baja', 'media', 'alta'],
    example: 'alta',
  })
  @IsOptional()
  @IsIn(['baja', 'media', 'alta'])
  prioridad?: PrioridadRuta

  @ApiPropertyOptional({
    description: 'Fecha límite deseada (ISO 8601)',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsString()
  fechaLimite?: string
}

/**
 * DTO para actualizar una ruta de desarrollo.
 */
export class ActualizarRutaDto {
  @ApiPropertyOptional({ description: 'Nombre de la ruta' })
  @IsOptional() @IsString()
  nombre?: string

  @ApiPropertyOptional({ description: 'Descripción de la ruta' })
  @IsOptional() @IsString()
  descripcion?: string

  @ApiPropertyOptional({ description: 'Meta final de la ruta' })
  @IsOptional() @IsString()
  metaFinal?: string

  @ApiPropertyOptional({ description: 'Estado de la ruta', enum: ['activa', 'completada', 'pausada', 'cancelada'] })
  @IsOptional() @IsIn(['activa', 'completada', 'pausada', 'cancelada'])
  estado?: EstadoRuta

  @ApiPropertyOptional({ description: 'Prioridad', enum: ['baja', 'media', 'alta'] })
  @IsOptional() @IsIn(['baja', 'media', 'alta'])
  prioridad?: PrioridadRuta

  @ApiPropertyOptional({ description: 'Fecha límite deseada' })
  @IsOptional() @IsString()
  fechaLimite?: string
}

/**
 * DTO para agregar un paso/hito a una ruta.
 */
export class CrearPasoDto {
  @ApiProperty({ description: 'Título del paso', example: 'Investigar escuelas inclusivas' })
  @IsString()
  titulo!: string

  @ApiPropertyOptional({ description: 'Descripción del paso' })
  @IsOptional() @IsString()
  descripcion?: string

  @ApiPropertyOptional({ description: 'Orden del paso en la ruta', example: 1 })
  @IsOptional() @IsNumber() @Min(1)
  orden?: number
}

/**
 * DTO de respuesta para una ruta de desarrollo.
 */
export class RutaDesarrolloDto {
  @ApiProperty({ example: 'ruta-uid' })
  id!: string

  @ApiProperty({ example: 'usuario-uid' })
  usuarioId!: string

  @ApiProperty({ example: 'educacion' })
  areaInteres!: string

  @ApiProperty({ example: 'Ingreso a educación media superior' })
  nombre!: string

  @ApiPropertyOptional({ example: 'Meta: Ingresar a una escuela inclusiva' })
  descripcion?: string

  @ApiPropertyOptional({ example: 'Inscripción exitosa en escuela inclusiva' })
  metaFinal?: string

  @ApiProperty({ example: 'activa', enum: ['activa', 'completada', 'pausada', 'cancelada'] })
  estado!: EstadoRuta

  @ApiProperty({ example: 'alta', enum: ['baja', 'media', 'alta'] })
  prioridad!: PrioridadRuta

  @ApiProperty({ example: 3, description: 'Total de pasos' })
  totalPasos!: number

  @ApiProperty({ example: 1, description: 'Pasos completados' })
  pasosCompletados!: number

  @ApiProperty({ example: 33, description: 'Porcentaje de progreso (0-100)' })
  porcentajeProgreso!: number

  @ApiPropertyOptional({ example: '2026-12-31', nullable: true })
  fechaLimite?: string

  @ApiProperty({ example: '2026-08-13T00:00:00.000Z' })
  fechaCreacion!: string

  @ApiPropertyOptional({ example: '2026-08-13T00:00:00.000Z', nullable: true })
  fechaActualizacion?: string
}

/**
 * DTO de respuesta para un paso de ruta.
 */
export class PasoRutaDto {
  @ApiProperty({ example: 'paso-uid' })
  id!: string

  @ApiProperty({ example: 'ruta-uid' })
  rutaId!: string

  @ApiProperty({ example: 'Investigar escuelas inclusivas' })
  titulo!: string

  @ApiPropertyOptional({ example: 'Buscar opciones en la zona' })
  descripcion?: string

  @ApiProperty({ example: 1 })
  orden!: number

  @ApiProperty({ example: false })
  completado!: boolean

  @ApiPropertyOptional({ nullable: true })
  fechaCompletado?: string

  @ApiProperty({ example: '2026-08-13T00:00:00.000Z' })
  fechaCreacion!: string
}

/**
 * DTO de respuesta para el resumen de rutas del usuario.
 */
export class ResumenRutasDto {
  @ApiProperty({ example: 3 })
  totalRutas!: number

  @ApiProperty({ example: 1 })
  rutasActivas!: number

  @ApiProperty({ example: 1 })
  rutasCompletadas!: number

  @ApiProperty({ example: 1 })
  rutasPausadas!: number

  @ApiProperty({ example: 45, description: 'Promedio de progreso de todas las rutas activas' })
  progresoPromedio!: number
}
