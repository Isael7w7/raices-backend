import { ApiProperty } from '@nestjs/swagger'
import { InstitucionDto } from '../../institutions/dto/respuestas-institucion.dto'

export class InstitucionRelevanteDto extends InstitucionDto {
  @ApiProperty({
    description: 'Indica si la institución atiende al menos un tipo de discapacidad del perfil del usuario',
    example: true,
  })
  coincidePerfil: boolean
}
