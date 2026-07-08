import { Global, Module } from '@nestjs/common'
import { INSTITUTION_REPOSITORY } from './interfaces/institution.repository.interface'
import { JOB_REPOSITORY } from './interfaces/job.repository.interface'
import { PROFILE_REPOSITORY } from './interfaces/profile.repository.interface'
import { COMMUNITY_REPOSITORY } from './interfaces/community.repository.interface'
import { FAVORITE_REVIEW_REPOSITORY } from './interfaces/favorite-review.repository.interface'
import { MESSAGE_REPOSITORY } from './interfaces/message.repository.interface'
import { NOTIFICATION_REPOSITORY } from './interfaces/notification.repository.interface'
import { FirestoreInstitutionRepository } from './implementations/firestore-institution.repository'
import { FirestoreJobRepository } from './implementations/firestore-job.repository'
import { FirestoreProfileRepository } from './implementations/firestore-profile.repository'
import { FirestoreCommunityRepository } from './implementations/firestore-community.repository'
import { FirestoreFavoriteReviewRepository } from './implementations/firestore-favorite-review.repository'
import { FirestoreMessageRepository } from './implementations/firestore-message.repository'
import { FirestoreNotificationRepository } from './implementations/firestore-notification.repository'

const providers = [
  { provide: INSTITUTION_REPOSITORY, useClass: FirestoreInstitutionRepository },
  { provide: JOB_REPOSITORY, useClass: FirestoreJobRepository },
  { provide: PROFILE_REPOSITORY, useClass: FirestoreProfileRepository },
  { provide: COMMUNITY_REPOSITORY, useClass: FirestoreCommunityRepository },
  { provide: FAVORITE_REVIEW_REPOSITORY, useClass: FirestoreFavoriteReviewRepository },
  { provide: MESSAGE_REPOSITORY, useClass: FirestoreMessageRepository },
  { provide: NOTIFICATION_REPOSITORY, useClass: FirestoreNotificationRepository },
]

/**
 * Módulo global que expone los repositorios inyectables.
 *
 * Cualquier módulo que necesite un repositorio puede inyectarlo usando
 * el token correspondiente:
 *
 * ```typescript
 * @Inject(INSTITUTION_REPOSITORY)
 * private readonly institutionRepo: IInstitutionRepository
 * ```
 */
@Global()
@Module({
  providers: [...providers],
  exports: [...providers],
})
export class RepositoriesModule {}
