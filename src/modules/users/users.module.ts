import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { TutoresController } from './tutores.controller'
import { UsersService } from './users.service'
import { StorageModule } from '../storage/storage.module'
import { AiModule } from '../ai/ai.module'
import { AdminModule } from '../admin/admin.module'
import { OnboardingModule } from '../onboarding/onboarding.module'

@Module({
  imports: [StorageModule, AiModule, AdminModule, OnboardingModule],
  controllers: [UsersController, TutoresController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
