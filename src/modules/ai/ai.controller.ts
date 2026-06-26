import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { IsString, IsArray, IsOptional } from 'class-validator'
import { AiService } from './ai.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

class AiChatDto {
  @IsString() message: string
  @IsOptional() @IsArray() history?: any[]
}

class AiRecommendDto {
  @IsOptional() @IsString() dependent_id?: string
}

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly svc: AiService) {}

  @Post('chat')
  chat(@Body() dto: AiChatDto, @CurrentUser() user: any) {
    return this.svc.chat(user.id, dto.message, dto.history ?? [])
  }

  @Post('recommendations')
  recommend(@Body() dto: AiRecommendDto, @CurrentUser() user: any) {
    if (dto?.dependent_id) {
      return this.svc.recommendForDependent(user.id, dto.dependent_id)
    }
    return this.svc.recommend(user.id)
  }
}
