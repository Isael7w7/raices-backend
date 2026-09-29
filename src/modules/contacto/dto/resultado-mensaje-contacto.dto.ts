import { ApiProperty } from '@nestjs/swagger'

export class ResultadoMensajeContactoDto {
  @ApiProperty({ example: 'aBcD1234efGh', description: 'Identificador del mensaje guardado' })
  id!: string

  @ApiProperty({ example: 'pendiente', enum: ['pendiente'], description: 'Estado inicial del mensaje' })
  estado!: 'pendiente'
}
