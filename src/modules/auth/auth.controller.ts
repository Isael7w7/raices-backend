import { Controller, Post, Get, Body, HttpCode, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { RefreshTokenDto } from './dto/refresh-token.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { UseETag } from '../../common/decorators/use-etag.decorator'

@ApiTags('Autenticación')
@Controller('autenticacion')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('registro')
  @ApiOperation({ summary: 'Registrar nuevo usuario', description: 'Crea una cuenta con rol pcd, tutor o institución' })
  @ApiResponse({ status: 201, description: 'Registro exitoso, retorna token JWT y datos del usuario' })
  @ApiResponse({ status: 409, description: 'Correo ya registrado' })
  register(@Body() dto: RegisterDto) { return this.authService.register(dto) }

  @Post('inicio-sesion')
  @HttpCode(200)
  @ApiOperation({ summary: 'Iniciar sesión', description: 'Autentica usuario con Firebase Auth y retorna token' })
  @ApiResponse({ status: 200, description: 'Sesión iniciada exitosamente' })
  @ApiResponse({ status: 401, description: 'Credenciales incorrectas o cuenta desactivada' })
  login(@Body() dto: LoginDto) { return this.authService.login(dto) }

  @Post('renovar-token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renovar token de acceso', description: 'Intercambia un token de refresco de Firebase por un nuevo par de tokens (acceso + refresco)' })
  @ApiResponse({ status: 200, description: 'Tokens renovados exitosamente' })
  @ApiResponse({ status: 401, description: 'Token de refresco inválido o expirado' })
  refresh(@Body() dto: RefreshTokenDto) { return this.authService.refresh(dto.tokenRefresco) }

  @Get('yo')
  @UseGuards(JwtAuthGuard)
  @UseETag()
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  me(@CurrentUser() user: any) { return this.authService.me(user.id) }
}
