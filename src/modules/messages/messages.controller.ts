import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common'
import { IsString, IsNotEmpty } from 'class-validator'
import { MessagesService } from './messages.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

class SendDto {
  @IsString() @IsNotEmpty() content: string
}

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly svc: MessagesService) {}

  @Get('conversations')
  conversations(@CurrentUser() user: any) {
    return this.svc.getConversations(user.id)
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: any) {
    return this.svc.getUnreadCount(user.id)
  }

  @Get('with/:userId')
  getMessages(@Param('userId') partnerId: string, @CurrentUser() user: any) {
    return this.svc.getMessages(user.id, partnerId)
  }

  @Post('send/:userId')
  send(@Param('userId') toId: string, @Body() dto: SendDto, @CurrentUser() user: any) {
    return this.svc.sendMessage(user.id, toId, dto.content)
  }
}
