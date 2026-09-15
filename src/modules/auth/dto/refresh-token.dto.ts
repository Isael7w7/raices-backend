import { IsOptional, IsString } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class RefreshTokenDto {
  @ApiPropertyOptional({
    description: 'Token de refresco obtenido en inicio de sesión. Opcional si se envía la cookie httpOnly token_refresco.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsOptional()
  @IsString()
  tokenRefresco?: string
}
