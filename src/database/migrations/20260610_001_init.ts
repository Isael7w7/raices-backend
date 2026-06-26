import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // u_ prefix = t_users schema equivalent
  await knex.schema.createTable('u_profiles', (t) => {
    t.string('id').primary()
    t.string('email').notNullable().unique()
    t.string('password_hash').notNullable()
    t.string('role').notNullable().defaultTo('pcd')
    t.string('full_name')
    t.string('avatar_url')
    t.string('city')
    t.string('state')
    t.boolean('is_active').defaultTo(true)
    t.boolean('is_verified').defaultTo(false)
    t.timestamps(true, true)
  })

  await knex.schema.createTable('u_user_profiles', (t) => {
    t.string('id').primary()
    t.string('user_id').references('id').inTable('u_profiles').onDelete('CASCADE')
    t.string('age_range')
    t.text('disability_types').defaultTo('[]')   // JSON array
    t.string('support_level')
    t.text('needs').defaultTo('[]')
    t.string('life_stage')
    t.text('education_history').defaultTo('{}')
    t.text('therapy_history').defaultTo('{}')
    t.text('social_history').defaultTo('{}')
    t.text('work_history').defaultTo('{}')
    t.text('current_goals').defaultTo('[]')
    t.text('support_areas').defaultTo('[]')
    t.text('current_concerns')
    t.timestamps(true, true)
  })

  await knex.schema.createTable('u_dependents', (t) => {
    t.string('id').primary()
    t.string('guardian_id').references('id').inTable('u_profiles').onDelete('CASCADE')
    t.string('full_name').notNullable()
    t.string('relationship').notNullable()
    t.text('profile_data').defaultTo('{}')
    t.timestamps(true, true)
  })

  // p_ prefix = t_providers schema equivalent
  await knex.schema.createTable('p_institutions', (t) => {
    t.string('id').primary()
    t.string('name').notNullable()
    t.text('description')
    t.string('category').notNullable()
    t.string('subcategory')
    t.string('address')
    t.string('city')
    t.string('state')
    t.float('lat')
    t.float('lng')
    t.string('phone')
    t.string('email')
    t.string('whatsapp')
    t.string('website')
    t.text('disability_types').defaultTo('[]')  // JSON array
    t.integer('age_min')
    t.integer('age_max')
    t.boolean('is_verified').defaultTo(false)
    t.boolean('is_active').defaultTo(true)
    t.float('rating_avg').defaultTo(0)
    t.integer('rating_count').defaultTo(0)
    t.string('created_by')
    t.string('plan_type').defaultTo('free')
    t.timestamps(true, true)
  })

  await knex.schema.createTable('u_favorites', (t) => {
    t.string('id').primary()
    t.string('user_id').references('id').inTable('u_profiles').onDelete('CASCADE')
    t.string('institution_id').notNullable()
    t.timestamps(true, true)
    t.unique(['user_id', 'institution_id'])
  })

  await knex.schema.createTable('u_reviews', (t) => {
    t.string('id').primary()
    t.string('user_id').references('id').inTable('u_profiles').onDelete('CASCADE')
    t.string('institution_id').notNullable()
    t.integer('rating').notNullable()
    t.text('comment')
    t.timestamps(true, true)
    t.unique(['user_id', 'institution_id'])
  })

  await knex.schema.createTable('u_groups', (t) => {
    t.string('id').primary()
    t.string('name').notNullable()
    t.text('description')
    t.string('category')
    t.text('disability_types').defaultTo('[]')
    t.boolean('is_public').defaultTo(true)
    t.integer('member_count').defaultTo(0)
    t.string('created_by')
    t.timestamps(true, true)
  })

  await knex.schema.createTable('u_group_members', (t) => {
    t.string('group_id').references('id').inTable('u_groups').onDelete('CASCADE')
    t.string('user_id').references('id').inTable('u_profiles').onDelete('CASCADE')
    t.timestamp('joined_at').defaultTo(knex.fn.now())
    t.primary(['group_id', 'user_id'])
  })

  await knex.schema.createTable('u_posts', (t) => {
    t.string('id').primary()
    t.string('group_id').references('id').inTable('u_groups').onDelete('SET NULL')
    t.string('author_id').references('id').inTable('u_profiles').onDelete('CASCADE')
    t.text('content').notNullable()
    t.integer('like_count').defaultTo(0)
    t.timestamps(true, true)
  })

  await knex.schema.createTable('u_comments', (t) => {
    t.string('id').primary()
    t.string('post_id').references('id').inTable('u_posts').onDelete('CASCADE')
    t.string('author_id').references('id').inTable('u_profiles').onDelete('CASCADE')
    t.text('content').notNullable()
    t.timestamps(true, true)
  })

  await knex.schema.createTable('u_post_likes', (t) => {
    t.string('post_id').references('id').inTable('u_posts').onDelete('CASCADE')
    t.string('user_id').references('id').inTable('u_profiles').onDelete('CASCADE')
    t.primary(['post_id', 'user_id'])
  })

  await knex.schema.createTable('u_notifications', (t) => {
    t.string('id').primary()
    t.string('user_id').references('id').inTable('u_profiles').onDelete('CASCADE')
    t.string('type').notNullable()
    t.string('title').notNullable()
    t.text('body')
    t.text('data').defaultTo('{}')
    t.boolean('is_read').defaultTo(false)
    t.timestamps(true, true)
  })

  await knex.schema.createTable('p_institution_docs', (t) => {
    t.string('id').primary()
    t.string('institution_id').references('id').inTable('p_institutions').onDelete('CASCADE')
    t.string('doc_type').notNullable()
    t.string('file_path').notNullable()
    t.timestamps(true, true)
  })
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    'p_institution_docs', 'u_notifications', 'u_post_likes', 'u_comments',
    'u_posts', 'u_group_members', 'u_groups', 'u_reviews', 'u_favorites',
    'p_institutions', 'u_dependents', 'u_user_profiles', 'u_profiles',
  ]
  for (const t of tables) await knex.schema.dropTableIfExists(t)
}
