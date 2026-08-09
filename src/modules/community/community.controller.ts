import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, HttpCode } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger'
import { CommunityService } from './community.service'
import { CrearPublicacionDto } from './dto/crear-publicacion.dto'
import { CrearComentarioDto } from './dto/crear-comentario.dto'
import { CrearGrupoDto } from './dto/crear-grupo.dto'
import { ActualizarPublicacionDto } from './dto/actualizar-publicacion.dto'
import { PaginacionDto } from '../../common/dto/paginacion.dto'
import {
  GrupoDto, PaginaGruposDto, PublicacionDto, PaginaPublicacionesDto, ComentarioDto, PaginaComentariosDto,
  RespuestaMeGustaDto, RespuestaUnirseDto, RespuestaSalirDto, EstadisticasComunidadDto, MiembroDto, PaginaMiembrosDto,
} from './dto/respuestas-comunidad.dto'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { FeatureGuard } from '../../common/guards/feature.guard'
import { Feature } from '../../common/decorators/feature.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { UseETag } from '../../common/decorators/use-etag.decorator'

@ApiTags('Comunidad')
@Controller('comunidad')
export class CommunityController {
  constructor(private readonly svc: CommunityService) {}

  @Get('grupos')
  @UseETag()
  @ApiOperation({ summary: 'Listar grupos públicos', description: 'Retorna grupos de comunidad con paginación, ordenados por miembros' })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', example: 1 })
  @ApiQuery({ name: 'limite', required: false, description: 'Elementos por página', example: 20 })
  @ApiOkResponse({ type: PaginaGruposDto, description: 'Lista paginada de grupos públicos' })
  groups(@Query() paginacion: PaginacionDto) { return this.svc.getGroups(paginacion.pagina, paginacion.limite, paginacion.ordenarPor, paginacion.direccion, paginacion.buscar) }

  @Get('publicaciones')
  @UseETag()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Listar publicaciones', description: 'Retorna publicaciones con paginación, información del autor y me gusta' })
  @ApiQuery({ name: 'grupoId', required: false, description: 'Filtrar por grupo' })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', example: 1 })
  @ApiQuery({ name: 'limite', required: false, description: 'Elementos por página', example: 20 })
  @ApiOkResponse({ type: PaginaPublicacionesDto, description: 'Lista paginada de publicaciones' })
  posts(@Query('grupoId') grupoId: string, @CurrentUser() user: CurrentUserPayload, @Query() paginacion: PaginacionDto) {
    return this.svc.getPosts(grupoId, user.id, paginacion.pagina, paginacion.limite, paginacion.ordenarPor, paginacion.direccion, paginacion.buscar)
  }

  @Get('publicaciones/:id/comentarios')
  @UseETag()
  @ApiOperation({ summary: 'Comentarios de una publicación', description: 'Retorna comentarios con paginación' })
  @ApiParam({ name: 'id', description: 'ID de la publicación' })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', example: 1 })
  @ApiQuery({ name: 'limite', required: false, description: 'Elementos por página', example: 20 })
  @ApiOkResponse({ type: PaginaComentariosDto, description: 'Lista paginada de comentarios con autor' })
  comments(@Param('id') id: string, @Query() paginacion: PaginacionDto) { return this.svc.getComments(id, paginacion.pagina, paginacion.limite) }

