import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, HttpCode } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger'
import { CommunityService } from './community.service'
import { CrearPublicacionDto } from './dto/crear-publicacion.dto'
import { CrearComentarioDto } from './dto/crear-comentario.dto'
import { CrearGrupoDto } from './dto/crear-grupo.dto'
import { ActualizarPublicacionDto } from './dto/actualizar-publicacion.dto'
import { PaginacionDto, EJEMPLO_RESPUESTA_PAGINADA } from '../../common/dto/paginacion.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { FeatureGuard } from '../../common/guards/feature.guard'
import { Feature } from '../../common/decorators/feature.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'

@ApiTags('Comunidad')
@Controller('comunidad')
export class CommunityController {
  constructor(private readonly svc: CommunityService) {}

  @Get('grupos')
  @ApiOperation({ summary: 'Listar grupos públicos', description: 'Retorna grupos de comunidad con paginación, ordenados por miembros' })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', example: 1 })
  @ApiQuery({ name: 'limite', required: false, description: 'Elementos por página', example: 20 })
  @ApiResponse({ status: 200, description: 'Lista paginada de grupos públicos', schema: EJEMPLO_RESPUESTA_PAGINADA })
  groups(@Query() paginacion: PaginacionDto) { return this.svc.getGroups(paginacion.pagina, paginacion.limite, paginacion.ordenarPor, paginacion.direccion, paginacion.buscar) }

  @Get('publicaciones')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Listar publicaciones', description: 'Retorna publicaciones con paginación, información del autor y me gusta' })
  @ApiQuery({ name: 'grupoId', required: false, description: 'Filtrar por grupo' })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', example: 1 })
  @ApiQuery({ name: 'limite', required: false, description: 'Elementos por página', example: 20 })
  @ApiResponse({ status: 200, description: 'Lista paginada de publicaciones', schema: EJEMPLO_RESPUESTA_PAGINADA })
  posts(@Query('grupoId') grupoId: string, @CurrentUser() user: CurrentUserPayload, @Query() paginacion: PaginacionDto) {
    return this.svc.getPosts(grupoId, user.id, paginacion.pagina, paginacion.limite, paginacion.ordenarPor, paginacion.direccion, paginacion.buscar)
  }

  @Get('publicaciones/:id/comentarios')
  @ApiOperation({ summary: 'Comentarios de una publicación', description: 'Retorna comentarios con paginación' })
  @ApiParam({ name: 'id', description: 'ID de la publicación' })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', example: 1 })
  @ApiQuery({ name: 'limite', required: false, description: 'Elementos por página', example: 20 })
  @ApiResponse({ status: 200, description: 'Lista paginada de comentarios con autor', schema: EJEMPLO_RESPUESTA_PAGINADA })
  comments(@Param('id') id: string, @Query() paginacion: PaginacionDto) { return this.svc.getComments(id, paginacion.pagina, paginacion.limite) }

  @Post('publicaciones')
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Feature('comunidad')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Crear publicación', description: 'Publica una publicación en el muro general o en un grupo específico' })
  @ApiResponse({ status: 201, description: 'Publicación creada' })
  @ApiResponse({ status: 403, description: 'Funcionalidad de comunidad desactivada para tu cuenta' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  createPost(@Body() dto: CrearPublicacionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.createPost(user.id, dto.contenido, dto.grupoId)
  }

  @Post('publicaciones/:id/comentarios')
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Feature('comunidad')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Crear comentario' })
  @ApiParam({ name: 'id', description: 'ID de la publicación' })
  @ApiResponse({ status: 201, description: 'Comentario creado' })
  @ApiResponse({ status: 403, description: 'Funcionalidad de comunidad desactivada para tu cuenta' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  createComment(@Param('id') publicacionId: string, @Body() dto: CrearComentarioDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.createComment(publicacionId, user.id, dto.contenido)
  }

  @Post('publicaciones/:id/me-gusta')
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Feature('comunidad')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Alternar me gusta', description: 'Alterna el me gusta en una publicación. Si ya tiene me gusta lo quita, si no lo agrega.' })
  @ApiParam({ name: 'id', description: 'ID de la publicación' })
  @ApiResponse({ status: 200, description: 'Estado del me gusta: { meGusta: boolean }' })
  @ApiResponse({ status: 403, description: 'Funcionalidad de comunidad desactivada para tu cuenta' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  toggleLike(@Param('id') publicacionId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.toggleLike(user.id, publicacionId)
  }

  @Put('publicaciones/:id')
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Feature('comunidad')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Editar publicación', description: 'Actualiza el contenido. Solo el autor puede editar.' })
  @ApiParam({ name: 'id', description: 'ID de la publicación' })
  @ApiResponse({ status: 200, description: 'Publicación actualizada' })
  @ApiResponse({ status: 403, description: 'Funcionalidad de comunidad desactivada para tu cuenta o no eres el autor' })
  @ApiResponse({ status: 404, description: 'Publicación no encontrada' })
  updatePost(@Param('id') id: string, @Body() dto: ActualizarPublicacionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.updatePost(id, user.id, dto.contenido)
  }

  @Delete('publicaciones/:id')
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Feature('comunidad')
  @ApiBearerAuth('jwt-auth')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar publicación', description: 'Elimina una publicación. Autor o admin.' })
  @ApiParam({ name: 'id', description: 'ID de la publicación' })
  @ApiResponse({ status: 204, description: 'Publicación eliminada' })
  @ApiResponse({ status: 403, description: 'Funcionalidad de comunidad desactivada para tu cuenta o no eres el autor ni admin' })
  @ApiResponse({ status: 404, description: 'Publicación no encontrada' })
  removePost(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.removePost(id, user.id, user.rol)
  }

  @Post('grupos')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Crear grupo', description: 'Crea un nuevo grupo de comunidad' })
  @ApiResponse({ status: 201, description: 'Grupo creado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  createGroup(@Body() dto: CrearGrupoDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.createGroup(user.id, dto)
  }

  @Post('grupos/:id/unirse')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Unirse a grupo', description: 'Registra al usuario como miembro del grupo' })
  @ApiParam({ name: 'id', description: 'ID del grupo' })
  @ApiResponse({ status: 200, description: 'Unido al grupo o ya era miembro' })
  @ApiResponse({ status: 404, description: 'Grupo no encontrado' })
  joinGroup(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.joinGroup(id, user.id)
  }

  @Post('grupos/:id/salir')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @HttpCode(200)
  @ApiOperation({ summary: 'Salir de grupo', description: 'Remueve al usuario del grupo. El creador no puede salir.' })
  @ApiParam({ name: 'id', description: 'ID del grupo' })
  @ApiResponse({ status: 200, description: 'Saliste del grupo' })
  @ApiResponse({ status: 403, description: 'Eres el creador del grupo' })
  @ApiResponse({ status: 404, description: 'Grupo o membresía no encontrada' })
  leaveGroup(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.leaveGroup(id, user.id)
  }

  @Get('estadisticas')
  @ApiOperation({ summary: 'Estadísticas de comunidad', description: 'Retorna métricas: total grupos, publicaciones, comentarios' })
  @ApiResponse({ status: 200, description: 'Estadísticas de la comunidad' })
  stats() {
    return this.svc.getStats()
  }
}
