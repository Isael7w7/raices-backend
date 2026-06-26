import { Global, Module } from '@nestjs/common'
import { knexProvider } from './knex.provider'
import { TenantService } from '../common/tenant/tenant.service'

@Global()
@Module({
  providers: [knexProvider, TenantService],
  exports: [knexProvider, TenantService],
})
export class DatabaseModule {}
