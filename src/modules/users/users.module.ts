import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { StorageModule } from '../storage/storage.module'
import { AiModule } from '../ai/ai.module'

@Module({
  imports: [StorageModule, AiModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
