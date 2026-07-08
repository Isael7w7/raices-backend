import { Module } from '@nestjs/common'
import { DatabaseModule } from './database/database.module'
import { AuthModule } from './modules/auth/auth.module'
import { UsersModule } from './modules/users/users.module'
import { InstitutionsModule } from './modules/institutions/institutions.module'
import { DiscoveryModule } from './modules/discovery/discovery.module'
import { FavoritesModule } from './modules/favorites/favorites.module'
import { ReviewsModule } from './modules/reviews/reviews.module'
import { CommunityModule } from './modules/community/community.module'
import { NotificationsModule } from './modules/notifications/notifications.module'
import { AdminModule } from './modules/admin/admin.module'
import { AiModule } from './modules/ai/ai.module'
import { StorageModule } from './modules/storage/storage.module'
import { EmailModule } from './modules/email/email.module'
import { JobsModule } from './modules/jobs/jobs.module'
import { MessagesModule } from './modules/messages/messages.module'
import { RepositoriesModule } from './repositories/repositories.module'

@Module({
  imports: [
    DatabaseModule,
    RepositoriesModule,
    AuthModule,
    UsersModule,
    InstitutionsModule,
    DiscoveryModule,
    FavoritesModule,
    ReviewsModule,
    CommunityModule,
    NotificationsModule,
    AdminModule,
    AiModule,
    StorageModule,
    EmailModule,
    JobsModule,
    MessagesModule,
  ],
})
export class AppModule {}
