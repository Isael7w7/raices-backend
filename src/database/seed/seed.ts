import * as dotenv from 'dotenv'
dotenv.config()

import * as fs from 'fs'
import * as path from 'path'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { v4 as uuid } from 'uuid'

function tieneServiceAccountReal(): boolean {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) return true
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try { return fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS) } catch { return false }
  }
  const rutaLocal = path.resolve(process.cwd(), 'firebase-service-account.json')
  try { return fs.existsSync(rutaLocal) } catch { return false }
}

const authDisponible = tieneServiceAccountReal()

const projectId = process.env.FIREBASE_PROJECT_ID || 'raices-demo'
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT

if (getApps().length === 0) {
  if (serviceAccountJson) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)), projectId })
  } else {
    initializeApp({ projectId })
  }
}

const db = getFirestore()
const auth = authDisponible ? getAuth() : null

const UIDS_ESTATICOS = {
  admin: 'admin-demo-uid',
  user: 'user-demo-uid',
  tutor: 'tutor-demo-uid',
} as const

async function limpiarColeccion(nombre: string) {
  const snap = await db.collection(nombre).get()
  if (snap.empty) return
  const lote = db.batch()
  for (const doc of snap.docs) lote.delete(doc.ref)
  await lote.commit()
}

async function insertarLote(coleccion: string, documentos: Record<string, any>[]) {
  for (let i = 0; i < documentos.length; i += 500) {
    const lote = db.batch()
    const porcion = documentos.slice(i, i + 500)
    for (const doc of porcion) {
      const ref = db.collection(coleccion).doc(doc.id)
      lote.set(ref, doc)
    }
    await lote.commit()
  }
}

const usuariosDemo = [
  {
    email: 'admin@raices.mx',
    password: 'Admin1234',
    role: 'admin',
    full_name: 'Admin Raices',
    city: 'Merida',
    state: 'Yucatan',
    uidEstatico: UIDS_ESTATICOS.admin,
  },
  {
    email: 'demo@raices.mx',
    password: 'Demo1234',
    role: 'user',
    full_name: 'Luis Hernandez',
    city: 'Merida',
    state: 'Yucatan',
    uidEstatico: UIDS_ESTATICOS.user,
  },
  {
    email: 'tutor@raices.mx',
    password: 'Tutor1234',
    role: 'tutor',
    full_name: 'Ana Garcia',
    city: 'Merida',
    state: 'Yucatan',
    uidEstatico: UIDS_ESTATICOS.tutor,
  },
]

async function asegurarUsuarioFirebase(usuarioDemo: typeof usuariosDemo[0]): Promise<string | null> {
  if (!auth) return null
  try {
    const existente = await auth.getUserByEmail(usuarioDemo.email)
    console.log(`  ⏭️  ${usuarioDemo.email} ya existe en Firebase Auth (uid: ${existente.uid})`)
    await auth.updateUser(existente.uid, { password: usuarioDemo.password })
    return existente.uid
  } catch (e: any) {
    if (e?.code === 'auth/user-not-found') {
      try {
        const creado = await auth.createUser({
          email: usuarioDemo.email,
          password: usuarioDemo.password,
          displayName: usuarioDemo.full_name,
        })
        console.log(`  ✅ ${usuarioDemo.email} creado en Firebase Auth (uid: ${creado.uid})`)
        return creado.uid
      } catch { return null }
    }
    return null
  }
}

