import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common'
import { IsString, IsOptional } from 'class-validator'
import { CommunityService } from './community.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

class CreatePostDto {
  @IsString() content: string
  @IsOptional() @IsString() group_id?: string
}

class CreateCommentDto {
  @IsString() content: string
}

@Controller('community')
export class CommunityController {
  constructor(private readonly svc: CommunityService) {}

  @Get('groups')
  groups() { return this.svc.getGroups() }

  @Get('posts')
  @UseGuards(JwtAuthGuard)
  posts(@Query('group_id') groupId: string, @CurrentUser() user: any) {
    return this.svc.getPosts(groupId, user.id)
  }

  @Get('posts/:id/comments')
  comments(@Param('id') id: string) { return this.svc.getComments(id) }

  @Post('posts')
  @UseGuards(JwtAuthGuard)
  createPost(@Body() dto: CreatePostDto, @CurrentUser() user: any) {
    return this.svc.createPost(user.id, dto.content, dto.group_id)
  }

  @Post('posts/:id/comments')
  @UseGuards(JwtAuthGuard)
  createComment(@Param('id') postId: string, @Body() dto: CreateCommentDto, @CurrentUser() user: any) {
    return this.svc.createComment(postId, user.id, dto.content)
  }

  @Post('posts/:id/like')
  @UseGuards(JwtAuthGuard)
  toggleLike(@Param('id') postId: string, @CurrentUser() user: any) {
    return this.svc.toggleLike(user.id, postId)
  }
}
