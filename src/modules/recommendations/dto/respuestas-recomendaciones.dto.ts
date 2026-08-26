import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { PaginacionMetaDto } from '../../../common/dto/paginacion.dto'

/** Query params para GET /usuarios/recomendaciones */
export class RecomendacionesQueryDto {
  @ApiPropertyOptional({ description: 'Número de página (empieza en 1)', default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt() @Min(1)
  pagina?: number = 1

  @ApiPropertyOptional({ description: 'Elementos por página (default 20, max 50)', default: 20, example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt() @Min(1) @Max(50)
  limite?: number = 20
}

// ─── Respuestas ─────────────────────────────────────────────────────

export class PesosInteraccionDto {
  @ApiProperty({ description: 'Puntos acumulados por categoría en los últimos 30 días', example: { funcional: 15, laboral: 8, social: 0, educativo: 0 }, type: Object })
  pesos!: Record<string, number>
}

export class InteraccionRegistradaDto {
  @ApiProperty({ description: 'Indica si la interacción se registró correctamente', example: true })
  exito!: boolean

  @ApiProperty({ description: 'ID del documento creado en Firestore', example: 'inter-abc123' })
  id!: string

  @ApiProperty({ description: 'Mensaje descriptivo', example: 'Interacción registrada' })
  mensaje!: string
}

export class InstitucionRecomendadaDto {
  @ApiProperty({ description: 'ID de la institución', example: 'inst-abc123' })
  id!: string

  @ApiProperty({ description: 'Nombre de la institución', example: 'Centro Ejemplo' })
  nombre?: string

  @ApiProperty({ description: 'Categoría de la institución', example: 'laboral' })
  categoria?: string

  @ApiPropertyOptional({ description: 'Ciudad de la institución', example: 'Mérida' })
  ciudad?: string

  @ApiPropertyOptional({ description: 'URL del logo', example: 'https://...' })
  urlLogo?: string | null

  @ApiProperty({ description: 'Score de coincidencia con intereses/metas del perfil (0 a 1)', example: 0.6 })
  score_intereses!: number

  @ApiProperty({ description: 'Score de comportamiento normalizado por pesos (0 a 1)', example: 0.4 })
  score_comportamiento!: number

  @ApiProperty({ description: 'Score final: intereses*0.6 + comportamiento*0.4', example: 0.52 })
  final_score!: number
}

export class PaginaRecomendacionesDto {
  @ApiProperty({ type: [InstitucionRecomendadaDto], description: 'Recomendaciones de la página ordenadas por final_score descendente' })
  datos!: InstitucionRecomendadaDto[]

  @ApiProperty({ type: PaginacionMetaDto })
  paginacion!: PaginacionMetaDto
}