async function seed() {
  const t0 = Date.now()
  console.log('🌱 Sembrando datos demo en Firestore...\n')

  const coleccionesALimpiar = [
    'u_profiles', 'u_user_profiles', 'u_dependents',
    'u_favorites', 'u_reviews', 'u_posts', 'u_comments',
    'u_post_likes', 'u_groups', 'u_group_members',
    'u_direct_messages', 'u_notifications', 'u_job_applications',
    'p_institutions', 'p_jobs',
    's_settings',
  ]
  for (const col of coleccionesALimpiar) await limpiarColeccion(col)
  console.log(`✨ ${coleccionesALimpiar.length} colecciones limpiadas\n`)

  const ahora = new Date().toISOString()

  let adminId: string = UIDS_ESTATICOS.admin
  let demoId: string = UIDS_ESTATICOS.user
  let tutorId: string = UIDS_ESTATICOS.tutor
  let authSincronizado = false

  if (authDisponible) {
    console.log('🔐 Sincronizando usuarios con Firebase Auth...')
    const resultados = await Promise.all([
      asegurarUsuarioFirebase(usuariosDemo[0]),
      asegurarUsuarioFirebase(usuariosDemo[1]),
      asegurarUsuarioFirebase(usuariosDemo[2]),
    ])

    if (resultados.every(Boolean)) {
      adminId = resultados[0]!
      demoId = resultados[1]!
      tutorId = resultados[2]!
      authSincronizado = true
      console.log('')
    } else {
      console.log('⚠️  No se pudieron sincronizar usuarios en Firebase Auth mediante ADC')
      console.log('   Usando UIDs estaticos para demo...')
      console.log(`   admin  → ${adminId}`)
      console.log(`   user   → ${demoId}`)
      console.log(`   tutor  → ${tutorId}`)
      console.log('')
    }
  } else {
    console.log('⚠️  No se detecto Service Account (FIREBASE_SERVICE_ACCOUNT / GOOGLE_APPLICATION_CREDENTIALS)')
    console.log('   Firebase Auth no estara disponible. Usando UIDs estaticos para demo...')
    console.log(`   admin  → ${adminId}`)
    console.log(`   user   → ${demoId}`)
    console.log(`   tutor  → ${tutorId}`)
    console.log('')
  }

  await insertarLote('u_profiles', [
    {
      id: adminId, email: 'admin@raices.mx', role: 'admin',
      full_name: 'Admin Raices', city: 'Merida', state: 'Yucatan',
      is_active: true, is_verified: true, created_at: ahora,
    },
    {
      id: demoId, email: 'demo@raices.mx', role: 'user',
      full_name: 'Luis Hernandez', city: 'Merida', state: 'Yucatan',
      is_active: true, is_verified: true, created_at: ahora,
    },
    {
      id: tutorId, email: 'tutor@raices.mx', role: 'tutor',
      full_name: 'Ana Garcia', city: 'Merida', state: 'Yucatan',
      is_active: true, is_verified: true, created_at: ahora,
    },
  ])
  console.log('👤 3 usuarios demo creados en Firestore')

  await insertarLote('u_user_profiles', [
    {
      id: uuid(), user_id: demoId,
      age_range: '13-17',
      disability_types: JSON.stringify(['tea']),
      support_level: 'medio',
      needs: JSON.stringify(['socializacion', 'aprendizaje']),
      life_stage: 'adolescencia',
      education_history: JSON.stringify({ escolarizado: true, tipo: 'regular', nivel: 'secundaria' }),
      therapy_history: JSON.stringify({ tomado: true, tipos: ['lenguaje'] }),
      current_goals: JSON.stringify(['escuela', 'actividades_sociales']),
      support_areas: JSON.stringify(['integracion_social']),
      current_concerns: 'Dificultades de socializacion en la escuela',
      preferred_zones: JSON.stringify(['Centro', 'Norte']),
    },
    {
      id: uuid(), user_id: tutorId,
      age_range: '25-40',
      disability_types: JSON.stringify([]),
      support_level: 'bajo',
      needs: JSON.stringify(['informacion', 'acompanamiento']),
      life_stage: 'adulto',
      education_history: JSON.stringify({ escolarizado: true, tipo: 'regular', nivel: 'universidad' }),
      therapy_history: JSON.stringify({ tomado: false, tipos: [] }),
      current_goals: JSON.stringify(['encontrar_terapia_para_hijo', 'integracion_laboral']),
      support_areas: JSON.stringify(['orientacion_familiar']),
      current_concerns: 'Buscar opciones de terapia para mi hijo',
      preferred_zones: JSON.stringify(['Sur', 'Oriente']),
    },
  ])
  console.log('📋 2 perfiles de necesidades creados')

  await insertarLote('u_dependents', [
    {
      id: uuid(), guardian_id: tutorId,
      full_name: 'Mateo Garcia',
      relationship: 'hijo',
      profile_data: JSON.stringify({
        disability_types: ['tea'], age_range: '6-12', life_stage: 'infancia',
        notes: 'Diagnostico TEA nivel 1. En terapia de lenguaje desde los 4 anios.',
      }),
      created_at: ahora,
    },
    {
      id: uuid(), guardian_id: tutorId,
      full_name: 'Sofia Garcia',
      relationship: 'hija',
      profile_data: JSON.stringify({
        disability_types: ['intelectual'], age_range: '3-5', life_stage: 'primera_infancia',
        notes: 'Rezago en el desarrollo del lenguaje. En estimulacion temprana.',
      }),
      created_at: ahora,
    },
  ])
  console.log('👨‍👩‍👧 2 dependientes creados para el tutor')

  const instituciones = [
    {
      id: uuid(), name: 'Centro de Rehabilitacion DIF Merida',
      description: 'Terapias fisicas, ocupacionales y de lenguaje para personas con discapacidad motriz y del neurodesarrollo.',
      category: 'funcional', subcategory: 'terapias',
      address: 'Calle 50 x 65 #123', city: 'Merida', state: 'Yucatan',
      lat: 20.9674, lng: -89.6237,
      phone: '9999990001', whatsapp: '9991110001', email: 'contacto@difmerida.mx',
      disability_types: JSON.stringify(['motriz', 'intelectual', 'tea']),
      age_min: 0, age_max: 99,
      is_verified: true, is_active: true, rating_avg: 4.5, rating_count: 12,
      plan_type: 'free', created_by: adminId, created_at: ahora,
    },
    {
      id: uuid(), name: 'CREE Yucatan - IMSS',
      description: 'Centro de Rehabilitacion y Educacion Especial. Atencion medica y terapeutica integral del IMSS.',
      category: 'funcional', subcategory: 'atencion_especializada',
      address: 'Av. Jacinto Canek S/N', city: 'Merida', state: 'Yucatan',
      lat: 20.9589, lng: -89.6412,
      phone: '9999990004', whatsapp: null, email: 'cree.yucatan@imss.gob.mx',
      disability_types: JSON.stringify(['motriz', 'visual', 'auditiva', 'intelectual', 'multiple']),
      age_min: 0, age_max: 99,
      is_verified: true, is_active: true, rating_avg: 4.0, rating_count: 35,
      plan_type: 'free', created_by: adminId, created_at: ahora,
    },
    {
      id: uuid(), name: 'CEDIS - Estimulacion Temprana',
      description: 'Estimulacion temprana y atencion a ninos con rezago en el desarrollo de 0 a 6 anios.',
      category: 'funcional', subcategory: 'terapias',
      address: 'Av. Prolongacion Montejo 480', city: 'Merida', state: 'Yucatan',
      lat: 21.0098, lng: -89.6240,
      phone: '9999990009', whatsapp: '9991110009', email: 'cedis.merida@salud.gob.mx',
      disability_types: JSON.stringify(['intelectual', 'multiple']),
      age_min: 0, age_max: 6,
      is_verified: true, is_active: true, rating_avg: 4.9, rating_count: 18,
      plan_type: 'free', created_by: adminId, created_at: ahora,
    },
    {
      id: uuid(), name: 'Clinica Voces - Fonoaudiologia',
      description: 'Terapia de lenguaje para ninos y adultos con tartamudez, dislexia, TEA y afasia.',
      category: 'funcional', subcategory: 'terapias',
      address: 'Calle 17 x 28 #240', city: 'Merida', state: 'Yucatan',
      lat: 20.9820, lng: -89.6174,
      phone: '9999990011', whatsapp: '9991110011', email: 'info@clinicavoces.mx',
      disability_types: JSON.stringify(['tea', 'auditiva', 'intelectual']),
      age_min: 2, age_max: 70,
      is_verified: true, is_active: true, rating_avg: 4.5, rating_count: 22,
      plan_type: 'free', created_by: adminId, created_at: ahora,
    },
    {
      id: uuid(), name: 'Escuela de Educacion Especial No. 5',
      description: 'Educacion especial y habilidades adaptativas para ninos y jovenes con discapacidad intelectual.',
      category: 'educativo', subcategory: 'escuelas',
      address: 'Av. Itzaes 200', city: 'Merida', state: 'Yucatan',
      lat: 20.9712, lng: -89.6301,
      phone: '9999990002', whatsapp: '9991110002', email: 'ee5.merida@seyy.gob.mx',
      disability_types: JSON.stringify(['intelectual', 'tea']),
      age_min: 3, age_max: 22,
      is_verified: true, is_active: true, rating_avg: 4.2, rating_count: 8,
      plan_type: 'free', created_by: adminId, created_at: ahora,
    },
    {
      id: uuid(), name: 'Colegio Futuros Brillantes',
      description: 'Escuela privada con modelo de educacion inclusiva. Apoya TDAH, dislexia y TEA leve.',
      category: 'educativo', subcategory: 'escuelas',
      address: 'Calle 13 x 22 #150 Altabrisa', city: 'Merida', state: 'Yucatan',
      lat: 21.0034, lng: -89.6185,
      phone: '9999990006', whatsapp: '9991110006', email: 'admision@futurosbrillantes.mx',
      disability_types: JSON.stringify(['tea', 'intelectual']),
      age_min: 3, age_max: 18,
      is_verified: true, is_active: true, rating_avg: 4.6, rating_count: 9,
      plan_type: 'free', created_by: adminId, created_at: ahora,
    },
    {
      id: uuid(), name: 'Talleres Inclusivos Yucatan',
      description: 'Capacitacion laboral para adultos con discapacidad: carpinteria, bisuteria, panaderia.',
      category: 'laboral', subcategory: 'capacitacion',
      address: 'Calle 62 #400', city: 'Merida', state: 'Yucatan',
      lat: 20.9651, lng: -89.6325,
      phone: '9999990005', whatsapp: '9991110005', email: 'talleres@inclusivos.mx',
      disability_types: JSON.stringify(['intelectual', 'motriz']),
      age_min: 18, age_max: 60,
      is_verified: true, is_active: true, rating_avg: 4.3, rating_count: 15,
      plan_type: 'free', created_by: adminId, created_at: ahora,
    },
    {
      id: uuid(), name: 'Tech Accesible MX',
      description: 'Bolsa de trabajo especializada en vacantes para personas con discapacidad en sector tecnologico.',
      category: 'laboral', subcategory: 'insercion_laboral',
      address: 'Remoto / Col. Poligono 108', city: 'Merida', state: 'Yucatan',
      lat: 20.9900, lng: -89.6150,
      phone: '9991110010', whatsapp: '9991110010', email: 'empleo@techaccesible.mx',
      disability_types: JSON.stringify(['visual', 'auditiva', 'motriz']),
      age_min: 18, age_max: 55,
      is_verified: true, is_active: true, rating_avg: 4.4, rating_count: 7,
      plan_type: 'free', created_by: adminId, created_at: ahora,
    },
    {
      id: uuid(), name: 'Fundacion Alas y Raices Merida',
      description: 'Apoyo integral a personas con autismo: terapias ABA, integracion social y orientacion familiar.',
      category: 'social', subcategory: 'centros_comunitarios',
      address: 'Calle 20 #300 Col. Garcia Gineres', city: 'Merida', state: 'Yucatan',
      lat: 20.9801, lng: -89.6198,
      phone: '9999990003', whatsapp: '9991110003', email: 'info@alasyraices.mx',
      disability_types: JSON.stringify(['tea']),
      age_min: 2, age_max: 30,
      is_verified: true, is_active: true, rating_avg: 4.8, rating_count: 20,
      plan_type: 'free', created_by: adminId, created_at: ahora,
    },
    {
      id: uuid(), name: 'Grupo de Apoyo TEA Familias',
      description: 'Red de familias con hijos con autismo. Reuniones quincenales, asesorias y apoyo emocional.',
      category: 'social', subcategory: 'actividades',
      address: 'Sede rotativa', city: 'Merida', state: 'Yucatan',
      lat: 20.9740, lng: -89.6220,
      phone: '9991110007', whatsapp: '9991110007', email: 'contacto@teafamilias.mx',
      disability_types: JSON.stringify(['tea']),
      age_min: 0, age_max: 99,
      is_verified: false, is_active: true, rating_avg: 4.7, rating_count: 6,
      plan_type: 'free', created_by: adminId, created_at: ahora,
    },
    {
      id: uuid(), name: 'ASPADEM',
      description: 'Talleres productivos, vivienda asistida y programa de vida independiente para discapacidad mental.',
      category: 'social', subcategory: 'centros_comunitarios',
      address: 'Calle 29A x 46 #199', city: 'Merida', state: 'Yucatan',
      lat: 20.9703, lng: -89.6289,
      phone: '9999990008', whatsapp: '9991110008', email: 'info@aspadem.mx',
      disability_types: JSON.stringify(['intelectual', 'multiple']),
      age_min: 18, age_max: 99,
      is_verified: true, is_active: true, rating_avg: 4.1, rating_count: 11,
      plan_type: 'free', created_by: adminId, created_at: ahora,
    },
    {
      id: uuid(), name: 'Atletismo Paralimpico Yucatan',
      description: 'Entrenamiento deportivo adaptado para personas con discapacidad motriz.',
      category: 'social', subcategory: 'actividades',
      address: 'UADY Estadio Carlos Iturralde', city: 'Merida', state: 'Yucatan',
      lat: 20.9854, lng: -89.6278,
      phone: '9999990012', whatsapp: '9991110012', email: 'deporte@paralimpico.mx',
      disability_types: JSON.stringify(['motriz']),
      age_min: 8, age_max: 50,
      is_verified: true, is_active: true, rating_avg: 4.7, rating_count: 14,
      plan_type: 'free', created_by: adminId, created_at: ahora,
    },
  ]

  await insertarLote('p_institutions', instituciones)
  console.log(`🏢 ${instituciones.length} instituciones insertadas`)

  const vacantes = [
    {
      id: uuid(), institution_id: instituciones[6].id,
      title: 'Carpintero/a Artesanal',
      description: 'Taller de carpinteria artesanal para crear muebles y objetos decorativos. Capacitacion incluida.',
      requirements: 'Interes en manualidades. No se requiere experiencia previa.',
      modality: 'presencial', schedule: 'Lun-Vie 8:00-14:00',
      salary_range: '$4,000 - $6,000 MXN', city: 'Merida', state: 'Yucatan',
      disability_inclusive: true,
      disability_types: JSON.stringify(['intelectual', 'motriz']),
      is_active: true, created_at: ahora,
    },
    {
      id: uuid(), institution_id: instituciones[7].id,
      title: 'Asistente de Soporte Tecnico',
      description: 'Soporte tecnico remoto para usuarios con discapacidad visual. Capacitacion en lectores de pantalla.',
      requirements: 'Conocimientos basicos de computacion. Disponibilidad de equipo propio.',
      modality: 'remoto', schedule: 'Lun-Vie 9:00-17:00',
      salary_range: '$8,000 - $12,000 MXN', city: 'Merida', state: 'Yucatan',
      disability_inclusive: true,
      disability_types: JSON.stringify(['visual', 'auditiva', 'motriz']),
      is_active: true, created_at: ahora,
    },
    {
      id: uuid(), institution_id: instituciones[7].id,
      title: 'Desarrollador/a Frontend Junior',
      description: 'Desarrollo de interfaces web accesibles. Trabajo remoto con horario flexible.',
      requirements: 'Conocimiento de HTML, CSS y JavaScript. Portafolio o proyectos personales.',
      modality: 'remoto', schedule: 'Flexible',
      salary_range: '$12,000 - $18,000 MXN', city: 'Merida', state: 'Yucatan',
      disability_inclusive: true,
      disability_types: JSON.stringify(['visual', 'auditiva', 'motriz']),
      is_active: true, created_at: ahora,
    },
    {
      id: uuid(), institution_id: instituciones[9].id,
      title: 'Asistente Terapeutico',
      description: 'Apoyo en sesiones de terapia ABA para ninos con autismo. Se proporciona capacitacion.',
      requirements: 'Paciencia, empatia y disposicion para trabajar con ninos. Estudiantes de psicologia o terapia son bienvenidos.',
      modality: 'presencial', schedule: 'Lun-Vie 8:00-15:00',
      salary_range: '$6,000 - $9,000 MXN', city: 'Merida', state: 'Yucatan',
      disability_inclusive: true,
      disability_types: JSON.stringify(['tea']),
      is_active: true, created_at: ahora,
    },
    {
      id: uuid(), institution_id: instituciones[11].id,
      title: 'Auxiliar de Cocina',
      description: 'Apoyo en cocina comunitaria para talleres de capacitacion laboral.',
      requirements: 'Interes en gastronomia. Entorno adaptado y supervisado.',
      modality: 'presencial', schedule: 'Lun-Vie 7:00-13:00',
      salary_range: '$4,500 - $6,500 MXN', city: 'Merida', state: 'Yucatan',
      disability_inclusive: true,
      disability_types: JSON.stringify(['intelectual', 'multiple']),
      is_active: true, created_at: ahora,
    },
    {
      id: uuid(), institution_id: instituciones[8].id,
      title: 'Educador/a de Estimulacion Temprana',
      description: 'Imparticion de sesiones de estimulacion temprana para ninos de 0 a 6 anios con rezago en desarrollo.',
      requirements: 'Licenciatura en educacion especial, psicologia o afines. Experiencia minima de 1 anio.',
      modality: 'presencial', schedule: 'Lun-Vie 8:00-14:00',
      salary_range: '$9,000 - $13,000 MXN', city: 'Merida', state: 'Yucatan',
      disability_inclusive: true,
      disability_types: JSON.stringify(['intelectual', 'multiple']),
      is_active: true, created_at: ahora,
    },
    {
      id: uuid(), institution_id: instituciones[0].id,
      title: 'Terapeuta Ocupacional',
      description: 'Atencion terapeutica ocupacional para pacientes con discapacidad motriz y neurodesarrollo.',
      requirements: 'Licenciatura en Terapia Ocupacional. Experiencia en centros de rehabilitacion deseable.',
      modality: 'presencial', schedule: 'Lun-Vie 7:00-15:00',
      salary_range: '$12,000 - $16,000 MXN', city: 'Merida', state: 'Yucatan',
      disability_inclusive: true,
      disability_types: JSON.stringify(['motriz', 'intelectual']),
      is_active: true, created_at: ahora,
    },
  ]

  await insertarLote('p_jobs', vacantes)
  console.log(`💼 ${vacantes.length} vacantes de empleo creadas`)

  const grupos = [
    {
      id: uuid(), name: 'Feed general',
      description: 'Espacio abierto para todos los miembros de Raices.',
      category: 'social', disability_types: JSON.stringify([]),
      is_public: true, member_count: 0, created_by: adminId, created_at: ahora,
    },
    {
      id: uuid(), name: 'TEA - Primera infancia',
      description: 'Familias con ninos con autismo de 0 a 6 anios. Intercambio de experiencias y recursos.',
      category: 'social', disability_types: JSON.stringify(['tea']),
      is_public: true, member_count: 0, created_by: adminId, created_at: ahora,
    },
    {
      id: uuid(), name: 'Adultos con TDAH',
      description: 'Estrategias, apoyo y experiencias de vida para adultos diagnosticados con TDAH.',
      category: 'social', disability_types: JSON.stringify(['intelectual']),
      is_public: true, member_count: 0, created_by: adminId, created_at: ahora,
    },
    {
      id: uuid(), name: 'Inclusion laboral',
      description: 'Empleos, capacitacion y experiencias laborales inclusivas. Comparte ofertas y oportunidades.',
      category: 'laboral', disability_types: JSON.stringify([]),
      is_public: true, member_count: 0, created_by: adminId, created_at: ahora,
    },
    {
      id: uuid(), name: 'Tramites y derechos',
      description: 'Guia sobre derechos, IMSS, pensiones, credencial de discapacidad y tramites gubernamentales.',
      category: 'social', disability_types: JSON.stringify([]),
      is_public: true, member_count: 0, created_by: adminId, created_at: ahora,
    },
  ]

  await insertarLote('u_groups', grupos)
  console.log(`👥 ${grupos.length} grupos de comunidad creados`)

  const publicaciones = [
    {
      id: uuid(), group_id: grupos[0].id, author_id: tutorId,
      content: 'Hola a todos! Recien nos unimos a Raices y ya encontramos 3 opciones de terapia cerca de casa. Que increible plataforma!',
      like_count: 5, created_at: ahora,
    },
    {
      id: uuid(), group_id: grupos[0].id, author_id: demoId,
      content: 'Alguien tiene experiencia con el CREE Yucatan? Queremos llevar a mi hermano para evaluacion inicial.',
      like_count: 2, created_at: ahora,
    },
    {
      id: uuid(), group_id: grupos[3].id, author_id: adminId,
      content: 'Tech Accesible MX publico 2 nuevas vacantes remotas para desarrolladores front-end. Revisen la seccion de Empleo!',
      like_count: 8, created_at: ahora,
    },
    {
      id: uuid(), group_id: grupos[1].id, author_id: tutorId,
      content: 'Nuestro hijo fue diagnosticado TEA nivel 1 a los 5 anios. Hoy tiene 8 y va en 3er grado. La terapia ABA le cambio la vida. Si necesitan orientacion, estoy para ayudar.',
      like_count: 12, created_at: ahora,
    },
    {
      id: uuid(), group_id: grupos[4].id, author_id: demoId,
      content: 'Alguien sabe cuanto tarda en llegar la credencial de discapacidad por CONADIS? Ya hice el tramite hace 3 semanas.',
      like_count: 3, created_at: ahora,
    },
  ]

  await insertarLote('u_posts', publicaciones)
  console.log(`📝 ${publicaciones.length} posts de comunidad creados`)

  const configuraciones = [
    { id: uuid(), key: 'platform_name', value: 'Raices para Florecer', updated_at: ahora },
    { id: uuid(), key: 'support_email', value: 'soporte@raices.mx', updated_at: ahora },
    { id: uuid(), key: 'allow_registration', value: 'true', updated_at: ahora },
    { id: uuid(), key: 'require_institution_approval', value: 'true', updated_at: ahora },
    { id: uuid(), key: 'ai_enabled', value: 'true', updated_at: ahora },
    { id: uuid(), key: 'maintenance_mode', value: 'false', updated_at: ahora },
    { id: uuid(), key: 'max_reviews_per_user', value: '10', updated_at: ahora },
    { id: uuid(), key: 'default_city', value: 'Merida', updated_at: ahora },
  ]

  await insertarLote('s_settings', configuraciones)
  console.log(`⚙️  ${configuraciones.length} configuraciones de plataforma creadas`)

  const tiempoTotal = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\n✅ Seed completo en ${tiempoTotal}s`)
  console.log('')
  console.log('👤 Usuarios demo:')
  console.log('   Admin:  admin@raices.mx  / Admin1234  (rol: admin)')
  console.log('   PCD:    demo@raices.mx   / Demo1234   (rol: user)')
  console.log('   Tutor:  tutor@raices.mx  / Tutor1234  (rol: tutor)')
  console.log(`   Auth:   ${authSincronizado ? 'Firebase Auth (reales)' : 'UIDs estaticos (sin Auth)'}`)
  console.log('')
  console.log(`🏛️  ${instituciones.length} instituciones de Merida`)
  console.log(`💼 ${vacantes.length} vacantes de empleo inclusivo`)
  console.log(`👥 ${grupos.length} grupos de comunidad`)
  console.log(`📝 ${publicaciones.length} posts iniciales`)
  console.log(`👨‍👩‍👧 2 dependientes del tutor`)
  console.log(`⚙️  ${configuraciones.length} configuraciones de plataforma`)

  process.exit(0)
}

seed().catch((e) => {
  console.error('❌ Error durante el seed:', e)
  process.exit(1)
})
