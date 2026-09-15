import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ThrottlerModule } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard'
import { DatabaseModule } from './database/database.module'
import { CommonGuardsModule } from './common/guards/common-guards.module'
import { AuthModule } from './modules/auth/auth.module'
import { UsersModule } from './modules/users/users.module'
import { InstitutionsModule } from './modules/institutions/institutions.module'
import { DiscoveryModule } from './modules/discovery/discovery.module'
import { RecommendationsModule } from './modules/recommendations/recommendations.module'
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
import { CatalogsModule } from './modules/catalogs/catalogs.module'
import { HealthModule } from './modules/health/health.module'
import { RoutesModule } from './modules/routes/routes.module'

@Module({
  imports: [
    // SECURITY: Acceso centralizado a variables de entorno (los secretos se
    // montan desde GCP Secret Manager en Cloud Run y desde .env en local).
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limiting global configurable por env (por IP).
    // THROTTLE_TTL (ms) / THROTTLE_LIMIT: protege el consumo de Firestore ante
    // picos y abuso. Los endpoints sensibles tienen límites propios vía @Throttle.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [{
        // `||` en vez de `??`: si la variable existe pero está vacía, Number('') = 0
        // rompería el throttling (bloquearía todo o nada).
        ttl: Number(config.get<string>('THROTTLE_TTL') || 60000),
        limit: Number(config.get<string>('THROTTLE_LIMIT') || 60),
      }],
    }),
    DatabaseModule,
    CommonGuardsModule,
    AuthModule,
    UsersModule,
    InstitutionsModule,
    DiscoveryModule,
    RecommendationsModule,
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
    CatalogsModule,
    HealthModule,
    RoutesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule {}
