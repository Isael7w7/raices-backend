import { Global, Module } from '@nestjs/common'
import { DependientePropietarioGuard } from './dependiente-propietario.guard'

/**
 * Módulo global con guards reutilizables en toda la aplicación.
 * DatabaseModule (global) ya expone el provider FIRESTORE, por lo que
 * cualquier guard registrado aquí puede inyectarlo sin imports extra.
 */
@Global()
@Module({
  providers: [DependientePropietarioGuard],
  exports: [DependientePropietarioGuard],
})
export class CommonGuardsModule {}
