import { Global, Module } from '@nestjs/common'
import { REPOSITORIO_INSTITUCION } from './interfaces/institution.repository.interface'
import { REPOSITORIO_VACANTE } from './interfaces/job.repository.interface'
import { REPOSITORIO_PERFIL } from './interfaces/profile.repository.interface'
import { REPOSITORIO_COMUNIDAD } from './interfaces/community.repository.interface'
import { REPOSITORIO_FAVORITO_RESENA } from './interfaces/favorite-review.repository.interface'
import { REPOSITORIO_MENSAJE } from './interfaces/message.repository.interface'
import { REPOSITORIO_NOTIFICACION } from './interfaces/notification.repository.interface'
import { RepositorioInstitucionFirestore } from './implementations/firestore-institution.repository'
import { RepositorioVacanteFirestore } from './implementations/firestore-job.repository'
import { RepositorioPerfilFirestore } from './implementations/firestore-profile.repository'
import { RepositorioComunidadFirestore } from './implementations/firestore-community.repository'
import { RepositorioFavoritoResenaFirestore } from './implementations/firestore-favorite-review.repository'
import { RepositorioMensajeFirestore } from './implementations/firestore-message.repository'
import { RepositorioNotificacionFirestore } from './implementations/firestore-notification.repository'

const proveedores = [
  { provide: REPOSITORIO_INSTITUCION, useClass: RepositorioInstitucionFirestore },
  { provide: REPOSITORIO_VACANTE, useClass: RepositorioVacanteFirestore },
  { provide: REPOSITORIO_PERFIL, useClass: RepositorioPerfilFirestore },
  { provide: REPOSITORIO_COMUNIDAD, useClass: RepositorioComunidadFirestore },
  { provide: REPOSITORIO_FAVORITO_RESENA, useClass: RepositorioFavoritoResenaFirestore },
  { provide: REPOSITORIO_MENSAJE, useClass: RepositorioMensajeFirestore },
  { provide: REPOSITORIO_NOTIFICACION, useClass: RepositorioNotificacionFirestore },
]

@Global()
@Module({
  providers: [...proveedores],
  exports: [...proveedores],
})
export class RepositoriesModule {}
