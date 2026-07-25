import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

export class RecomendacionIaDto {
  @ApiProperty({ description: 'ID de un dependiente para obtener recomendaciones personalizadas', required: false })
  @IsOptional() @IsString() dependienteId?: string
}
