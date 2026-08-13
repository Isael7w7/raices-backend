import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class EscalasVidaGuardadasDto {
  @ApiProperty({ example: { autonomia: 2, independencia: 3, comunicacion: 2, comprension: 3, energia: 3, movilidad: 3, social: 2, emocional: 3 } })
  escalasVida!: Record<string, number>

  @ApiProperty({ example: true })
  tieneDiagnostico!: boolean

  @ApiProperty({ example: false, description: 'true si tieneDiagnostico=false, para sugerir conexión con especialistas' })
  requiereEvaluacion!: boolean

  @ApiPropertyOptional({ example: 'infancia', nullable: true })
  temporalidadOrigen?: string | null

  @ApiPropertyOptional({ example: 'imagenes', nullable: true })
  preferenciaFormato?: string | null

  @ApiPropertyOptional({ example: ['educacion', 'comunidad'], type: [String], nullable: true })
  areasInteres?: string[] | null

  @ApiPropertyOptional({ example: 'bajo_costo', nullable: true })
  viabilidadEconomica?: string | null
}