  @Post('publicaciones')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 publicaciones por minuto
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Feature('comunidad')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Crear publicación', description: 'Publica una publicación en el muro general o en un grupo específico' })
  @ApiCreatedResponse({ type: PublicacionDto, description: 'Publicación creada' })
  @ApiResponse({ status: 403, description: 'Funcionalidad de comunidad desactivada para tu cuenta' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  createPost(@Body() dto: CrearPublicacionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.createPost(user, dto.contenido, dto.grupoId, dto.mediaUrl)
  }

  @Post('publicaciones/:id/comentarios')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 comentarios por minuto
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Feature('comunidad')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Crear comentario' })
  @ApiParam({ name: 'id', description: 'ID de la publicación' })
  @ApiCreatedResponse({ type: ComentarioDto, description: 'Comentario creado' })
  @ApiResponse({ status: 403, description: 'Funcionalidad de comunidad desactivada para tu cuenta' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  createComment(@Param('id') publicacionId: string, @Body() dto: CrearComentarioDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.createComment(publicacionId, user.id, dto.contenido)
  }

  @Post('publicaciones/:id/me-gusta')
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 me gusta por minuto
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Feature('comunidad')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Alternar me gusta', description: 'Alterna el me gusta en una publicación. Si ya tiene me gusta lo quita, si no lo agrega.' })
  @ApiParam({ name: 'id', description: 'ID de la publicación' })
  @ApiCreatedResponse({ type: RespuestaMeGustaDto, description: 'Estado del me gusta' })
  @ApiResponse({ status: 403, description: 'Funcionalidad de comunidad desactivada para tu cuenta' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  toggleLike(@Param('id') publicacionId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.toggleLike(user.id, publicacionId)
  }

  @Put('publicaciones/:id')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 ediciones por minuto
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Feature('comunidad')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Editar publicación', description: 'Actualiza el contenido. Solo el autor puede editar.' })
  @ApiParam({ name: 'id', description: 'ID de la publicación' })
  @ApiOkResponse({ type: PublicacionDto, description: 'Publicación actualizada' })
  @ApiResponse({ status: 403, description: 'Funcionalidad de comunidad desactivada para tu cuenta o no eres el autor' })
  @ApiResponse({ status: 404, description: 'Publicación no encontrada' })
  updatePost(@Param('id') id: string, @Body() dto: ActualizarPublicacionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.updatePost(id, user, dto.contenido, dto.mediaUrl)
  }

  @Delete('publicaciones/:id')
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Feature('comunidad')
  @ApiBearerAuth('jwt-auth')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar publicación', description: 'Elimina una publicación. Autor o admin.' })
  @ApiParam({ name: 'id', description: 'ID de la publicación' })
  @ApiNoContentResponse({ description: 'Publicación eliminada' })
  @ApiResponse({ status: 403, description: 'Funcionalidad de comunidad desactivada para tu cuenta o no eres el autor ni admin' })
  @ApiResponse({ status: 404, description: 'Publicación no encontrada' })
  removePost(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.removePost(id, user.id, user.rol)
  }

  @Post('grupos')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 grupos por minuto
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Crear grupo', description: 'Crea un nuevo grupo de comunidad' })
  @ApiCreatedResponse({ type: GrupoDto, description: 'Grupo creado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  createGroup(@Body() dto: CrearGrupoDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.createGroup(user.id, dto)
  }

  @Post('grupos/:id/unirse')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Unirse a grupo', description: 'Registra al usuario como miembro del grupo' })
  @ApiParam({ name: 'id', description: 'ID del grupo' })
  @ApiCreatedResponse({ type: RespuestaUnirseDto, description: 'Unido al grupo o ya era miembro' })
  @ApiResponse({ status: 404, description: 'Grupo no encontrado' })
  joinGroup(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.joinGroup(id, user.id)
  }

  @Post('grupos/:id/salir')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @HttpCode(200)
  @ApiOperation({ summary: 'Salir de grupo', description: 'Remueve al usuario del grupo. El creador no puede salir.' })
  @ApiParam({ name: 'id', description: 'ID del grupo' })
  @ApiOkResponse({ type: RespuestaSalirDto, description: 'Saliste del grupo' })
  @ApiResponse({ status: 403, description: 'Eres el creador del grupo' })
  @ApiResponse({ status: 404, description: 'Grupo o membresía no encontrada' })
  leaveGroup(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.leaveGroup(id, user.id)
  }

  @Get('estadisticas')
  @UseETag()
  @ApiOperation({ summary: 'Estadísticas de comunidad', description: 'Retorna métricas: total grupos, publicaciones, comentarios' })
  @ApiOkResponse({ type: EstadisticasComunidadDto, description: 'Estadísticas de la comunidad' })
  stats() {
    return this.svc.getStats()
  }

  @Get('miembros')
  @UseETag()
  @ApiOperation({ summary: 'Miembros/testimonios públicos', description: 'Retorna perfiles activos con bio para la sección de testimonios de la comunidad. Endpoint público, sin autenticación.' })
  @ApiQuery({ name: 'pagina', required: false, description: 'Número de página', example: 1 })
  @ApiQuery({ name: 'limite', required: false, description: 'Elementos por página', example: 20 })
  @ApiOkResponse({ type: PaginaMiembrosDto, description: 'Lista paginada de miembros con testimonios' })
  members(@Query() paginacion: PaginacionDto) {
    return this.svc.getMembers(paginacion.pagina, paginacion.limite)
  }
}
