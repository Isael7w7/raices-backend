import { IsEmail, IsString, MinLength, IsIn, IsOptional } from 'class-validator'

export class RegisterDto {
  @IsEmail() email: string
  @IsString() @MinLength(6) password: string
  @IsString() full_name: string
  @IsIn(['pcd', 'tutor', 'institution']) role: string
  @IsOptional() @IsString() city?: string
  @IsOptional() @IsString() state?: string
}
