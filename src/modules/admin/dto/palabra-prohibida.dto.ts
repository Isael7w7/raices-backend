import { ApiProperty } from '@nestjs/swagger'

/** Contrato de salida de una palabra prohibida (panel de administración). */
export class PalabraProhibidaDto {
  @ApiProperty({ description: 'ID del documento en Firestore', example: 'xY7bK2mQ9pL1' })
  id!: string

  @ApiProperty({ description: 'Término normalizado (minúsculas, sin acentos)', example: 'chaneque' })
  palabra!: string

  @ApiProperty({ description: 'Categoría del término', example: 'insulto_local' })
  categoria!: string

  @ApiProperty({ description: 'Si la palabra se incluye en el prompt de moderación', example: true })
  activa!: boolean

  @ApiProperty({ description: 'ID del administrador que la agregó', example: 'uid-admin-123', nullable: true, type: String })
  creadoPor!: string | null

  @ApiProperty({ description: 'Fecha de creación en ISO 8601', example: '2026-11-03T18:24:00.000Z' })
  fechaCreacion!: string
}
