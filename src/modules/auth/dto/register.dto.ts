import { IsEmail, IsString, MinLength, IsIn, IsOptional } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class RegisterDto {
  @ApiProperty({ description: 'Correo electrónico del usuario', example: 'usuario@correo.mx' })
  @IsEmail() email: string
  @ApiProperty({ description: 'Contraseña (mínimo 6 caracteres)', example: 'MiPassword123' })
  @IsString() @MinLength(6) password: string
  @ApiProperty({ description: 'Nombre completo', example: 'Juan Pérez' })
  @IsString() nombreCompleto: string
  @ApiProperty({ description: 'Rol del usuario', enum: ['pcd', 'tutor', 'institution'] })
  @IsIn(['pcd', 'tutor', 'institution']) rol: string
  @ApiPropertyOptional({ description: 'Ciudad', example: 'Mérida' })
  @IsOptional() @IsString() ciudad?: string
  @ApiPropertyOptional({ description: 'Estado', example: 'Yucatán' })
  @IsOptional() @IsString() estado?: string
}
