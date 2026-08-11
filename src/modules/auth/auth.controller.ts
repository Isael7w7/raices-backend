import { Controller, Post, Get, Body, HttpCode, UseGuards, Res, Req, Logger, BadRequestException, ForbiddenException } from '@nestjs/common'
import { Request, Response } from 'express'
import { ConfigService } from '@nestjs/config'
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
import { NOMBRE_COOKIE_ACCESO, NOMBRE_COOKIE_REFRESCO, parseCookies } from '../../common/utils/cookies'
import { esOrigenPermitido, obtenerOrigenesPermitidos } from '../../common/utils/cors-origins'

// Duración de las cookies de sesión (ms). El ID token de Firebase expira en 1h
// y el refresh token vive ~30 días; se alinean las cookies a esos ciclos.
const COOKIE_ACCESO_MAX_AGE_MS = 60 * 60 * 1000 // 1 hora
const COOKIE_REFRESCO_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 días

@ApiTags('Autenticación')
@Controller('autenticacion')
export class AuthController {
  private readonly logger = new Logger('AuthController')

  // Evita repetir warnings de configuración en cada request.
  private static warningSecureLogged = false
  private static warningSameSiteLogged = false

  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('registro')
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 registros por hora
  @ApiOperation({ summary: 'Registrar nuevo usuario', description: 'Crea una cuenta con rol pcd, tutor o institución. El registro no inicia sesión: devuelve el usuario con requiereInicioSesion: true y el cliente debe llamar a inicio-sesion para obtener los tokens.' })
  @ApiCreatedResponse({ type: RespuestaRegistroDto, description: 'Cuenta creada. Retorna el usuario y requiereInicioSesion: true (sin tokens). El cliente debe redirigir al inicio de sesión.' })
  @ApiResponse({ status: 409, description: 'Correo ya registrado' })
  register(@Body() dto: RegisterDto) { return this.authService.register(dto) }

  @Post('inicio-sesion')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 intentos de login por minuto
  @ApiOperation({ summary: 'Iniciar sesión', description: 'Autentica usuario con Firebase Auth, retorna tokens en el body (compatibilidad) y además los establece como cookies httpOnly. El guard acepta ambos mecanismos.' })
  @ApiOkResponse({ type: RespuestaSesionDto, description: 'Sesión iniciada exitosamente. Los tokens también se envían como cookies httpOnly (token_acceso, token_refresco).' })
  @ApiResponse({ status: 401, description: 'Credenciales incorrectas o cuenta desactivada' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const resultado = await this.authService.login(dto)
    this.establecerCookiesSesion(res, resultado)
    return resultado
  }

  @Post('renovar-token')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 refreshes por minuto
  @ApiOperation({ summary: 'Renovar token de acceso', description: 'Intercambia un token de refresco de Firebase por un nuevo par de tokens (acceso + refresco) y refresca las cookies httpOnly. El token de refresco puede venir en el body o en la cookie httpOnly token_refresco.' })
  @ApiOkResponse({ type: RespuestaSesionDto, description: 'Tokens renovados exitosamente' })
  @ApiResponse({ status: 400, description: 'Falta el token de refresco (body o cookie)' })
  @ApiResponse({ status: 401, description: 'Token de refresco inválido o expirado' })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // El refresh token puede viajar en el body (compatibilidad) o en la cookie
    // httpOnly token_refresco (flujo seguro: JS nunca lo ve).
    const tokenRefresco = dto.tokenRefresco ?? parseCookies(req.headers.cookie)[NOMBRE_COOKIE_REFRESCO]
    if (!tokenRefresco) {
      throw new BadRequestException('Token de refresco requerido (body o cookie)')
    }
    const resultado = await this.authService.refresh(tokenRefresco)
    this.establecerCookiesSesion(res, resultado)
    return resultado
  }

  @Post('cerrar-sesion')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Cerrar sesión', description: 'Elimina las cookies httpOnly de sesión. El cliente debe llamar a este endpoint al desloguear, ya que JavaScript no puede borrar cookies httpOnly.' })
  @ApiResponse({ status: 204, description: 'Cookies de sesión eliminadas' })
  @ApiResponse({ status: 403, description: 'Origen no permitido (posible CSRF de logout)' })
  cerrarSesion(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Defensa CSRF de logout: este endpoint no requiere autenticación, así que
    // con sameSite=none un sitio externo podría forzar el cierre de sesión.
    const origin = req.headers['origin'] as string | undefined
    const config = { get: (key: string) => this.config.get(key) }
    if (!esOrigenPermitido(origin, obtenerOrigenesPermitidos(config))) {
      throw new ForbiddenException('Origen no permitido (posible CSRF)')
    }

    const base = this.opcionesBaseCookie()
    res.clearCookie(NOMBRE_COOKIE_ACCESO, base)
    res.clearCookie(NOMBRE_COOKIE_REFRESCO, base)
  }

  @Get('yo')
  @UseGuards(JwtAuthGuard)
  @UseETag()
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  @ApiOkResponse({ type: RespuestaPerfilDto, description: 'Perfil del usuario' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  me(@CurrentUser() user: CurrentUserPayload) { return this.authService.me(user.id) }

  // ─── Cookies httpOnly ─────────────────────────────────────────────────────

  /**
   * Opciones base de las cookies de sesión. Secure se activa por defecto en
   * producción (HTTPS) y se puede forzar con COOKIE_SECURE; sameSite se
   * configura con COOKIE_SAMESITE (lax por defecto, mitiga CSRF).
   */
  private opcionesBaseCookie() {
    const secureExplicito = this.config.get<string>('COOKIE_SECURE')
    const secure = secureExplicito !== undefined
      ? secureExplicito === 'true'
      : process.env.NODE_ENV === 'production'

    const sameSiteConfigurado = (this.config.get<string>('COOKIE_SAMESITE') ?? 'lax').toLowerCase()
    const sameSite = ['lax', 'none', 'strict'].includes(sameSiteConfigurado)
      ? (sameSiteConfigurado as 'lax' | 'none' | 'strict')
      : 'lax'

    if (sameSite === 'none' && !secure && !AuthController.warningSameSiteLogged) {
      // Los navegadores rechazan SameSite=None sin Secure.
      AuthController.warningSameSiteLogged = true
      this.logger.warn('COOKIE_SAMESITE=none requiere COOKIE_SECURE=true: las cookies serán rechazadas.')
    }
    if (!secure && this.config.get<string>('NODE_ENV') === 'production' && !AuthController.warningSecureLogged) {
      // Footgun de despliegue: en producción las cookies deben viajar solo por HTTPS.
      AuthController.warningSecureLogged = true
      this.logger.warn('COOKIE_SECURE está desactivado en producción: las cookies de sesión viajarán sin Secure. Configurá COOKIE_SECURE=true.')
    }

    return {
      httpOnly: true, // invisible para JavaScript → inmune a robo por XSS
      secure,
      sameSite,
      path: '/',
    }
  }

  /** Establece las cookies httpOnly con el acceso (1h) y refresco (30d). */
  private establecerCookiesSesion(res: Response, sesion: { tokenAcceso: string; tokenRefresco: string }) {
    const base = this.opcionesBaseCookie()
    res.cookie(NOMBRE_COOKIE_ACCESO, sesion.tokenAcceso, { ...base, maxAge: COOKIE_ACCESO_MAX_AGE_MS })
    res.cookie(NOMBRE_COOKIE_REFRESCO, sesion.tokenRefresco, { ...base, maxAge: COOKIE_REFRESCO_MAX_AGE_MS })
  }
}
