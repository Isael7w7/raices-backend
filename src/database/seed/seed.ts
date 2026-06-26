import * as dotenv from 'dotenv'
dotenv.config()
import Knex from 'knex'
import * as bcrypt from 'bcrypt'
import { v4 as uuid } from 'uuid'

const db = Knex({
  client: 'sqlite3',
  connection: { filename: process.env.DB_FILE ?? './raices_demo.db' },
  useNullAsDefault: true,
})

async function seed() {
  console.log('🌱 Seeding demo data...')

  // Limpiar datos existentes
  await db('u_posts').delete()
  await db('u_group_members').delete()
  await db('u_groups').delete()
  await db('u_favorites').delete()
  await db('u_reviews').delete()
  await db('u_user_profiles').delete()
  await db('u_profiles').delete()
  await db('p_institutions').delete()

  // Usuarios demo
  const adminId = uuid()
  const demoId = uuid()
  const tutorId = uuid()

  await db('u_profiles').insert([
    {
      id: adminId,
      email: 'admin@raices.mx',
      password_hash: await bcrypt.hash('Admin1234', 10),
      role: 'admin',
      full_name: 'Admin Raíces',
      city: 'Mérida',
      state: 'Yucatán',
      is_active: true,
      is_verified: true,
    },
    {
      id: demoId,
      email: 'demo@raices.mx',
      password_hash: await bcrypt.hash('Demo1234', 10),
      role: 'pcd',
      full_name: 'Luis Hernández',
      city: 'Mérida',
      state: 'Yucatán',
      is_active: true,
      is_verified: true,
    },
    {
      id: tutorId,
      email: 'tutor@raices.mx',
      password_hash: await bcrypt.hash('Tutor1234', 10),
      role: 'tutor',
      full_name: 'Ana García',
      city: 'Mérida',
      state: 'Yucatán',
      is_active: true,
      is_verified: true,
    },
  ])

  // Perfil del usuario demo
  await db('u_user_profiles').insert({
    id: uuid(),
    user_id: demoId,
    age_range: '13-17',
    disability_types: JSON.stringify(['tea']),
    support_level: 'medio',
    needs: JSON.stringify(['socialización', 'aprendizaje']),
    life_stage: 'adolescencia',
    education_history: JSON.stringify({ escolarizado: true, tipo: 'regular', nivel: 'secundaria' }),
    therapy_history: JSON.stringify({ tomado: true, tipos: ['lenguaje'] }),
    current_goals: JSON.stringify(['escuela', 'actividades_sociales']),
    support_areas: JSON.stringify(['integración_social']),
  })

  // Instituciones de Mérida
  const institutions = [
    { id: uuid(), name: 'Centro de Rehabilitación DIF Mérida', description: 'Terapias físicas, ocupacionales y de lenguaje para personas con discapacidad motriz y del neurodesarrollo.', category: 'funcional', subcategory: 'terapias', address: 'Calle 50 x 65 #123', city: 'Mérida', state: 'Yucatán', lat: 20.9674, lng: -89.6237, phone: '9999990001', whatsapp: '9991110001', disability_types: JSON.stringify(['motriz','intelectual','tea']), age_min: 0, age_max: 99, is_verified: true, rating_avg: 4.5, rating_count: 12 },
    { id: uuid(), name: 'Escuela de Educación Especial No. 5', description: 'Educación especial y habilidades adaptativas para niños y jóvenes con discapacidad intelectual.', category: 'educativo', subcategory: 'escuelas', address: 'Av. Itzáes 200', city: 'Mérida', state: 'Yucatán', lat: 20.9712, lng: -89.6301, phone: '9999990002', whatsapp: '9991110002', disability_types: JSON.stringify(['intelectual','tea']), age_min: 3, age_max: 22, is_verified: true, rating_avg: 4.2, rating_count: 8 },
    { id: uuid(), name: 'Fundación Alas y Raíces Mérida', description: 'Apoyo integral a personas con autismo: terapias ABA, integración social y orientación familiar.', category: 'social', subcategory: 'centros_comunitarios', address: 'Calle 20 #300 Col. García Ginerés', city: 'Mérida', state: 'Yucatán', lat: 20.9801, lng: -89.6198, phone: '9999990003', whatsapp: '9991110003', disability_types: JSON.stringify(['tea']), age_min: 2, age_max: 30, is_verified: true, rating_avg: 4.8, rating_count: 20 },
    { id: uuid(), name: 'CREE Yucatán - IMSS', description: 'Centro de Rehabilitación y Educación Especial. Atención médica y terapéutica integral.', category: 'funcional', subcategory: 'atencion_especializada', address: 'Av. Jacinto Canek S/N', city: 'Mérida', state: 'Yucatán', lat: 20.9589, lng: -89.6412, phone: '9999990004', whatsapp: null, disability_types: JSON.stringify(['motriz','visual','auditiva','intelectual','multiple']), age_min: 0, age_max: 99, is_verified: true, rating_avg: 4.0, rating_count: 35 },
    { id: uuid(), name: 'Talleres Inclusivos Yucatán', description: 'Capacitación laboral para adultos con discapacidad: carpintería, bisutería, panadería.', category: 'laboral', subcategory: 'capacitacion', address: 'Calle 62 #400', city: 'Mérida', state: 'Yucatán', lat: 20.9651, lng: -89.6325, phone: '9999990005', whatsapp: '9991110005', disability_types: JSON.stringify(['intelectual','motriz']), age_min: 18, age_max: 60, is_verified: true, rating_avg: 4.3, rating_count: 15 },
    { id: uuid(), name: 'Colegio Futuros Brillantes', description: 'Escuela privada con modelo de educación inclusiva. Apoya TDAH, dislexia y TEA leve.', category: 'educativo', subcategory: 'escuelas', address: 'Calle 13 x 22 #150 Altabrisa', city: 'Mérida', state: 'Yucatán', lat: 21.0034, lng: -89.6185, phone: '9999990006', whatsapp: '9991110006', disability_types: JSON.stringify(['tea','intelectual']), age_min: 3, age_max: 18, is_verified: true, rating_avg: 4.6, rating_count: 9 },
    { id: uuid(), name: 'Grupo de Apoyo TEA Familias', description: 'Red de familias con hijos con autismo. Reuniones quincenales, asesorías y apoyo emocional.', category: 'social', subcategory: 'actividades', address: 'Sede rotativa', city: 'Mérida', state: 'Yucatán', lat: 20.9740, lng: -89.6220, phone: '9991110007', whatsapp: '9991110007', disability_types: JSON.stringify(['tea']), age_min: 0, age_max: 99, is_verified: false, rating_avg: 4.7, rating_count: 6 },
    { id: uuid(), name: 'ASPADEM', description: 'Talleres productivos, vivienda asistida y programa de vida independiente para discapacidad mental.', category: 'social', subcategory: 'centros_comunitarios', address: 'Calle 29A x 46 #199', city: 'Mérida', state: 'Yucatán', lat: 20.9703, lng: -89.6289, phone: '9999990008', whatsapp: '9991110008', disability_types: JSON.stringify(['intelectual','multiple']), age_min: 18, age_max: 99, is_verified: true, rating_avg: 4.1, rating_count: 11 },
    { id: uuid(), name: 'CEDIS - Estimulación Temprana', description: 'Estimulación temprana y atención a niños con rezago en el desarrollo de 0 a 6 años.', category: 'funcional', subcategory: 'terapias', address: 'Av. Prolongación Montejo 480', city: 'Mérida', state: 'Yucatán', lat: 21.0098, lng: -89.6240, phone: '9999990009', whatsapp: '9991110009', disability_types: JSON.stringify(['intelectual','multiple']), age_min: 0, age_max: 6, is_verified: true, rating_avg: 4.9, rating_count: 18 },
    { id: uuid(), name: 'Tech Accesible MX', description: 'Bolsa de trabajo especializada en vacantes para personas con discapacidad en sector tecnológico.', category: 'laboral', subcategory: 'insercion_laboral', address: 'Remoto / Col. Polígono 108', city: 'Mérida', state: 'Yucatán', lat: 20.9900, lng: -89.6150, phone: '9991110010', whatsapp: '9991110010', disability_types: JSON.stringify(['visual','auditiva','motriz']), age_min: 18, age_max: 55, is_verified: true, rating_avg: 4.4, rating_count: 7 },
    { id: uuid(), name: 'Clínica Voces - Fonoaudiología', description: 'Terapia de lenguaje para niños y adultos con tartamudez, dislexia, TEA y afasia.', category: 'funcional', subcategory: 'terapias', address: 'Calle 17 x 28 #240', city: 'Mérida', state: 'Yucatán', lat: 20.9820, lng: -89.6174, phone: '9999990011', whatsapp: '9991110011', disability_types: JSON.stringify(['tea','auditiva','intelectual']), age_min: 2, age_max: 70, is_verified: true, rating_avg: 4.5, rating_count: 22 },
    { id: uuid(), name: 'Atletismo Paralímpico Yucatán', description: 'Entrenamiento deportivo adaptado para personas con discapacidad motriz.', category: 'social', subcategory: 'actividades', address: 'UADY Estadio Carlos Iturralde', city: 'Mérida', state: 'Yucatán', lat: 20.9854, lng: -89.6278, phone: '9991110012', whatsapp: '9991110012', disability_types: JSON.stringify(['motriz']), age_min: 8, age_max: 50, is_verified: true, rating_avg: 4.7, rating_count: 14 },
  ]

  for (const inst of institutions) {
    await db('p_institutions').insert({ ...inst, plan_type: 'free', is_active: true })
  }

  // Grupos de comunidad
  const groups = [
    { id: uuid(), name: 'Feed general', description: 'Espacio abierto para todos.', category: 'social', disability_types: JSON.stringify([]), is_public: true },
    { id: uuid(), name: 'TEA - Primera infancia', description: 'Familias con niños con autismo de 0 a 6 años.', category: 'social', disability_types: JSON.stringify(['tea']), is_public: true },
    { id: uuid(), name: 'Adultos con TDAH', description: 'Estrategias y apoyo para adultos con TDAH.', category: 'social', disability_types: JSON.stringify(['intelectual']), is_public: true },
    { id: uuid(), name: 'Inclusión laboral', description: 'Empleos, capacitación y experiencias laborales inclusivas.', category: 'laboral', disability_types: JSON.stringify([]), is_public: true },
    { id: uuid(), name: 'Trámites y derechos', description: 'Guía sobre derechos, IMSS, pensiones y trámites.', category: 'social', disability_types: JSON.stringify([]), is_public: true },
  ]

  for (const g of groups) {
    await db('u_groups').insert({ ...g, member_count: 0, created_by: adminId })
  }

  // Posts demo
  const [generalGroup] = await db('u_groups').where({ name: 'Feed general' }).select('id')
  if (generalGroup) {
    await db('u_posts').insert([
      { id: uuid(), group_id: generalGroup.id, author_id: tutorId, content: '¡Hola a todos! Recién nos unimos a Raíces y ya encontramos 3 opciones de terapia cerca de casa. ¡Qué increíble plataforma! 🌱', like_count: 5 },
      { id: uuid(), group_id: generalGroup.id, author_id: demoId, content: '¿Alguien tiene experiencia con el CREE Yucatán? Queremos llevar a mi hermano para evaluación inicial.', like_count: 2 },
    ])
  }

  console.log('✅ Demo seed completo.')
  console.log('')
  console.log('👤 Usuarios demo:')
  console.log('   Admin:  admin@raices.mx / Admin1234')
  console.log('   PCD:    demo@raices.mx  / Demo1234')
  console.log('   Tutor:  tutor@raices.mx / Tutor1234')
  console.log('')
  console.log('🏛️  12 instituciones de Mérida cargadas')
  console.log('👥 5 grupos de comunidad creados')

  await db.destroy()
}

seed().catch((e) => { console.error(e); process.exit(1) })
