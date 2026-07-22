import { Controller, Get, Put, Post, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { UsersService } from './users.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { UseETag } from '../../common/decorators/use-etag.decorator'

@ApiTags('Usuarios')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('usuarios')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get('perfil')
  @UseETag()
  @ApiOperation({ summary: 'Obtener perfil completo del usuario', description: 'Retorna perfil + datos de profiling (discapacidad, necesidades, etc.)' })
  @ApiResponse({ status: 200, description: 'Perfil completo' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  profile(@CurrentUser() user: any) { return this.svc.getProfile(user.id) }

  @Put('perfil')
  @ApiOperation({ summary: 'Actualizar perfil básico' })
  @ApiResponse({ status: 200, description: 'Perfil actualizado' })
  updateProfile(@CurrentUser() user: any, @Body() body: any) {
    return this.svc.updateProfile(user.id, body)
  }

  @Post('perfil-necesidades')
  @ApiOperation({ summary: 'Guardar perfil de necesidades', description: 'Guarda tipos de discapacidad, necesidades, metas, historial, etc.' })
  @ApiResponse({ status: 200, description: 'Perfil de necesidades guardado' })
  saveProfiling(@CurrentUser() user: any, @Body() body: any) {
    return this.svc.saveProfilingData(user.id, body)
  }

  @Get('dependientes')
  @UseETag()
  @ApiOperation({ summary: 'Listar dependientes', description: 'Retorna personas bajo cuidado del usuario (hijos, pacientes)' })
  @ApiResponse({ status: 200, description: 'Lista de dependientes' })
  dependents(@CurrentUser() user: any) { return this.svc.getDependents(user.id) }

  @Post('dependientes')
  @ApiOperation({ summary: 'Agregar dependiente' })
  @ApiResponse({ status: 201, description: 'Dependiente creado' })
  addDependent(@CurrentUser() user: any, @Body() body: any) {
    return this.svc.addDependent(user.id, body)
  }

  @Put('dependientes/:id')
  @ApiOperation({ summary: 'Actualizar dependiente' })
  @ApiParam({ name: 'id', description: 'ID del dependiente' })
  @ApiResponse({ status: 200, description: 'Dependiente actualizado' })
  @ApiResponse({ status: 404, description: 'Dependiente no encontrado' })
  updateDependent(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.updateDependent(user.id, id, body)
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
