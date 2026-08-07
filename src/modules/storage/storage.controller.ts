import { Controller, Post, UseGuards, UseInterceptors, UploadedFile, BadRequestException, ParseFilePipe, MaxFileSizeValidator } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiCreatedResponse, ApiBearerAuth, ApiConsumes, ApiBody, ApiResponse } from '@nestjs/swagger'
import { StorageService } from './storage.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { FeatureGuard } from '../../common/guards/feature.guard'
import { Feature } from '../../common/decorators/feature.decorator'
import { MultimediaMagicBytesValidator } from '../../common/validators/multimedia-magic-bytes.validator'

const MAX_MULTIMEDIA_SIZE = 10 * 1024 * 1024 // 10 MB

@ApiTags('Multimedia')
@Controller('multimedia')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Feature('multimedia')
  @ApiBearerAuth('jwt-auth')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: MAX_MULTIMEDIA_SIZE } }))
  @ApiOperation({ summary: 'Subir multimedia', description: 'Sube una imagen o video (hasta 10MB) para adjuntarlo a mensajes o publicaciones. Requiere el permiso multimedia activo.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { archivo: { type: 'string', format: 'binary' } } } })
  @ApiCreatedResponse({ schema: { type: 'object', properties: { url: { type: 'string' } } }, description: 'URL pública del archivo subido' })
  @ApiResponse({ status: 400, description: 'Archivo inválido o demasiado grande (solo imágenes/videos hasta 10MB)' })
  @ApiResponse({ status: 403, description: 'Funcionalidad "multimedia" desactivada para tu cuenta' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async upload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MultimediaMagicBytesValidator(),
          new MaxFileSizeValidator({ maxSize: MAX_MULTIMEDIA_SIZE }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo')
    }
    const url = await this.storage.upload(file.buffer, file.originalname, 'multimedia')
    return { url }
  }
}
