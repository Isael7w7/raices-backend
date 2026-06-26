import { Injectable, Inject } from '@nestjs/common'
import { Knex } from 'knex'
import { KNEX_CONNECTION } from '../../database/knex.provider'

// Demo: single SQLite DB, tenant resolved by table prefix (u_ vs p_)
@Injectable()
export class TenantService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}

  users(): Knex { return this.db }
  providers(): Knex { return this.db }
  forRole(_role: string): Knex { return this.db }
}
