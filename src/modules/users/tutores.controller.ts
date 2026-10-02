import { Body, Controller, Get, Param, Patch, Put, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { UseETag } from '../../common/decorators/use-etag.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { ActualizarPermisosDependienteDto } from './dto/actualizar-permisos-dependiente.dto'
import { RespuestaPermisosActualizadosDto, RespuestaPermisosDependienteDto } from './dto/respuestas-usuario.dto'
import { UsersService } from './users.service'

@ApiTags('Tutores')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('tutores')
export class TutoresController {
  constructor(private readonly svc: UsersService) {}

  @Get('dependientes/:dependienteId/permisos')
  @UseETag()
  @UseGuards(RolesGuard)
  @Roles('padre_tutor', 'tutor', 'admin')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Permisos de dependiente (tutor)',
    description: 'Retorna features y permisos (módulos y acciones del modal de tutor) de un dependiente o cuenta PCD vinculada. Solo el tutor dueño o un administrador pueden consultarlos.',
  })
  @ApiParam({ name: 'dependienteId', description: 'ID del dependiente' })
  @ApiOkResponse({ type: RespuestaPermisosDependienteDto, description: 'Permisos del dependiente' })
  @ApiResponse({ status: 404, description: 'Dependiente no encontrado' })
  getPermisos(@CurrentUser() user: CurrentUserPayload, @Param('dependienteId') dependienteId: string) {
    return this.svc.getDependentPermissions(user.id, dependienteId, user.rol)
  }

  @Put('dependientes/:dependienteId/permisos')
  @UseGuards(RolesGuard)
  @Roles('padre_tutor', 'tutor')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Guardar permisos de dependiente (tutor, PUT)',
    description: 'Persiste los módulos (Configurar opciones) y acciones (Permisos de acceso) enviados por el modal de tutor. Solo se modifican los campos enviados y se actualizan las features funcionales correspondientes.',
  })
  @ApiParam({ name: 'dependienteId', description: 'ID del dependiente' })
  @ApiBody({ type: ActualizarPermisosDependienteDto })
  @ApiOkResponse({ type: RespuestaPermisosActualizadosDto, description: 'Permisos actualizados' })
  @ApiResponse({ status: 400, description: 'No se recibieron permisos para actualizar' })
  @ApiResponse({ status: 404, description: 'Dependiente no encontrado' })
  guardarPermisosPut(@CurrentUser() user: CurrentUserPayload, @Param('dependienteId') dependienteId: string, @Body() dto: ActualizarPermisosDependienteDto) {
    return this.svc.actualizarPermisosDependiente(user.id, dependienteId, dto)
  }

  @Patch('dependientes/:dependienteId/permisos')
  @UseGuards(RolesGuard)
  @Roles('padre_tutor', 'tutor')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Guardar permisos de dependiente (tutor, PATCH)',
    description: 'Mismo comportamiento que PUT /tutores/dependientes/:dependienteId/permisos.',
  })
  @ApiParam({ name: 'dependienteId', description: 'ID del dependiente' })
  @ApiBody({ type: ActualizarPermisosDependienteDto })
  @ApiOkResponse({ type: RespuestaPermisosActualizadosDto, description: 'Permisos actualizados' })
  @ApiResponse({ status: 400, description: 'No se recibieron permisos para actualizar' })
  @ApiResponse({ status: 404, description: 'Dependiente no encontrado' })
  guardarPermisosPatch(@CurrentUser() user: CurrentUserPayload, @Param('dependienteId') dependienteId: string, @Body() dto: ActualizarPermisosDependienteDto) {
    return this.svc.actualizarPermisosDependiente(user.id, dependienteId, dto)
  }
}
