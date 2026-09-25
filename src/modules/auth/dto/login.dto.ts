import { IsEmail, IsString } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'

export class LoginDto {
  @ApiProperty({ description: 'Correo registrado', example: 'demo@raices.mx' })
  // Normalización defensiva: el correo siempre se procesa en minúsculas,
  // aunque el cliente lo envíe con mayúsculas.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail() email!: string
  @ApiProperty({ description: 'Contraseña', example: 'Demo1234' })
  @IsString() password!: string
}
