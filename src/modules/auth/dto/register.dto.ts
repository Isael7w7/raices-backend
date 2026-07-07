import { IsEmail, IsString, MinLength, IsIn, IsOptional } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class RegisterDto {
  @ApiProperty({ description: 'Email del usuario', example: 'usuario@correo.mx' })
  @IsEmail() email: string
  @ApiProperty({ description: 'Contraseña (mínimo 6 caracteres)', example: 'MiPassword123' })
  @IsString() @MinLength(6) password: string
  @ApiProperty({ description: 'Nombre completo', example: 'Juan Pérez' })
  @IsString() full_name: string
  @ApiProperty({ description: 'Rol del usuario', enum: ['pcd', 'tutor', 'institution'] })
  @IsIn(['pcd', 'tutor', 'institution']) role: string
  @ApiPropertyOptional({ description: 'Ciudad', example: 'Mérida' })
  @IsOptional() @IsString() city?: string
  @ApiPropertyOptional({ description: 'Estado', example: 'Yucatán' })
  @IsOptional() @IsString() state?: string
}
