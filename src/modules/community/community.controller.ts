import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery, ApiProperty } from '@nestjs/swagger'
import { IsString, IsOptional } from 'class-validator'
import { CommunityService } from './community.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

export class CrearPublicacionDto {
  @ApiProperty({ description: 'Contenido del post', example: '¡Hola comunidad!' })
  @IsString() contenido: string
  @ApiProperty({ description: 'ID del grupo (opcional)', required: false })
  @IsOptional() @IsString() grupoId?: string
}

export class CrearComentarioDto {
  @ApiProperty({ description: 'Contenido del comentario', example: '¡Gran aporte!' })
  @IsString() contenido: string
}

@ApiTags('Community')
@Controller('community')
export class CommunityController {
  constructor(private readonly svc: CommunityService) {}

  @Get('groups')
  @ApiOperation({ summary: 'Listar grupos públicos', description: 'Retorna todos los grupos de comunidad ordenados por cantidad de miembros' })
  @ApiResponse({ status: 200, description: 'Lista de grupos públicos' })
  groups() { return this.svc.getGroups() }

  @Get('posts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Listar posts', description: 'Retorna posts con información del autor y si el usuario dio like' })
  @ApiQuery({ name: 'group_id', required: false, description: 'Filtrar por grupo' })
  @ApiResponse({ status: 200, description: 'Lista de posts (últimos 20 por defecto)' })
  posts(@Query('group_id') grupoId: string, @CurrentUser() user: any) {
    return this.svc.getPosts(grupoId, user.id)
  }

  @Get('posts/:id/comments')
  @ApiOperation({ summary: 'Comentarios de un post' })
  @ApiParam({ name: 'id', description: 'ID del post' })
  @ApiResponse({ status: 200, description: 'Lista de comentarios con autor' })
  comments(@Param('id') id: string) { return this.svc.getComments(id) }

  @Post('posts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Crear post', description: 'Publica un post en el feed general o en un grupo específico' })
  @ApiResponse({ status: 201, description: 'Post creado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  createPost(@Body() dto: CrearPublicacionDto, @CurrentUser() user: any) {
    return this.svc.createPost(user.id, dto.contenido, dto.grupoId)
  }

  @Post('posts/:id/comments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Crear comentario' })
  @ApiParam({ name: 'id', description: 'ID del post' })
  @ApiResponse({ status: 201, description: 'Comentario creado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  createComment(@Param('id') publicacionId: string, @Body() dto: CrearComentarioDto, @CurrentUser() user: any) {
    return this.svc.createComment(publicacionId, user.id, dto.contenido)
  }

  @Post('posts/:id/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Toggle like', description: 'Alterna el like en un post. Si ya tiene like lo quita, si no lo agrega.' })
  @ApiParam({ name: 'id', description: 'ID del post' })
  @ApiResponse({ status: 200, description: 'Estado del like: { liked: boolean }' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  toggleLike(@Param('id') publicacionId: string, @CurrentUser() user: any) {
    return this.svc.toggleLike(user.id, publicacionId)
  }
}
