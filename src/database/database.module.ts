import { Global, Module, OnModuleInit } from '@nestjs/common'
import { firestoreProvider, firebaseAuthProvider, logSecurityConfig } from './firebase.provider'
import { TenantService } from '../common/tenant/tenant.service'

@Global()
@Module({
  providers: [firestoreProvider, firebaseAuthProvider, TenantService],
  exports: [firestoreProvider, firebaseAuthProvider, TenantService],
})
export class DatabaseModule implements OnModuleInit {
  onModuleInit() {
    logSecurityConfig()
  }
}
