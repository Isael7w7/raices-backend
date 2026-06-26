import type { Knex } from 'knex'
import * as dotenv from 'dotenv'
dotenv.config()

const config: Knex.Config = {
  client: 'sqlite3',
  connection: { filename: process.env.DB_FILE ?? './raices_demo.db' },
  useNullAsDefault: true,
  migrations: {
    directory: './src/database/migrations',
    tableName: 'knex_migrations',
  },
}

export default config
