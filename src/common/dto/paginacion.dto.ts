import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsInt, Min, Max, IsString, IsIn } from 'class-validator'
import { Type } from 'class-transformer'

export class PaginacionDto {
  @ApiPropertyOptional({ description: 'Número de página (empieza en 1)', default: 1, minimum: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt() @Min(1)
  pagina?: number = 1

  @ApiPropertyOptional({ description: 'Elementos por página', default: 20, minimum: 1, maximum: 100, example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt() @Min(1) @Max(100)
  limite?: number = 20

  @ApiPropertyOptional({ description: 'Campo para ordenar resultados', example: 'fechaCreacion' })
  @IsOptional() @IsString()
  ordenarPor?: string

  @ApiPropertyOptional({ description: 'Dirección del ordenamiento', enum: ['asc', 'desc'], default: 'desc', example: 'desc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  direccion?: 'asc' | 'desc' = 'desc'

  @ApiPropertyOptional({ description: 'Búsqueda por texto en campos relevantes (título, nombre, contenido, etc.)', example: 'terapeuta' })
  @IsOptional() @IsString()
  buscar?: string
}

export interface RespuestaPaginada<T> {
  datos: T[]
  total: number
  pagina: number
  limite: number
  totalPaginas: number
}

/** Metadatos de paginación anidados: { total, pagina, limite, totalPaginas } */
export class PaginacionMetaDto {
  @ApiProperty({ description: 'Total de elementos', example: 45 })
  total!: number

  @ApiProperty({ description: 'Página actual', example: 1 })
  pagina!: number

  @ApiProperty({ description: 'Elementos por página', example: 20 })
  limite!: number

  @ApiProperty({ description: 'Total de páginas', example: 3 })
  totalPaginas!: number
}

/**
 * Respuesta paginada plana: { datos, total, pagina, limite, totalPaginas }.
 * Para tipar `datos`, extiende esta clase y redefine la propiedad con
 * `@ApiProperty({ type: [TuDto] })`.
 */
export class RespuestaPaginadaDto<T> {
  @ApiProperty({ description: 'Elementos de la página', type: () => [Object] })
  datos!: T[]

  @ApiProperty({ description: 'Total de elementos', example: 45 })
  total!: number

  @ApiProperty({ description: 'Página actual', example: 1 })
  pagina!: number

  @ApiProperty({ description: 'Elementos por página', example: 20 })
  limite!: number

  @ApiProperty({ description: 'Total de páginas', example: 3 })
  totalPaginas!: number
}

/**
 * Respuesta paginada anidada (módulo de instituciones): { datos, paginacion: {...} }.
 * Para tipar `datos`, extiende esta clase y redefine la propiedad con
 * `@ApiProperty({ type: [TuDto] })`.
 */
export class RespuestaPaginadaAnidadaDto<T> {
  @ApiProperty({ description: 'Elementos de la página', type: () => [Object] })
  datos!: T[]

  @ApiProperty({ type: PaginacionMetaDto })
  paginacion!: PaginacionMetaDto
}

/**
 * Aplica ordenamiento por un campo de los datos en memoria.
 */
export function ordenar<T>(datos: T[], campo: string | undefined, direccion: 'asc' | 'desc'): T[] {
  if (!campo) return datos
  return [...datos].sort((a: any, b: any) => {
    const aVal = a[campo] ?? ''
    const bVal = b[campo] ?? ''
    const cmp = String(aVal).localeCompare(String(bVal), 'es', { sensitivity: 'base' })
    return direccion === 'asc' ? cmp : -cmp
  })
}

export function paginar<T>(datos: T[], total: number, pagina: number, limite: number): RespuestaPaginada<T> {
  return {
    datos,
    total,
    pagina,
    limite,
    totalPaginas: Math.ceil(total / limite),
  }
}
