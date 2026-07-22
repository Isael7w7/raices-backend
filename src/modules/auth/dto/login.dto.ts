import { IsEmail, IsString } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class LoginDto {
  @ApiProperty({ description: 'Correo registrado', example: 'demo@raices.mx' })
  @IsEmail() email: string
  @ApiProperty({ description: 'Contraseña', example: 'Demo1234' })
  @IsString() password: string
}
