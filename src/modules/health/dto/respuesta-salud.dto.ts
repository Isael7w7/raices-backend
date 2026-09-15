import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CheckProcesoDto {
  @ApiProperty({ example: 'ok' }) estado!: string
  @ApiProperty({ example: 3600 }) uptimeSegundos!: number
  @ApiProperty({ example: 120 }) memoriaMb!: number
  @ApiProperty({ example: 'v22.0.0' }) versionNode!: string
  @ApiProperty({ example: '2026-08-06T00:00:00.000Z' }) timestamp!: string
}

export class CheckFirestoreDto {
  @ApiProperty({ example: 'ok' }) estado!: string
  @ApiPropertyOptional({ example: 'Timeout al consultar Firestore' }) detalle?: string
}

export class ChecksHealthDto {
  @ApiProperty({ type: CheckProcesoDto }) proceso!: CheckProcesoDto
  @ApiProperty({ type: CheckFirestoreDto }) firestore!: CheckFirestoreDto
}

export class ResultadoHealthDto {
  @ApiProperty({ enum: ['ok', 'degraded'], example: 'ok' }) status!: string
  @ApiProperty({ type: ChecksHealthDto }) checks!: ChecksHealthDto
  @ApiProperty({ example: 8 }) tiempoMs!: number
}
