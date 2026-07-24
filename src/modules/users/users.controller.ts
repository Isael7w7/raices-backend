import { Controller, Get, Put, Post, Delete, Param, Body, UseGuards, UseInterceptors, UploadedFile, BadRequestException, ParseFilePipe, FileTypeValidator, MaxFileSizeValidator } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiConsumes, ApiBody } from '@nestjs/swagger'
import { UsersService } from './users.service'
import { StorageService } from '../storage/storage.service'
import { GuardarPerfilNecesidadesDto } from './dto/guardar-perfil-necesidades.dto'
import { CrearDependienteDto } from './dto/crear-dependiente.dto'
import { ActualizarPerfilDto } from './dto/actualizar-perfil.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { UseETag } from '../../common/decorators/use-etag.decorator'

@ApiTags('Usuarios')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('usuarios')
export class UsersController {
  constructor(
    private readonly svc: UsersService,
    private readonly storage: StorageService,
  ) {}

  @Get('perfil')
  @UseETag()
  @ApiOperation({ summary: 'Obtener perfil completo del usuario', description: 'Retorna perfil + datos de profiling (discapacidad, necesidades, etc.)' })
  @ApiResponse({ status: 200, description: 'Perfil completo' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  profile(@CurrentUser() user: any) { return this.svc.getProfile(user.id) }

  @Put('perfil')
  @ApiOperation({ summary: 'Actualizar perfil básico', description: 'Actualiza nombre, ciudad, estado o urlAvatar del usuario autenticado.' })
  @ApiBody({ type: ActualizarPerfilDto })
  @ApiResponse({ status: 200, description: 'Perfil actualizado' })
  updateProfile(@CurrentUser() user: any, @Body() dto: ActualizarPerfilDto) {
    return this.svc.updateProfile(user.id, dto)
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('avatar', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Subir/actualizar foto de perfil', description: 'Sube una imagen (JPEG, PNG, WebP o GIF) de hasta 5MB para usarla como avatar del usuario autenticado.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { avatar: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, description: 'Avatar actualizado correctamente' })
  @ApiResponse({ status: 400, description: 'Archivo inválido o demasiado grande' })
  async uploadAvatar(
    @CurrentUser() user: any,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp|gif)$/ }),
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo')
    }
    const urlAvatar = await this.storage.upload(file.buffer, file.originalname, 'avatars')
    return this.svc.updateAvatar(user.id, urlAvatar)
  }

  @Delete('avatar')
  @ApiOperation({ summary: 'Eliminar foto de perfil', description: 'Elimina el avatar del usuario de Firebase Storage y limpia el campo en la base de datos.' })
  @ApiResponse({ status: 200, description: 'Foto de perfil eliminada correctamente' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  deleteAvatar(@CurrentUser() user: any) {
    return this.svc.deleteAvatar(user.id)
  }

  @Post('perfil-necesidades')
  @ApiOperation({ summary: 'Guardar perfil de necesidades', description: 'Guarda tipos de discapacidad, necesidades, metas, historial, etc.' })
  @ApiBody({ type: GuardarPerfilNecesidadesDto })
  @ApiResponse({ status: 201, description: 'Perfil de necesidades guardado con éxito' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  saveProfiling(@CurrentUser() user: any, @Body() dto: GuardarPerfilNecesidadesDto) {
    return this.svc.saveProfilingData(user.id, dto)
  }

  @Get('dependientes')
  @UseETag()
  @ApiOperation({ summary: 'Listar dependientes', description: 'Retorna personas bajo cuidado del usuario (hijos, pacientes)' })
  @ApiResponse({ status: 200, description: 'Lista de dependientes' })
  dependents(@CurrentUser() user: any) { return this.svc.getDependents(user.id) }

  @Post('dependientes')
  @ApiOperation({ summary: 'Agregar dependiente' })
  @ApiBody({ type: CrearDependienteDto })
  @ApiResponse({ status: 201, description: 'Dependiente creado' })
  addDependent(@CurrentUser() user: any, @Body() dto: CrearDependienteDto) {
    return this.svc.addDependent(user.id, dto)
  }

  @Get('dependientes/:id')
  @ApiOperation({ summary: 'Detalle de dependiente', description: 'Retorna la información de un dependiente específico por su ID.' })
  @ApiParam({ name: 'id', description: 'ID del dependiente' })
  @ApiResponse({ status: 200, description: 'Dependiente encontrado' })
  @ApiResponse({ status: 404, description: 'Dependiente no encontrado' })
  getDependent(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.getDependent(user.id, id)
  }

  @Put('dependientes/:id')
  @ApiOperation({ summary: 'Actualizar dependiente' })
  @ApiBody({ type: CrearDependienteDto })
  @ApiParam({ name: 'id', description: 'ID del dependiente' })
  @ApiResponse({ status: 200, description: 'Dependiente actualizado' })
  @ApiResponse({ status: 404, description: 'Dependiente no encontrado' })
  updateDependent(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: CrearDependienteDto) {
    return this.svc.updateDependent(user.id, id, dto)
  }

  @Delete('dependientes/:id')
  @ApiOperation({ summary: 'Eliminar dependiente' })
  @ApiParam({ name: 'id', description: 'ID del dependiente' })
  @ApiResponse({ status: 200, description: 'Dependiente eliminado' })
  @ApiResponse({ status: 404, description: 'Dependiente no encontrado' })
  deleteDependent(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.deleteDependent(user.id, id)
  }
}
