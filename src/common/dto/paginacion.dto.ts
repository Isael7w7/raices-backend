import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsInt, Min, Max } from 'class-validator'
import { Type } from 'class-transformer'

export class PaginacionDto {
  @ApiPropertyOptional({ description: 'Número de página (empieza en 1)', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt() @Min(1)
  pagina?: number = 1

  @ApiPropertyOptional({ description: 'Elementos por página', default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt() @Min(1) @Max(100)
  limite?: number = 20
}

export interface RespuestaPaginada<T> {
  datos: T[]
  total: number
  pagina: number
  limite: number
  totalPaginas: number
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
