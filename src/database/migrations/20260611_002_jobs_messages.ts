import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('p_jobs', (t) => {
    t.string('id').primary()
    t.string('institution_id').references('id').inTable('p_institutions').onDelete('CASCADE')
    t.string('title').notNullable()
    t.text('description')
    t.text('requirements')
    t.string('modality').defaultTo('presencial') // presencial | remoto | híbrido
    t.string('schedule')                          // tiempo completo | medio tiempo | etc.
    t.string('salary_range')
    t.string('city')
    t.string('state')
    t.boolean('disability_inclusive').defaultTo(true)
    t.text('disability_types').defaultTo('[]')    // JSON array — tipos de discapacidad bienvenidos
    t.boolean('is_active').defaultTo(true)
    t.timestamps(true, true)
  })

  await knex.schema.createTable('u_job_applications', (t) => {
    t.string('id').primary()
    t.string('job_id').references('id').inTable('p_jobs').onDelete('CASCADE')
    t.string('user_id').references('id').inTable('u_profiles').onDelete('CASCADE')
    t.text('cover_letter')
    t.string('status').defaultTo('pending')       // pending | reviewed | accepted | rejected
    t.timestamps(true, true)
    t.unique(['job_id', 'user_id'])
  })

  await knex.schema.createTable('u_direct_messages', (t) => {
    t.string('id').primary()
    t.string('from_id').references('id').inTable('u_profiles').onDelete('CASCADE')
    t.string('to_id').references('id').inTable('u_profiles').onDelete('CASCADE')
    t.text('content').notNullable()
    t.boolean('is_read').defaultTo(false)
    t.timestamps(true, true)
    t.index(['from_id', 'to_id'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('u_direct_messages')
  await knex.schema.dropTableIfExists('u_job_applications')
  await knex.schema.dropTableIfExists('p_jobs')
}
