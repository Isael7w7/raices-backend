import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsDateString, IsIn, IsOptional } from 'class-validator'
import { PaginacionDto } from '../../../common/dto/paginacion.dto'
import { CATEGORIAS_EVENTO } from '../../../common/interfaces/firestore-documents.interface'

/**
 * Query de `GET /api/comunidad/eventos`.
 *
 * Los eventos se ordenan SIEMPRE por `fechaInicio` ascendente (próximos
 * primero). Si no se envía `fecha` ni `desde`, se listan solo los próximos
 * (desde "ahora"): envía `desde` con una fecha pasada para ver historial.
 */
export class ListarEventosDto extends PaginacionDto {
  @ApiPropertyOptional({ description: 'Filtrar por categoría', enum: CATEGORIAS_EVENTO, example: 'taller' })
  @IsOptional()
  @IsIn([...CATEGORIAS_EVENTO], { message: `La categoría debe ser una de: ${CATEGORIAS_EVENTO.join(', ')}` })
  categoria?: string

  @ApiPropertyOptional({ description: 'Día exacto del evento (YYYY-MM-DD). Ignora el filtro por defecto de próximos eventos.', example: '2026-10-15' })
  @IsOptional()
  @IsDateString({}, { message: 'fecha debe ser una fecha ISO 8601 válida (YYYY-MM-DD)' })
  fecha?: string

  @ApiPropertyOptional({ description: 'Listar eventos desde esta fecha/hora (ISO 8601). Por defecto: desde ahora.', example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString({}, { message: 'desde debe ser una fecha ISO 8601 válida' })
  desde?: string
}
