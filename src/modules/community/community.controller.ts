import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger'
import { CommunityService } from './community.service'
import { CrearPublicacionDto } from './dto/crear-publicacion.dto'
import { CrearComentarioDto } from './dto/crear-comentario.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'

@ApiTags('Comunidad')
@Controller('comunidad')
export class CommunityController {
  constructor(private readonly svc: CommunityService) {}

  @Get('grupos')
  @ApiOperation({ summary: 'Listar grupos públicos', description: 'Retorna todos los grupos de comunidad ordenados por cantidad de miembros' })
  @ApiResponse({ status: 200, description: 'Lista de grupos públicos' })
  groups() { return this.svc.getGroups() }

  @Get('publicaciones')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Listar publicaciones', description: 'Retorna publicaciones con información del autor y si el usuario dio me gusta' })
  @ApiQuery({ name: 'grupoId', required: false, description: 'Filtrar por grupo' })
  @ApiResponse({ status: 200, description: 'Lista de publicaciones (últimas 20 por defecto)' })
  posts(@Query('grupoId') grupoId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.getPosts(grupoId, user.id)
  }

  @Get('publicaciones/:id/comentarios')
  @ApiOperation({ summary: 'Comentarios de una publicación' })
  @ApiParam({ name: 'id', description: 'ID de la publicación' })
  @ApiResponse({ status: 200, description: 'Lista de comentarios con autor' })
  comments(@Param('id') id: string) { return this.svc.getComments(id) }

  @Post('publicaciones')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Crear publicación', description: 'Publica una publicación en el muro general o en un grupo específico' })
  @ApiResponse({ status: 201, description: 'Publicación creada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  createPost(@Body() dto: CrearPublicacionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.createPost(user.id, dto.contenido, dto.grupoId)
  }

  @Post('publicaciones/:id/comentarios')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Crear comentario' })
  @ApiParam({ name: 'id', description: 'ID de la publicación' })
  @ApiResponse({ status: 201, description: 'Comentario creado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  createComment(@Param('id') publicacionId: string, @Body() dto: CrearComentarioDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.createComment(publicacionId, user.id, dto.contenido)
  }

  @Post('publicaciones/:id/me-gusta')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Alternar me gusta', description: 'Alterna el me gusta en una publicación. Si ya tiene me gusta lo quita, si no lo agrega.' })
  @ApiParam({ name: 'id', description: 'ID de la publicación' })
  @ApiResponse({ status: 200, description: 'Estado del me gusta: { meGusta: boolean }' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  toggleLike(@Param('id') publicacionId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.toggleLike(user.id, publicacionId)
  }
}
