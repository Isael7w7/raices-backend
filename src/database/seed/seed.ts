import * as dotenv from 'dotenv'
dotenv.config()

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { v4 as uuid } from 'uuid'

// ── Firebase Admin initialization ──────────────────────────────
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
const auth = getAuth()

// ── Helper: limpiar colección completa ─────────────────────────
async function clearCollection(name: string) {
  const snap = await db.collection(name).get()
  if (snap.empty) return
  const batch = db.batch()
  for (const doc of snap.docs) batch.delete(doc.ref)
  await batch.commit()
}

// ── Helper: insertar documentos en batches de 500 ─────────────
async function insertBatch(collection: string, docs: Record<string, any>[]) {
  for (let i = 0; i < docs.length; i += 500) {
    const batch = db.batch()
    const chunk = docs.slice(i, i + 500)
    for (const doc of chunk) {
      const ref = db.collection(collection).doc(doc.id)
      batch.set(ref, doc)
    }
    await batch.commit()
  }
}

// ── Seed principal ─────────────────────────────────────────────
async function seed() {
  const t0 = Date.now()
  console.log('🌱 Seeding demo data to Firestore...\n')

  // ──────────────────── 1. Limpiar colecciones ────────────────────
  const collectionsToClean = [
    'u_profiles', 'u_user_profiles', 'u_dependents',
    'u_favorites', 'u_reviews', 'u_posts', 'u_comments',
    'u_post_likes', 'u_groups', 'u_group_members',
    'u_direct_messages', 'u_notifications', 'u_job_applications',
    'p_institutions', 'p_jobs',
    's_settings',
  ]
  for (const col of collectionsToClean) await clearCollection(col)
  console.log(`✨ ${collectionsToClean.length} colecciones limpiadas\n`)

  // ──────────────────── 2. Usuarios demo (via Firebase Auth) ──────
  const now = new Date().toISOString()

  const demoUsersData = [
    {
      email: 'admin@raices.mx',
      password: 'Admin1234',
      role: 'admin',
      full_name: 'Admin Raíces',
      city: 'Mérida',
      state: 'Yucatán',
    },
    {
      email: 'demo@raices.mx',
      password: 'Demo1234',
      role: 'user',
      full_name: 'Luis Hernández',
      city: 'Mérida',
      state: 'Yucatán',
    },
    {
      email: 'tutor@raices.mx',
      password: 'Tutor1234',
      role: 'tutor',
      full_name: 'Ana García',
      city: 'Mérida',
      state: 'Yucatán',
    },
  ]

  const userIds: string[] = []

  for (const userData of demoUsersData) {
    try {
      // Create user in Firebase Auth (password managed entirely by Firebase)
      const userRecord = await auth.createUser({
        email: userData.email,
        password: userData.password,
        displayName: userData.full_name,
      })
      userIds.push(userRecord.uid)

      // Store profile in Firestore (no password_hash)
      await db.collection('u_profiles').doc(userRecord.uid).set({
        id: userRecord.uid,
        email: userData.email,
        role: userData.role,
        full_name: userData.full_name,
        city: userData.city,
        state: userData.state,
        is_active: true,
        is_verified: true,
        created_at: now,
      })
    } catch (e: any) {
      if (e?.code === 'auth/email-already-exists') {
        const existing = await auth.getUserByEmail(userData.email)
        userIds.push(existing.uid)
        // Still create/update the Firestore profile
        await db.collection('u_profiles').doc(existing.uid).set({
          id: existing.uid,
          email: userData.email,
          role: userData.role,
          full_name: userData.full_name,
          city: userData.city,
          state: userData.state,
          is_active: true,
          is_verified: true,
          created_at: now,
        })
      } else {
        throw e
      }
    }
  }

  const [adminId, demoId, tutorId] = userIds
  console.log('👤 3 usuarios demo creados')

  // ──────────────────── 3. Perfiles de necesidades ────────────────
  await insertBatch('u_user_profiles', [
    {
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
      current_concerns: 'Dificultades de socialización en la escuela',
      preferred_zones: JSON.stringify(['Centro', 'Norte']),
    },
    {
      id: uuid(),
      user_id: tutorId,
      age_range: '25-40',
      disability_types: JSON.stringify([]),
      support_level: 'bajo',
      needs: JSON.stringify(['información', 'acompañamiento']),
      life_stage: 'adulto',
      education_history: JSON.stringify({ escolarizado: true, tipo: 'regular', nivel: 'universidad' }),
      therapy_history: JSON.stringify({ tomado: false, tipos: [] }),
      current_goals: JSON.stringify(['encontrar_terapia_para_hijo', 'integración_laboral']),
      support_areas: JSON.stringify(['orientación_familiar']),
      current_concerns: 'Buscar opciones de terapia para mi hijo',
      preferred_zones: JSON.stringify(['Sur', 'Oriente']),
    },
  ])
  console.log('📋 2 perfiles de necesidades creados')

  // ──────────────────── 4. Dependientes (tutor) ──────────────────
  await insertBatch('u_dependents', [
    {
      id: uuid(),
      guardian_id: tutorId,
      full_name: 'Mateo García',
      relationship: 'hijo',
      profile_data: JSON.stringify({
        disability_types: ['tea'],
        age_range: '6-12',
        life_stage: 'infancia',
        notes: 'Diagnóstico TEA nivel 1. En terapia de lenguaje desde los 4 años.',
      }),
      created_at: now,
    },
    {
      id: uuid(),
      guardian_id: tutorId,
      full_name: 'Sofía García',
      relationship: 'hija',
      profile_data: JSON.stringify({
        disability_types: ['intelectual'],
        age_range: '3-5',
        life_stage: 'primera_infancia',
        notes: 'Rezago en el desarrollo del lenguaje. En estimulación temprana.',
      }),
      created_at: now,
    },
  ])
  console.log('👨‍👩‍👧 2 dependientes creados para el tutor')

  // ──────────────────── 5. Instituciones (12) ────────────────────
  const institutions = [
    // ── Terapia (funcional) ──
    {
      id: uuid(), name: 'Centro de Rehabilitación DIF Mérida',
      description: 'Terapias físicas, ocupacionales y de lenguaje para personas con discapacidad motriz y del neurodesarrollo.',
      category: 'funcional', subcategory: 'terapias',
      address: 'Calle 50 x 65 #123', city: 'Mérida', state: 'Yucatán',
      lat: 20.9674, lng: -89.6237,
      phone: '9999990001', whatsapp: '9991110001', email: 'contacto@difmerida.mx',
      disability_types: JSON.stringify(['motriz', 'intelectual', 'tea']),
      age_min: 0, age_max: 99,
      is_verified: true, is_active: true, rating_avg: 4.5, rating_count: 12,
      plan_type: 'free', created_by: adminId, created_at: now,
    },
    {
      id: uuid(), name: 'CREE Yucatán - IMSS',
      description: 'Centro de Rehabilitación y Educación Especial. Atención médica y terapéutica integral del IMSS.',
      category: 'funcional', subcategory: 'atencion_especializada',
      address: 'Av. Jacinto Canek S/N', city: 'Mérida', state: 'Yucatán',
      lat: 20.9589, lng: -89.6412,
      phone: '9999990004', whatsapp: null, email: 'cree.yucatan@imss.gob.mx',
      disability_types: JSON.stringify(['motriz', 'visual', 'auditiva', 'intelectual', 'multiple']),
      age_min: 0, age_max: 99,
      is_verified: true, is_active: true, rating_avg: 4.0, rating_count: 35,
      plan_type: 'free', created_by: adminId, created_at: now,
    },
    {
      id: uuid(), name: 'CEDIS - Estimulación Temprana',
      description: 'Estimulación temprana y atención a niños con rezago en el desarrollo de 0 a 6 años.',
      category: 'funcional', subcategory: 'terapias',
      address: 'Av. Prolongación Montejo 480', city: 'Mérida', state: 'Yucatán',
      lat: 21.0098, lng: -89.6240,
      phone: '9999990009', whatsapp: '9991110009', email: 'cedis.merida@salud.gob.mx',
      disability_types: JSON.stringify(['intelectual', 'multiple']),
      age_min: 0, age_max: 6,
      is_verified: true, is_active: true, rating_avg: 4.9, rating_count: 18,
      plan_type: 'free', created_by: adminId, created_at: now,
    },
    {
      id: uuid(), name: 'Clínica Voces - Fonoaudiología',
      description: 'Terapia de lenguaje para niños y adultos con tartamudez, dislexia, TEA y afasia.',
      category: 'funcional', subcategory: 'terapias',
      address: 'Calle 17 x 28 #240', city: 'Mérida', state: 'Yucatán',
      lat: 20.9820, lng: -89.6174,
      phone: '9999990011', whatsapp: '9991110011', email: 'info@clinicavoces.mx',
      disability_types: JSON.stringify(['tea', 'auditiva', 'intelectual']),
      age_min: 2, age_max: 70,
      is_verified: true, is_active: true, rating_avg: 4.5, rating_count: 22,
      plan_type: 'free', created_by: adminId, created_at: now,
    },

    // ── Educación (educativo) ──
    {
      id: uuid(), name: 'Escuela de Educación Especial No. 5',
      description: 'Educación especial y habilidades adaptativas para niños y jóvenes con discapacidad intelectual.',
      category: 'educativo', subcategory: 'escuelas',
      address: 'Av. Itzáes 200', city: 'Mérida', state: 'Yucatán',
      lat: 20.9712, lng: -89.6301,
      phone: '9999990002', whatsapp: '9991110002', email: 'ee5.merida@seyy.gob.mx',
      disability_types: JSON.stringify(['intelectual', 'tea']),
      age_min: 3, age_max: 22,
      is_verified: true, is_active: true, rating_avg: 4.2, rating_count: 8,
      plan_type: 'free', created_by: adminId, created_at: now,
    },
    {
      id: uuid(), name: 'Colegio Futuros Brillantes',
      description: 'Escuela privada con modelo de educación inclusiva. Apoya TDAH, dislexia y TEA leve.',
      category: 'educativo', subcategory: 'escuelas',
      address: 'Calle 13 x 22 #150 Altabrisa', city: 'Mérida', state: 'Yucatán',
      lat: 21.0034, lng: -89.6185,
      phone: '9999990006', whatsapp: '9991110006', email: 'admision@futurosbrillantes.mx',
      disability_types: JSON.stringify(['tea', 'intelectual']),
      age_min: 3, age_max: 18,
      is_verified: true, is_active: true, rating_avg: 4.6, rating_count: 9,
      plan_type: 'free', created_by: adminId, created_at: now,
    },

    // ── Empleo (laboral) ──
    {
      id: uuid(), name: 'Talleres Inclusivos Yucatán',
      description: 'Capacitación laboral para adultos con discapacidad: carpintería, bisutería, panadería.',
      category: 'laboral', subcategory: 'capacitacion',
      address: 'Calle 62 #400', city: 'Mérida', state: 'Yucatán',
      lat: 20.9651, lng: -89.6325,
      phone: '9999990005', whatsapp: '9991110005', email: 'talleres@inclusivos.mx',
      disability_types: JSON.stringify(['intelectual', 'motriz']),
      age_min: 18, age_max: 60,
      is_verified: true, is_active: true, rating_avg: 4.3, rating_count: 15,
      plan_type: 'free', created_by: adminId, created_at: now,
    },
    {
      id: uuid(), name: 'Tech Accesible MX',
      description: 'Bolsa de trabajo especializada en vacantes para personas con discapacidad en sector tecnológico.',
      category: 'laboral', subcategory: 'insercion_laboral',
      address: 'Remoto / Col. Polígono 108', city: 'Mérida', state: 'Yucatán',
      lat: 20.9900, lng: -89.6150,
      phone: '9991110010', whatsapp: '9991110010', email: 'empleo@techaccesible.mx',
      disability_types: JSON.stringify(['visual', 'auditiva', 'motriz']),
      age_min: 18, age_max: 55,
      is_verified: true, is_active: true, rating_avg: 4.4, rating_count: 7,
      plan_type: 'free', created_by: adminId, created_at: now,
    },

    // ── Comunidad (social) ──
    {
      id: uuid(), name: 'Fundación Alas y Raíces Mérida',
      description: 'Apoyo integral a personas con autismo: terapias ABA, integración social y orientación familiar.',
      category: 'social', subcategory: 'centros_comunitarios',
      address: 'Calle 20 #300 Col. García Ginerés', city: 'Mérida', state: 'Yucatán',
      lat: 20.9801, lng: -89.6198,
      phone: '9999990003', whatsapp: '9991110003', email: 'info@alasyraices.mx',
      disability_types: JSON.stringify(['tea']),
      age_min: 2, age_max: 30,
      is_verified: true, is_active: true, rating_avg: 4.8, rating_count: 20,
      plan_type: 'free', created_by: adminId, created_at: now,
    },
    {
      id: uuid(), name: 'Grupo de Apoyo TEA Familias',
      description: 'Red de familias con hijos con autismo. Reuniones quincenales, asesorías y apoyo emocional.',
      category: 'social', subcategory: 'actividades',
      address: 'Sede rotativa', city: 'Mérida', state: 'Yucatán',
      lat: 20.9740, lng: -89.6220,
      phone: '9991110007', whatsapp: '9991110007', email: 'contacto@teafamilias.mx',
      disability_types: JSON.stringify(['tea']),
      age_min: 0, age_max: 99,
      is_verified: false, is_active: true, rating_avg: 4.7, rating_count: 6,
      plan_type: 'free', created_by: adminId, created_at: now,
    },
    {
      id: uuid(), name: 'ASPADEM',
      description: 'Talleres productivos, vivienda asistida y programa de vida independiente para discapacidad mental.',
      category: 'social', subcategory: 'centros_comunitarios',
      address: 'Calle 29A x 46 #199', city: 'Mérida', state: 'Yucatán',
      lat: 20.9703, lng: -89.6289,
      phone: '9999990008', whatsapp: '9991110008', email: 'info@aspadem.mx',
      disability_types: JSON.stringify(['intelectual', 'multiple']),
      age_min: 18, age_max: 99,
      is_verified: true, is_active: true, rating_avg: 4.1, rating_count: 11,
      plan_type: 'free', created_by: adminId, created_at: now,
    },
    {
      id: uuid(), name: 'Atletismo Paralímpico Yucatán',
      description: 'Entrenamiento deportivo adaptado para personas con discapacidad motriz.',
      category: 'social', subcategory: 'actividades',
      address: 'UADY Estadio Carlos Iturralde', city: 'Mérida', state: 'Yucatán',
      lat: 20.9854, lng: -89.6278,
      phone: '9999990012', whatsapp: '9991110012', email: 'deporte@paralimpico.mx',
      disability_types: JSON.stringify(['motriz']),
      age_min: 8, age_max: 50,
      is_verified: true, is_active: true, rating_avg: 4.7, rating_count: 14,
      plan_type: 'free', created_by: adminId, created_at: now,
    },
  ]

  await insertBatch('p_institutions', institutions)
  console.log(`🏢 ${institutions.length} instituciones insertadas`)

  // ──────────────────── 6. Vacantes de empleo (7) ────────────────
  const jobs = [
    {
      id: uuid(),
      institution_id: institutions[6].id, // Talleres Inclusivos
      title: ' Carpintero/a Artesanal',
      description: 'Taller de carpintería artesanal para crear muebles y objetos decorativos. Capacitación incluida.',
      requirements: 'Interés en manualidades. No se requiere experiencia previa.',
      modality: 'presencial', schedule: 'Lun-Vie 8:00-14:00',
      salary_range: '$4,000 - $6,000 MXN',
      city: 'Mérida', state: 'Yucatán',
      disability_inclusive: true,
      disability_types: JSON.stringify(['intelectual', 'motriz']),
      is_active: true, created_at: now,
    },
    {
      id: uuid(),
      institution_id: institutions[7].id, // Tech Accesible
      title: 'Asistente de Soporte Técnico',
      description: 'Soporte técnico remoto para usuarios con discapacidad visual. Capacitación en lectores de pantalla.',
      requirements: 'Conocimientos básicos de computación. Disponibilidad de equipo propio.',
      modality: 'remoto', schedule: 'Lun-Vie 9:00-17:00',
      salary_range: '$8,000 - $12,000 MXN',
      city: 'Mérida', state: 'Yucatán',
      disability_inclusive: true,
      disability_types: JSON.stringify(['visual', 'auditiva', 'motriz']),
      is_active: true, created_at: now,
    },
    {
      id: uuid(),
      institution_id: institutions[7].id, // Tech Accesible
      title: 'Desarrollador/a Frontend Junior',
      description: 'Desarrollo de interfaces web accesibles. Trabajo remoto con horario flexible.',
      requirements: 'Conocimiento de HTML, CSS y JavaScript. Portafolio o proyectos personales.',
      modality: 'remoto', schedule: 'Flexible',
      salary_range: '$12,000 - $18,000 MXN',
      city: 'Mérida', state: 'Yucatán',
      disability_inclusive: true,
      disability_types: JSON.stringify(['visual', 'auditiva', 'motriz']),
      is_active: true, created_at: now,
    },
    {
      id: uuid(),
      institution_id: institutions[9].id, // Fundación Alas y Raíces
      title: 'Asistente Terapéutico',
      description: 'Apoyo en sesiones de terapia ABA para niños con autismo. Se proporciona capacitación.',
      requirements: 'Paciencia, empatía y disposición para trabajar con niños. Estudiantes de psicología o terapia son bienvenidos.',
      modality: 'presencial', schedule: 'Lun-Vie 8:00-15:00',
      salary_range: '$6,000 - $9,000 MXN',
      city: 'Mérida', state: 'Yucatán',
      disability_inclusive: true,
      disability_types: JSON.stringify(['tea']),
      is_active: true, created_at: now,
    },
    {
      id: uuid(),
      institution_id: institutions[11].id, // ASPADEM
      title: 'Auxiliar de Cocina',
      description: 'Apoyo en cocina comunitaria para talleres de capacitación laboral.',
      requirements: 'Interés en gastronomía. Entorno adaptado y supervisado.',
      modality: 'presencial', schedule: 'Lun-Vie 7:00-13:00',
      salary_range: '$4,500 - $6,500 MXN',
      city: 'Mérida', state: 'Yucatán',
      disability_inclusive: true,
      disability_types: JSON.stringify(['intelectual', 'multiple']),
      is_active: true, created_at: now,
    },
    {
      id: uuid(),
      institution_id: institutions[8].id, // CEDIS
      title: 'Educador/a de Estimulación Temprana',
      description: 'Impartición de sesiones de estimulación temprana para niños de 0 a 6 años con rezago en desarrollo.',
      requirements: 'Licenciatura en educación especial, psicología o afines. Experiencia mínima de 1 año.',
      modality: 'presencial', schedule: 'Lun-Vie 8:00-14:00',
      salary_range: '$9,000 - $13,000 MXN',
      city: 'Mérida', state: 'Yucatán',
      disability_inclusive: true,
      disability_types: JSON.stringify(['intelectual', 'multiple']),
      is_active: true, created_at: now,
    },
    {
      id: uuid(),
      institution_id: institutions[0].id, // DIF Mérida
      title: 'Terapeuta Ocupacional',
      description: 'Atención terapéutica ocupacional para pacientes con discapacidad motriz y neurodesarrollo.',
      requirements: 'Licenciatura en Terapia Ocupacional. Experiencia en centros de rehabilitación deseable.',
      modality: 'presencial', schedule: 'Lun-Vie 7:00-15:00',
      salary_range: '$12,000 - $16,000 MXN',
      city: 'Mérida', state: 'Yucatán',
      disability_inclusive: true,
      disability_types: JSON.stringify(['motriz', 'intelectual']),
      is_active: true, created_at: now,
    },
  ]

  await insertBatch('p_jobs', jobs)
  console.log(`💼 ${jobs.length} vacantes de empleo creadas`)

  // ──────────────────── 7. Grupos de comunidad (5) ────────────────
  const groups = [
    {
      id: uuid(), name: 'Feed general',
      description: 'Espacio abierto para todos los miembros de Raíces.',
      category: 'social', disability_types: JSON.stringify([]),
      is_public: true, member_count: 0, created_by: adminId, created_at: now,
    },
    {
      id: uuid(), name: 'TEA - Primera infancia',
      description: 'Familias con niños con autismo de 0 a 6 años. Intercambio de experiencias y recursos.',
      category: 'social', disability_types: JSON.stringify(['tea']),
      is_public: true, member_count: 0, created_by: adminId, created_at: now,
    },
    {
      id: uuid(), name: 'Adultos con TDAH',
      description: 'Estrategias, apoyo y experiencias de vida para adultos diagnosticados con TDAH.',
      category: 'social', disability_types: JSON.stringify(['intelectual']),
      is_public: true, member_count: 0, created_by: adminId, created_at: now,
    },
    {
      id: uuid(), name: 'Inclusión laboral',
      description: 'Empleos, capacitación y experiencias laborales inclusivas. Comparte ofertas y oportunidades.',
      category: 'laboral', disability_types: JSON.stringify([]),
      is_public: true, member_count: 0, created_by: adminId, created_at: now,
    },
    {
      id: uuid(), name: 'Trámites y derechos',
      description: 'Guía sobre derechos, IMSS, pensiones, credencial de discapacidad y trámites gubernamentales.',
      category: 'social', disability_types: JSON.stringify([]),
      is_public: true, member_count: 0, created_by: adminId, created_at: now,
    },
  ]

  await insertBatch('u_groups', groups)
  console.log(`👥 ${groups.length} grupos de comunidad creados`)

  // ──────────────────── 8. Posts de comunidad (5) ─────────────────
  const posts = [
    {
      id: uuid(), group_id: groups[0].id, author_id: tutorId,
      content: '¡Hola a todos! Recién nos unimos a Raíces y ya encontramos 3 opciones de terapia cerca de casa. ¡Qué increíble plataforma! 🌱',
      like_count: 5, created_at: now,
    },
    {
      id: uuid(), group_id: groups[0].id, author_id: demoId,
      content: '¿Alguien tiene experiencia con el CREE Yucatán? Queremos llevar a mi hermano para evaluación inicial.',
      like_count: 2, created_at: now,
    },
    {
      id: uuid(), group_id: groups[3].id, author_id: adminId,
      content: '📢 Tech Accesible MX publicó 2 nuevas vacantes remotas para desarrolladores front-end. ¡Revisen la sección de Empleo!',
      like_count: 8, created_at: now,
    },
    {
      id: uuid(), group_id: groups[1].id, author_id: tutorId,
      content: 'Nuestro hijo fue diagnosticado TEA nivel 1 a los 5 años. Hoy tiene 8 y va en 3er grado. La terapia ABA le cambió la vida. Si necesitan orientación, estoy para ayudar. 💪',
      like_count: 12, created_at: now,
    },
    {
      id: uuid(), group_id: groups[4].id, author_id: demoId,
      content: '¿Alguien sabe cuánto tarda en llegar la credencial de discapacidad por CONADIS? Ya hice el trámite hace 3 semanas.',
      like_count: 3, created_at: now,
    },
  ]

  await insertBatch('u_posts', posts)
  console.log(`📝 ${posts.length} posts de comunidad creados`)

  // ──────────────────── 9. Configuración de plataforma ───────────
  const settings = [
    { id: uuid(), key: 'platform_name', value: 'Raíces para Florecer', updated_at: now },
    { id: uuid(), key: 'support_email', value: 'soporte@raices.mx', updated_at: now },
    { id: uuid(), key: 'allow_registration', value: 'true', updated_at: now },
    { id: uuid(), key: 'require_institution_approval', value: 'true', updated_at: now },
    { id: uuid(), key: 'ai_enabled', value: 'true', updated_at: now },
    { id: uuid(), key: 'maintenance_mode', value: 'false', updated_at: now },
    { id: uuid(), key: 'max_reviews_per_user', value: '10', updated_at: now },
    { id: uuid(), key: 'default_city', value: 'Mérida', updated_at: now },
  ]

  await insertBatch('s_settings', settings)
  console.log(`⚙️  ${settings.length} configuraciones de plataforma creadas`)

  // ──────────────────── Resumen final ─────────────────────────────
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\n✅ Seed completo en ${elapsed}s`)
  console.log('')
  console.log('👤 Usuarios demo:')
  console.log('   Admin:  admin@raices.mx  / Admin1234  (rol: admin)')
  console.log('   PCD:    demo@raices.mx   / Demo1234   (rol: user)')
  console.log('   Tutor:  tutor@raices.mx  / Tutor1234  (rol: tutor)')
  console.log('')
  console.log(`🏛️  ${institutions.length} instituciones de Mérida`)
  console.log(`💼 ${jobs.length} vacantes de empleo inclusivo`)
  console.log(`👥 ${groups.length} grupos de comunidad`)
  console.log(`📝 ${posts.length} posts iniciales`)
  console.log(`👨‍👩‍👧 2 dependientes del tutor`)
  console.log(`⚙️  ${settings.length} configuraciones de plataforma`)

  process.exit(0)
}

seed().catch((e) => {
  console.error('❌ Error durante el seed:', e)
  process.exit(1)
})
