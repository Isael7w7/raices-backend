import { Controller, Post, Get, Body, HttpCode, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registrar nuevo usuario', description: 'Crea una cuenta con rol pcd, tutor o institution' })
  @ApiResponse({ status: 201, description: 'Registro exitoso, retorna token JWT y datos del usuario' })
  @ApiResponse({ status: 409, description: 'Email ya registrado' })
  register(@Body() dto: RegisterDto) { return this.authService.register(dto) }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Iniciar sesión', description: 'Autentica usuario y retorna token JWT' })
  @ApiResponse({ status: 200, description: 'Login exitoso' })
  @ApiResponse({ status: 401, description: 'Credenciales incorrectas o cuenta desactivada' })
  login(@Body() dto: LoginDto) { return this.authService.login(dto) }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  me(@CurrentUser() user: any) { return this.authService.me(user.id) }
}
