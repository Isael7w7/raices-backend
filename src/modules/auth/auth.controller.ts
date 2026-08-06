import { Controller, Post, Get, Body, HttpCode, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiOkResponse, ApiCreatedResponse, ApiBearerAuth } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { RefreshTokenDto } from './dto/refresh-token.dto'
import { RespuestaRegistroDto, RespuestaSesionDto, RespuestaPerfilDto } from './dto/respuestas-auth.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { UseETag } from '../../common/decorators/use-etag.decorator'

@ApiTags('Autenticación')
@Controller('autenticacion')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('registro')
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 registros por hora
  @ApiOperation({ summary: 'Registrar nuevo usuario', description: 'Crea una cuenta con rol pcd, tutor o institución. El registro no inicia sesión: devuelve el usuario con requiereInicioSesion: true y el cliente debe llamar a inicio-sesion para obtener los tokens.' })
  @ApiCreatedResponse({ type: RespuestaRegistroDto, description: 'Cuenta creada. Retorna el usuario y requiereInicioSesion: true (sin tokens). El cliente debe redirigir al inicio de sesión.' })
  @ApiResponse({ status: 409, description: 'Correo ya registrado' })
  register(@Body() dto: RegisterDto) { return this.authService.register(dto) }

  @Post('inicio-sesion')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 intentos de login por minuto
  @ApiOperation({ summary: 'Iniciar sesión', description: 'Autentica usuario con Firebase Auth y retorna token' })
  @ApiOkResponse({ type: RespuestaSesionDto, description: 'Sesión iniciada exitosamente' })
  @ApiResponse({ status: 401, description: 'Credenciales incorrectas o cuenta desactivada' })
  login(@Body() dto: LoginDto) { return this.authService.login(dto) }

  @Post('renovar-token')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 refreshes por minuto
  @ApiOperation({ summary: 'Renovar token de acceso', description: 'Intercambia un token de refresco de Firebase por un nuevo par de tokens (acceso + refresco)' })
  @ApiOkResponse({ type: RespuestaSesionDto, description: 'Tokens renovados exitosamente' })
  @ApiResponse({ status: 401, description: 'Token de refresco inválido o expirado' })
  refresh(@Body() dto: RefreshTokenDto) { return this.authService.refresh(dto.tokenRefresco) }

  @Get('yo')
  @UseGuards(JwtAuthGuard)
  @UseETag()
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  @ApiOkResponse({ type: RespuestaPerfilDto, description: 'Perfil del usuario' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  me(@CurrentUser() user: CurrentUserPayload) { return this.authService.me(user.id) }
}
