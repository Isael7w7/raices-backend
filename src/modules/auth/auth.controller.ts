import { Controller, Post, Get, Body, HttpCode, UseGuards, Res, UseInterceptors, UploadedFile, Optional } from '@nestjs/common'
import { Response } from 'express'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { StorageService } from '../storage/storage.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { RefreshTokenDto } from './dto/refresh-token.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { UseETag } from '../../common/decorators/use-etag.decorator'

/** Cookie options shared by register & login */
const ACCESS_COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 1000 * 60 * 60, // 1 h
}

const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 1000 * 60 * 60 * 24 * 30, // 30 días
}

@ApiTags('Autenticación')
@Controller('autenticacion')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly storage: StorageService,
  ) {}

  @Post('registro')
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('documentoCsf', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Registrar nuevo usuario', description: 'Crea una cuenta con rol pcd, tutor o institución. Opcionalmente acepta archivo CSF (Constancia de Situación Fiscal) en el campo documentoCsf. No se valida el contenido del archivo en este endpoint; queda pendiente para revisión del Admin.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 6 },
        nombreCompleto: { type: 'string' },
        rol: { type: 'string', enum: ['pcd', 'tutor', 'institution', 'institucion', 'institucional', 'empresa', 'padre_tutor'] },
        ciudad: { type: 'string' },
        estado: { type: 'string' },
        documentoCsf: { type: 'string', format: 'binary', description: 'Constancia de Situación Fiscal (PDF, JPG, PNG). Máximo 10MB. No se valida aquí.' },
      },
      required: ['email', 'password', 'nombreCompleto', 'rol'],
    },
  })
  @ApiResponse({ status: 201, description: 'Registro y login exitoso, tokens en cookies httpOnly' })
  @ApiResponse({ status: 409, description: 'Correo ya registrado' })
  async register(
    @Body() dto: RegisterDto,
    @UploadedFile() documentoCsf?: Express.Multer.File,
    @Res({ passthrough: true }) res?: Response,
  ) {
    let csfUrl: string | undefined

    if (documentoCsf) {
      csfUrl = await this.storage.upload(documentoCsf.buffer, documentoCsf.originalname, 'csf')
    }

    // Acepta el archivo (multipart, campo documentoCsf) o la URL de Storage
    // enviada en el JSON del DTO. El contenido de la CSF NO se valida aquí.
    const result = await this.authService.register(dto, csfUrl ?? dto.documentoCsf)

    if (res) {
      res.cookie('token_acceso', result.tokenAcceso, ACCESS_COOKIE_OPTS)
      res.cookie('token_refresco', result.tokenRefresco, REFRESH_COOKIE_OPTS)
    }

    return { mensaje: 'Registro y login exitoso' }
  }

  @Post('inicio-sesion')
  @HttpCode(200)
  @ApiOperation({ summary: 'Iniciar sesión', description: 'Autentica usuario con Firebase Auth y retorna token' })
  @ApiResponse({ status: 200, description: 'Sesión iniciada exitosamente, tokens en cookies httpOnly' })
  @ApiResponse({ status: 401, description: 'Credenciales incorrectas o cuenta desactivada' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto)
    res.cookie('token_acceso', result.tokenAcceso, ACCESS_COOKIE_OPTS)
    res.cookie('token_refresco', result.tokenRefresco, REFRESH_COOKIE_OPTS)
    return { mensaje: 'Sesión iniciada exitosamente' }
  }

  @Post('renovar-token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renovar token de acceso', description: 'Intercambia un token de refresco de Firebase por un nuevo par de tokens (acceso + refresco)' })
  @ApiResponse({ status: 200, description: 'Tokens renovados exitosamente' })
  @ApiResponse({ status: 401, description: 'Token de refresco inválido o expirado' })
  async refresh(@Body() dto: RefreshTokenDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.refresh(dto.tokenRefresco)
    res.cookie('token_acceso', result.tokenAcceso, ACCESS_COOKIE_OPTS)
    res.cookie('token_refresco', result.tokenRefresco, REFRESH_COOKIE_OPTS)
    return { mensaje: 'Token renovado exitosamente' }
  }

  @Get('yo')
  @UseGuards(JwtAuthGuard)
  @UseETag()
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  me(@CurrentUser() user: any) { return this.authService.me(user.id) }
}
