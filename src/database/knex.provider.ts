import { Provider } from '@nestjs/common'
import Knex from 'knex'
import * as dotenv from 'dotenv'
dotenv.config()

export const KNEX_CONNECTION = 'KNEX_CONNECTION'

export const knexProvider: Provider = {
  provide: KNEX_CONNECTION,
  useFactory: () =>
    Knex({
      client: 'better-sqlite3',
      connection: { filename: process.env.DB_FILE ?? './raices_demo.db' },
      useNullAsDefault: true,
    }),
}
