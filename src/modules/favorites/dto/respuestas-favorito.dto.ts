import { ApiProperty } from '@nestjs/swagger'

export class RespuestaAlternarFavoritoDto {
  @ApiProperty({ description: 'Estado del favorito tras la operación', example: true })
  favorito!: boolean
}
