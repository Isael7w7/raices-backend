import * as dotenv from 'dotenv'
dotenv.config()

import * as fs from 'fs'
import * as path from 'path'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

const COLECCIONES = {
  perfiles: 'perfiles',
  perfilesExtendidos: 'perfilesExtendidos',
  dependientes: 'dependientes',
  favoritos: 'favoritos',
  resenas: 'resenas',
  publicaciones: 'publicaciones',
  comentarios: 'comentarios',
  meGustas: 'meGustas',
  grupos: 'grupos',
  miembrosGrupo: 'miembrosGrupo',
  mensajesDirectos: 'mensajesDirectos',
  notificaciones: 'notificaciones',
  postulaciones: 'postulaciones',
  instituciones: 'instituciones',
  vacantes: 'vacantes',
  configuraciones: 'configuraciones',
}

const FEATURES_POR_DEFECTO = {
  chat: true,
  postulaciones: true,
  comunidad: true,
  resenas: true,
  descubrimiento: true,
  favoritos: true,
}

// ── Detección de Service Account ──────────────────────────────
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

/** Genera un ID en formato Firebase (20 chars alfanuméricos) */
function firestoreId(): string {
  return db.collection('_').doc().id
}

async function limpiarColeccion(nombre: string) {
  const snap = await db.collection(nombre).get()
  if (snap.empty) return
  const lote = db.batch()
  for (const doc of snap.docs) lote.delete(doc.ref)
  await lote.commit()
}

/**
 * Inserta documentos en lote. Si el documento tiene un campo `id` explícito,
 * se usa ese; si no, Firestore genera el ID automáticamente (formato Firebase).
 * Siempre se guarda el `id` final en el documento.
 */
async function insertarLote(coleccion: string, documentos: Record<string, any>[]) {
  for (let i = 0; i < documentos.length; i += 500) {
    const lote = db.batch()
    const porcion = documentos.slice(i, i + 500)
    for (const datos of porcion) {
      // Si YA tiene un ID (pre-generado), lo usamos; si no, Firestore lo genera
      const ref = datos.id
        ? db.collection(coleccion).doc(datos.id)
        : db.collection(coleccion).doc()
      lote.set(ref, { ...datos, id: ref.id })
    }
    await lote.commit()
  }
}

// ── Cuentas de usuario ───────────────────────────────────────
const USUARIOS = [
  { email: 'admin@raices.mx',    password: 'Admin1234',   rol: 'admin',        nombreCompleto: 'Admin Raices',        ciudad: 'Merida', estado: 'Yucatan' },
  { email: 'tutor@raices.mx',    password: 'Tutor1234',   rol: 'tutor',        nombreCompleto: 'Tutor Raices',        ciudad: 'Merida', estado: 'Yucatan' },
  { email: 'usuario@raices.com', password: 'Usuario1234', rol: 'beneficiario', nombreCompleto: 'Usuario Raices',      ciudad: 'Merida', estado: 'Yucatan' },
]

/**
 * Crea o actualiza un usuario en Firebase Auth dejando que Firebase
 * genere el UID automáticamente (formato: xMMeLtvh0mU2xe6LuypeMRcPus82).
 */
async function asegurarUsuarioFirebase(usuario: { email: string; password: string; nombreCompleto: string }): Promise<string | null> {
  if (!auth) return null

  try {
    const existente = await auth.getUserByEmail(usuario.email)
    console.log(`  ⏭️  ${usuario.email} ya existe en Firebase Auth (uid: ${existente.uid})`)
    await auth.updateUser(existente.uid, { password: usuario.password })
    return existente.uid
  } catch (e: any) {
    if (e?.code === 'auth/user-not-found') {
      try {
        const creado = await auth.createUser({
          email: usuario.email,
          password: usuario.password,
          displayName: usuario.nombreCompleto,
        })
        console.log(`  ✅ ${usuario.email} creado en Firebase Auth (uid: ${creado.uid})`)
        return creado.uid
      } catch (err: any) {
        console.error(`  ❌ Error al crear ${usuario.email}: ${err.message}`)
        return null
      }
    }
    console.error(`  ❌ Error al obtener usuario ${usuario.email}: ${e.message}`)
    return null
  }
}

async function seed() {
  const t0 = Date.now()
  console.log('🌱 Sembrando datos demo en Firestore...\n')

  // ── Limpiar todas las colecciones ──────────────────────────────
  const coleccionesALimpiar = [
    COLECCIONES.perfiles, COLECCIONES.perfilesExtendidos, COLECCIONES.dependientes,
    COLECCIONES.favoritos, COLECCIONES.resenas, COLECCIONES.publicaciones, COLECCIONES.comentarios,
    COLECCIONES.meGustas, COLECCIONES.grupos, COLECCIONES.miembrosGrupo,
    COLECCIONES.mensajesDirectos, COLECCIONES.notificaciones, COLECCIONES.postulaciones,
    COLECCIONES.instituciones, COLECCIONES.vacantes,
    COLECCIONES.configuraciones,
    // Colecciones antiguas en inglés (eliminar residuos)
    'users', 'profiles', 'userProfiles', 'dependents',
    'favorites', 'reviews', 'posts', 'comments', 'likes',
    'groups', 'groupsMembers', 'messages', 'notifications',
    'applications', 'institutions', 'jobs', 'settings',
    'u_profiles', 'u_user_profiles', 'u_dependents', 'u_favorites',
    'u_reviews', 'u_posts', 'u_comments', 'u_post_likes',
    'u_groups', 'u_group_members', 'u_notifications',
    'u_job_applications', 'u_direct_messages',
    'p_institutions', 'p_institution_docs', 'p_jobs',
    's_settings', '_analytics', 'usuarios', 'tareas',
  ]
  for (const col of coleccionesALimpiar) await limpiarColeccion(col)
  console.log(`✨ ${coleccionesALimpiar.length} colecciones (incluyendo residuos en inglés) limpiadas\n`)

  const ahora = new Date().toISOString()

  // ── Sincronizar con Firebase Auth ──────────────────────────────
  // Mapa rol → uid obtenido de Auth (o generado por Firestore como fallback)
  const userIds: Record<string, string> = {}
  let authSincronizado = false

  for (const usuario of USUARIOS) {
    let uid: string = firestoreId() // fallback

    if (authDisponible) {
      console.log(`🔐 Sincronizando ${usuario.email} con Firebase Auth...`)
      const resultado = await asegurarUsuarioFirebase(usuario)
      if (resultado) {
        uid = resultado
        authSincronizado = true
        console.log(`   ✅ ${usuario.email} → uid: ${uid}`)
      } else {
        console.log(`   ⚠️  No se pudo sincronizar ${usuario.email}. Usando ID generado por Firestore...`)
      }
    } else {
      console.log(`   ⚠️  Usando ID generado por Firestore para ${usuario.email} (sin Auth)...`)
    }

    userIds[usuario.rol] = uid
  }

  if (!authDisponible) {
    console.log('⚠️  No se detectó Service Account (FIREBASE_SERVICE_ACCOUNT / GOOGLE_APPLICATION_CREDENTIALS)')
    console.log('   Firebase Auth no estará disponible. Usando IDs generados por Firestore.\n')
  }

  // IDs para cada rol
  const adminId = userIds['admin']
  const tutorId = userIds['tutor']
  const beneficiarioId = userIds['beneficiario']

  // ── Perfiles en Firestore ──────────────────────────────────────
  for (const usuario of USUARIOS) {
    const uid = userIds[usuario.rol]
    await db.collection(COLECCIONES.perfiles).doc(uid).set({
      id: uid,
      email: usuario.email,
      rol: usuario.rol,
      nombreCompleto: usuario.nombreCompleto,
      ciudad: usuario.ciudad,
      estado: usuario.estado,
      urlAvatar: null,
      activo: true,
      verificado: usuario.rol === 'admin',
      tutorId: null,
      features: { ...FEATURES_POR_DEFECTO },
      fechaCreacion: ahora,
    })
    console.log(`👤 Perfil creado: ${usuario.email} (${usuario.rol}) → ${uid}`)
  }

  // ── Instituciones ──────────────────────────────────────────────
  // Pre-generamos IDs para que las vacantes puedan referenciarlos
  const instIds = [
    firestoreId(), firestoreId(), firestoreId(), firestoreId(),
    firestoreId(), firestoreId(), firestoreId(), firestoreId(),
    firestoreId(), firestoreId(), firestoreId(), firestoreId(),
  ]
  const instituciones = [
    {
      id: instIds[0], nombre: 'Centro de Rehabilitacion DIF Merida',
      descripcion: 'Terapias fisicas, ocupacionales y de lenguaje para personas con discapacidad motriz y del neurodesarrollo.',
      categoria: 'funcional', subcategoria: 'terapias',
      direccion: 'Calle 50 x 65 #123', ciudad: 'Merida', estado: 'Yucatan',
      lat: 20.9674, lng: -89.6237,
      telefono: '9999990001', whatsapp: '9991110001', email: 'contacto@difmerida.mx',
      tiposDiscapacidad: JSON.stringify(['motriz', 'intelectual', 'tea']),
      edadMinima: 0, edadMaxima: 99,
      verificada: true, activa: true, calificacionPromedio: 4.5, cantidadCalificaciones: 12,
      tipoPlan: 'gratuito', creadoPor: adminId, fechaCreacion: ahora,
    },
    {
      id: instIds[1], nombre: 'CREE Yucatan - IMSS',
      descripcion: 'Centro de Rehabilitacion y Educacion Especial. Atencion medica y terapeutica integral del IMSS.',
      categoria: 'funcional', subcategoria: 'atencion_especializada',
      direccion: 'Av. Jacinto Canek S/N', ciudad: 'Merida', estado: 'Yucatan',
      lat: 20.9589, lng: -89.6412,
      telefono: '9999990004', whatsapp: null, email: 'cree.yucatan@imss.gob.mx',
      tiposDiscapacidad: JSON.stringify(['motriz', 'visual', 'auditiva', 'intelectual', 'multiple']),
      edadMinima: 0, edadMaxima: 99,
      verificada: true, activa: true, calificacionPromedio: 4.0, cantidadCalificaciones: 35,
      tipoPlan: 'gratuito', creadoPor: adminId, fechaCreacion: ahora,
    },
    {
      id: instIds[2], nombre: 'CEDIS - Estimulacion Temprana',
      descripcion: 'Estimulacion temprana y atencion a ninos con rezago en el desarrollo de 0 a 6 anios.',
      categoria: 'funcional', subcategoria: 'terapias',
      direccion: 'Av. Prolongacion Montejo 480', ciudad: 'Merida', estado: 'Yucatan',
      lat: 21.0098, lng: -89.6240,
      telefono: '9999990009', whatsapp: '9991110009', email: 'cedis.merida@salud.gob.mx',
      tiposDiscapacidad: JSON.stringify(['intelectual', 'multiple']),
      edadMinima: 0, edadMaxima: 6,
      verificada: true, activa: true, calificacionPromedio: 4.9, cantidadCalificaciones: 18,
      tipoPlan: 'gratuito', creadoPor: adminId, fechaCreacion: ahora,
    },
    {
      id: instIds[3], nombre: 'Clinica Voces - Fonoaudiologia',
      descripcion: 'Terapia de lenguaje para ninos y adultos con tartamudez, dislexia, TEA y afasia.',
      categoria: 'funcional', subcategoria: 'terapias',
      direccion: 'Calle 17 x 28 #240', ciudad: 'Merida', estado: 'Yucatan',
      lat: 20.9820, lng: -89.6174,
      telefono: '9999990011', whatsapp: '9991110011', email: 'info@clinicavoces.mx',
      tiposDiscapacidad: JSON.stringify(['tea', 'auditiva', 'intelectual']),
      edadMinima: 2, edadMaxima: 70,
      verificada: true, activa: true, calificacionPromedio: 4.5, cantidadCalificaciones: 22,
      tipoPlan: 'gratuito', creadoPor: adminId, fechaCreacion: ahora,
    },
    {
      id: instIds[4], nombre: 'Escuela de Educacion Especial No. 5',
      descripcion: 'Educacion especial y habilidades adaptativas para ninos y jovenes con discapacidad intelectual.',
      categoria: 'educativo', subcategoria: 'escuelas',
      direccion: 'Av. Itzaes 200', ciudad: 'Merida', estado: 'Yucatan',
      lat: 20.9712, lng: -89.6301,
      telefono: '9999990002', whatsapp: '9991110002', email: 'ee5.merida@seyy.gob.mx',
      tiposDiscapacidad: JSON.stringify(['intelectual', 'tea']),
      edadMinima: 3, edadMaxima: 22,
      verificada: true, activa: true, calificacionPromedio: 4.2, cantidadCalificaciones: 8,
      tipoPlan: 'gratuito', creadoPor: adminId, fechaCreacion: ahora,
    },
    {
      id: instIds[5], nombre: 'Colegio Futuros Brillantes',
      descripcion: 'Escuela privada con modelo de educacion inclusiva. Apoya TDAH, dislexia y TEA leve.',
      categoria: 'educativo', subcategoria: 'escuelas',
      direccion: 'Calle 13 x 22 #150 Altabrisa', ciudad: 'Merida', estado: 'Yucatan',
      lat: 21.0034, lng: -89.6185,
      telefono: '9999990006', whatsapp: '9991110006', email: 'admision@futurosbrillantes.mx',
      tiposDiscapacidad: JSON.stringify(['tea', 'intelectual']),
      edadMinima: 3, edadMaxima: 18,
      verificada: true, activa: true, calificacionPromedio: 4.6, cantidadCalificaciones: 9,
      tipoPlan: 'gratuito', creadoPor: adminId, fechaCreacion: ahora,
    },
    {
      id: instIds[6], nombre: 'Talleres Inclusivos Yucatan',
      descripcion: 'Capacitacion laboral para adultos con discapacidad: carpinteria, bisuteria, panaderia.',
      categoria: 'laboral', subcategoria: 'capacitacion',
      direccion: 'Calle 62 #400', ciudad: 'Merida', estado: 'Yucatan',
      lat: 20.9651, lng: -89.6325,
      telefono: '9999990005', whatsapp: '9991110005', email: 'talleres@inclusivos.mx',
      tiposDiscapacidad: JSON.stringify(['intelectual', 'motriz']),
      edadMinima: 18, edadMaxima: 60,
      verificada: true, activa: true, calificacionPromedio: 4.3, cantidadCalificaciones: 15,
      tipoPlan: 'gratuito', creadoPor: adminId, fechaCreacion: ahora,
    },
    {
      id: instIds[7], nombre: 'Tech Accesible MX',
      descripcion: 'Bolsa de trabajo especializada en vacantes para personas con discapacidad en sector tecnologico.',
      categoria: 'laboral', subcategoria: 'insercion_laboral',
      direccion: 'Remoto / Col. Poligono 108', ciudad: 'Merida', estado: 'Yucatan',
      lat: 20.9900, lng: -89.6150,
      telefono: '9991110010', whatsapp: '9991110010', email: 'empleo@techaccesible.mx',
      tiposDiscapacidad: JSON.stringify(['visual', 'auditiva', 'motriz']),
      edadMinima: 18, edadMaxima: 55,
      verificada: true, activa: true, calificacionPromedio: 4.4, cantidadCalificaciones: 7,
      tipoPlan: 'gratuito', creadoPor: adminId, fechaCreacion: ahora,
    },
    {
      id: instIds[8], nombre: 'Fundacion Alas y Raices Merida',
      descripcion: 'Apoyo integral a personas con autismo: terapias ABA, integracion social y orientacion familiar.',
      categoria: 'social', subcategoria: 'centros_comunitarios',
      direccion: 'Calle 20 #300 Col. Garcia Gineres', ciudad: 'Merida', estado: 'Yucatan',
      lat: 20.9801, lng: -89.6198,
      telefono: '9999990003', whatsapp: '9991110003', email: 'info@alasyraices.mx',
      tiposDiscapacidad: JSON.stringify(['tea']),
      edadMinima: 2, edadMaxima: 30,
      verificada: true, activa: true, calificacionPromedio: 4.8, cantidadCalificaciones: 20,
      tipoPlan: 'gratuito', creadoPor: adminId, fechaCreacion: ahora,
    },
    {
      id: instIds[9], nombre: 'Grupo de Apoyo TEA Familias',
      descripcion: 'Red de familias con hijos con autismo. Reuniones quincenales, asesorias y apoyo emocional.',
      categoria: 'social', subcategoria: 'actividades',
      direccion: 'Sede rotativa', ciudad: 'Merida', estado: 'Yucatan',
      lat: 20.9740, lng: -89.6220,
      telefono: '9991110007', whatsapp: '9991110007', email: 'contacto@teafamilias.mx',
      tiposDiscapacidad: JSON.stringify(['tea']),
      edadMinima: 0, edadMaxima: 99,
      verificada: false, activa: true, calificacionPromedio: 4.7, cantidadCalificaciones: 6,
      tipoPlan: 'gratuito', creadoPor: adminId, fechaCreacion: ahora,
    },
    {
      id: instIds[10], nombre: 'ASPADEM',
      descripcion: 'Talleres productivos, vivienda asistida y programa de vida independiente para discapacidad mental.',
      categoria: 'social', subcategoria: 'centros_comunitarios',
      direccion: 'Calle 29A x 46 #199', ciudad: 'Merida', estado: 'Yucatan',
      lat: 20.9703, lng: -89.6289,
      telefono: '9999990008', whatsapp: '9991110008', email: 'info@aspadem.mx',
      tiposDiscapacidad: JSON.stringify(['intelectual', 'multiple']),
      edadMinima: 18, edadMaxima: 99,
      verificada: true, activa: true, calificacionPromedio: 4.1, cantidadCalificaciones: 11,
      tipoPlan: 'gratuito', creadoPor: adminId, fechaCreacion: ahora,
    },
    {
      id: instIds[11], nombre: 'Atletismo Paralimpico Yucatan',
      descripcion: 'Entrenamiento deportivo adaptado para personas con discapacidad motriz.',
      categoria: 'social', subcategoria: 'actividades',
      direccion: 'UADY Estadio Carlos Iturralde', ciudad: 'Merida', estado: 'Yucatan',
      lat: 20.9854, lng: -89.6278,
      telefono: '9999990012', whatsapp: '9991110012', email: 'deporte@paralimpico.mx',
      tiposDiscapacidad: JSON.stringify(['motriz']),
      edadMinima: 8, edadMaxima: 50,
      verificada: true, activa: true, calificacionPromedio: 4.7, cantidadCalificaciones: 14,
      tipoPlan: 'gratuito', creadoPor: adminId, fechaCreacion: ahora,
    },
  ]

  await insertarLote(COLECCIONES.instituciones, instituciones)
  console.log(`🏢 ${instituciones.length} instituciones insertadas`)

  // ── Vacantes (referencian instituciones por sus IDs pre-generados) ─
  const vacantesDatos = [
    {
      institucionId: instIds[6], titulo: 'Carpintero/a Artesanal',
      descripcion: 'Taller de carpinteria artesanal para crear muebles y objetos decorativos. Capacitacion incluida.',
      requisitos: 'Interes en manualidades. No se requiere experiencia previa.',
      modalidad: 'presencial', horario: 'Lun-Vie 8:00-14:00',
      rangoSalario: '$4,000 - $6,000 MXN', ciudad: 'Merida', estado: 'Yucatan',
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(['intelectual', 'motriz']),
      activa: true, fechaCreacion: ahora,
    },
    {
      institucionId: instIds[7], titulo: 'Asistente de Soporte Tecnico',
      descripcion: 'Soporte tecnico remoto para usuarios con discapacidad visual. Capacitacion en lectores de pantalla.',
      requisitos: 'Conocimientos basicos de computacion. Disponibilidad de equipo propio.',
      modalidad: 'remoto', horario: 'Lun-Vie 9:00-17:00',
      rangoSalario: '$8,000 - $12,000 MXN', ciudad: 'Merida', estado: 'Yucatan',
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(['visual', 'auditiva', 'motriz']),
      activa: true, fechaCreacion: ahora,
    },
    {
      institucionId: instIds[7], titulo: 'Desarrollador/a Frontend Junior',
      descripcion: 'Desarrollo de interfaces web accesibles. Trabajo remoto con horario flexible.',
      requisitos: 'Conocimiento de HTML, CSS y JavaScript. Portafolio o proyectos personales.',
      modalidad: 'remoto', horario: 'Flexible',
      rangoSalario: '$12,000 - $18,000 MXN', ciudad: 'Merida', estado: 'Yucatan',
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(['visual', 'auditiva', 'motriz']),
      activa: true, fechaCreacion: ahora,
    },
    {
      institucionId: instIds[9], titulo: 'Asistente Terapeutico',
      descripcion: 'Apoyo en sesiones de terapia ABA para ninos con autismo. Se proporciona capacitacion.',
      requisitos: 'Paciencia, empatia y disposicion para trabajar con ninos. Estudiantes de psicologia o terapia son bienvenidos.',
      modalidad: 'presencial', horario: 'Lun-Vie 8:00-15:00',
      rangoSalario: '$6,000 - $9,000 MXN', ciudad: 'Merida', estado: 'Yucatan',
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(['tea']),
      activa: true, fechaCreacion: ahora,
    },
    {
      institucionId: instIds[11], titulo: 'Auxiliar de Cocina',
      descripcion: 'Apoyo en cocina comunitaria para talleres de capacitacion laboral.',
      requisitos: 'Interes en gastronomia. Entorno adaptado y supervisado.',
      modalidad: 'presencial', horario: 'Lun-Vie 7:00-13:00',
      rangoSalario: '$4,500 - $6,500 MXN', ciudad: 'Merida', estado: 'Yucatan',
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(['intelectual', 'multiple']),
      activa: true, fechaCreacion: ahora,
    },
    {
      institucionId: instIds[8], titulo: 'Educador/a de Estimulacion Temprana',
      descripcion: 'Imparticion de sesiones de estimulacion temprana para ninos de 0 a 6 anios con rezago en desarrollo.',
      requisitos: 'Licenciatura en educacion especial, psicologia o afines. Experiencia minima de 1 anio.',
      modalidad: 'presencial', horario: 'Lun-Vie 8:00-14:00',
      rangoSalario: '$9,000 - $13,000 MXN', ciudad: 'Merida', estado: 'Yucatan',
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(['intelectual', 'multiple']),
      activa: true, fechaCreacion: ahora,
    },
    {
      institucionId: instIds[0], titulo: 'Terapeuta Ocupacional',
      descripcion: 'Atencion terapeutica ocupacional para pacientes con discapacidad motriz y neurodesarrollo.',
      requisitos: 'Licenciatura en Terapia Ocupacional. Experiencia en centros de rehabilitacion deseable.',
      modalidad: 'presencial', horario: 'Lun-Vie 7:00-15:00',
      rangoSalario: '$12,000 - $16,000 MXN', ciudad: 'Merida', estado: 'Yucatan',
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(['motriz', 'intelectual']),
      activa: true, fechaCreacion: ahora,
    },
  ]

  await insertarLote(COLECCIONES.vacantes, vacantesDatos)
  console.log(`💼 ${vacantesDatos.length} vacantes de empleo creadas`)

  // ── Grupos de comunidad ────────────────────────────────────────
  const grupos = [
    {
      nombre: 'Feed general',
      descripcion: 'Espacio abierto para todos los miembros de Raices.',
      categoria: 'social', tiposDiscapacidad: JSON.stringify([]),
      esPublico: true, cantidadMiembros: 0, creadoPor: adminId, fechaCreacion: ahora,
    },
    {
      nombre: 'TEA - Primera infancia',
      descripcion: 'Familias con ninos con autismo de 0 a 6 anios. Intercambio de experiencias y recursos.',
      categoria: 'social', tiposDiscapacidad: JSON.stringify(['tea']),
      esPublico: true, cantidadMiembros: 0, creadoPor: adminId, fechaCreacion: ahora,
    },
    {
      nombre: 'Adultos con TDAH',
      descripcion: 'Estrategias, apoyo y experiencias de vida para adultos diagnosticados con TDAH.',
      categoria: 'social', tiposDiscapacidad: JSON.stringify(['intelectual']),
      esPublico: true, cantidadMiembros: 0, creadoPor: adminId, fechaCreacion: ahora,
    },
    {
      nombre: 'Inclusion laboral',
      descripcion: 'Empleos, capacitacion y experiencias laborales inclusivas. Comparte ofertas y oportunidades.',
      categoria: 'laboral', tiposDiscapacidad: JSON.stringify([]),
      esPublico: true, cantidadMiembros: 0, creadoPor: adminId, fechaCreacion: ahora,
    },
    {
      nombre: 'Tramites y derechos',
      descripcion: 'Guia sobre derechos, IMSS, pensiones, credencial de discapacidad y tramites gubernamentales.',
      categoria: 'social', tiposDiscapacidad: JSON.stringify([]),
      esPublico: true, cantidadMiembros: 0, creadoPor: adminId, fechaCreacion: ahora,
    },
  ]

  await insertarLote(COLECCIONES.grupos, grupos)
  console.log(`👥 ${grupos.length} grupos de comunidad creados`)

  // ── Obtener IDs generados automáticamente ───────────────────────
  const gruposSnap = await db.collection(COLECCIONES.grupos).get()
  const grupoIds = gruposSnap.docs.map(doc => doc.id)
  const vacantesSnap = await db.collection(COLECCIONES.vacantes).get()
  const vacanteIds = vacantesSnap.docs.map(doc => doc.id)

  // ── Miembros de grupo ───────────────────────────────────────────
  const miembrosGrupo = grupoIds.map(grupoId => ({
    id: firestoreId(),
    grupoId,
    usuarioId: adminId,
    rol: 'admin',
    fechaUnificacion: ahora,
  }))
  await insertarLote(COLECCIONES.miembrosGrupo, miembrosGrupo)
  console.log(`👤 ${miembrosGrupo.length} miembros de grupo asignados`)

  // ── Publicaciones ───────────────────────────────────────────────
  const pubIds = [firestoreId(), firestoreId(), firestoreId()]
  const publicaciones = [
    {
      id: pubIds[0],
      usuarioId: adminId,
      grupoId: grupoIds[0],
      contenido: 'Bienvenidos a Raices para Florecer! Este es un espacio para compartir experiencias, recursos y apoyarnos mutuamente.',
      cantidadMeGusta: 1,
      cantidadComentarios: 1,
      activa: true,
      fechaCreacion: ahora,
    },
    {
      id: pubIds[1],
      usuarioId: adminId,
      grupoId: grupoIds[1],
      contenido: 'Comparto recursos sobre terapias ABA para ninos con TEA en la primera infancia. Alguien tiene recomendaciones de centros en Merida?',
      cantidadMeGusta: 1,
      cantidadComentarios: 1,
      activa: true,
      fechaCreacion: ahora,
    },
    {
      id: pubIds[2],
      usuarioId: adminId,
      grupoId: grupoIds[3],
      contenido: 'Recordatorio: El proximo jueves hay feria de empleo inclusivo en el Centro de Convenciones Siglo XXI. No falten!',
      cantidadMeGusta: 1,
      cantidadComentarios: 1,
      activa: true,
      fechaCreacion: ahora,
    },
  ]
  await insertarLote(COLECCIONES.publicaciones, publicaciones)
  console.log(`📝 ${publicaciones.length} publicaciones creadas`)

  // ── Comentarios ─────────────────────────────────────────────────
  const comentarios = [
    {
      id: firestoreId(),
      publicacionId: pubIds[0],
      usuarioId: adminId,
      contenido: 'Que gran iniciativa! Espero que este espacio sea de gran ayuda para todos.',
      fechaCreacion: ahora,
    },
    {
      id: firestoreId(),
      publicacionId: pubIds[1],
      usuarioId: adminId,
      contenido: 'Yo conozco el CRI Merida, tienen buen programa de atencion temprana. Recomiendo agendar una cita de valoracion.',
      fechaCreacion: ahora,
    },
  ]
  await insertarLote(COLECCIONES.comentarios, comentarios)
  console.log(`💬 ${comentarios.length} comentarios agregados`)

  // ── Me gustas ───────────────────────────────────────────────────
  const meGustas = [
    {
      id: firestoreId(),
      publicacionId: pubIds[0],
      usuarioId: adminId,
      fechaCreacion: ahora,
    },
  ]
  await insertarLote(COLECCIONES.meGustas, meGustas)
  console.log(`❤️ ${meGustas.length} me gusta registrado`)

  // ── Resenas ─────────────────────────────────────────────────────
  const resenas = [
    {
      id: firestoreId(),
      institucionId: instIds[0],
      usuarioId: adminId,
      calificacion: 5,
      comentario: 'Excelente centro de rehabilitacion. El personal es muy atento y las instalaciones estan bien equipadas. Totalmente recomendado.',
      verificada: true,
      fechaCreacion: ahora,
    },
    {
      id: firestoreId(),
      institucionId: instIds[0],
      usuarioId: adminId,
      calificacion: 5,
      comentario: 'Ofrecen terapias de lenguaje, fisica y ocupacional. Mi experiencia ha sido muy positiva.',
      verificada: true,
      fechaCreacion: ahora,
    },
    {
      id: firestoreId(),
      institucionId: instIds[1],
      usuarioId: adminId,
      calificacion: 5,
      comentario: 'Atencion integral del IMSS. Cuentan con especialistas en rehabilitacion y equipo multidisciplinario.',
      verificada: true,
      fechaCreacion: ahora,
    },
  ]
  await insertarLote(COLECCIONES.resenas, resenas)
  console.log(`⭐ ${resenas.length} resenas registradas`)

  // ── Favoritos ───────────────────────────────────────────────────
  const favoritos = [
    {
      id: firestoreId(),
      usuarioId: adminId,
      institucionId: instIds[0],
      fechaCreacion: ahora,
    },
    {
      id: firestoreId(),
      usuarioId: adminId,
      institucionId: instIds[2],
      fechaCreacion: ahora,
    },
  ]
  await insertarLote(COLECCIONES.favoritos, favoritos)
  console.log(`⭐ ${favoritos.length} favoritos agregados`)

  // ── Postulaciones ───────────────────────────────────────────────
  const postulaciones = [
    {
      id: firestoreId(),
      vacanteId: vacanteIds[0],
      usuarioId: adminId,
      estado: 'pendiente',
      mensaje: 'Me interesa mucho esta oportunidad. Tengo experiencia en carpinteria artesanal y muchas ganas de aprender.',
      fechaCreacion: ahora,
    },
    {
      id: firestoreId(),
      vacanteId: vacanteIds[1],
      usuarioId: adminId,
      estado: 'pendiente',
      mensaje: 'Cuento con conocimientos basicos de computacion y estoy interesado en desarrollar habilidades en soporte tecnico.',
      fechaCreacion: ahora,
    },
  ]
  await insertarLote(COLECCIONES.postulaciones, postulaciones)
  console.log(`📋 ${postulaciones.length} postulaciones registradas`)

  // ── Mensajes Directos ───────────────────────────────────────────
  const mensajesDirectos = [
    {
      id: firestoreId(),
      remitenteId: adminId,
      destinatarioId: adminId,
      contenido: 'Bienvenido a Raices para Florecer! Este es tu panel de administracion. Explora las secciones para gestionar la plataforma.',
      leido: true,
      fechaCreacion: ahora,
    },
  ]
  await insertarLote(COLECCIONES.mensajesDirectos, mensajesDirectos)
  console.log(`✉️ ${mensajesDirectos.length} mensaje directo creado`)

  // ── Notificaciones ──────────────────────────────────────────────
  const notificaciones = [
    {
      id: firestoreId(),
      usuarioId: adminId,
      titulo: 'Bienvenido a Raices',
      mensaje: 'Gracias por ser parte de Raices para Florecer. Revisa las nuevas instituciones registradas en la plataforma.',
      leida: false,
      tipo: 'sistema',
      fechaCreacion: ahora,
    },
    {
      id: firestoreId(),
      usuarioId: adminId,
      titulo: 'Nueva institucion pendiente',
      mensaje: 'Hay instituciones que requieren revision y aprobacion. Accede al panel de administracion para gestionarlas.',
      leida: false,
      tipo: 'sistema',
      fechaCreacion: ahora,
    },
  ]
  await insertarLote(COLECCIONES.notificaciones, notificaciones)
  console.log(`🔔 ${notificaciones.length} notificaciones creadas`)

  // ── Configuraciones de plataforma ──────────────────────────────
  const configuraciones = [
    { clave: 'nombrePlataforma', valor: 'Raices para Florecer', fechaActualizacion: ahora },
    { clave: 'emailSoporte', valor: 'soporte@raices.mx', fechaActualizacion: ahora },
    { clave: 'permitirRegistro', valor: 'true', fechaActualizacion: ahora },
    { clave: 'aprobacionInstitucionRequerida', valor: 'true', fechaActualizacion: ahora },
    { clave: 'iaHabilitada', valor: 'true', fechaActualizacion: ahora },
    { clave: 'modoMantenimiento', valor: 'false', fechaActualizacion: ahora },
    { clave: 'maxResenasPorUsuario', valor: '10', fechaActualizacion: ahora },
    { clave: 'ciudadPorDefecto', valor: 'Merida', fechaActualizacion: ahora },
  ]

  await insertarLote(COLECCIONES.configuraciones, configuraciones)
  console.log(`⚙️  ${configuraciones.length} configuraciones de plataforma creadas`)

  // ── Resumen final ──────────────────────────────────────────────
  const tiempoTotal = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\n✅ Seed completo en ${tiempoTotal}s`)
  console.log('')
  console.log(`👤 ${USUARIOS.length} cuentas de usuario:`)
  for (const usuario of USUARIOS) {
    const uid = userIds[usuario.rol]
    const sincro = authDisponible ? '(sincronizado con Firebase Auth)' : '(generado por Firestore, sin Auth)'
    console.log(`   ${usuario.email} (${usuario.rol})  password: ${usuario.password}  → UID: ${uid} ${sincro}`)
  }
  console.log('')
  console.log(`🏢 ${instituciones.length} instituciones de Merida`)
  console.log(`💼 ${vacantesDatos.length} vacantes de empleo inclusivo`)
  console.log(`👥 ${grupos.length} grupos de comunidad`)
  console.log(`👤 ${miembrosGrupo.length} miembros de grupo`)
  console.log(`📝 ${publicaciones.length} publicaciones`)
  console.log(`💬 ${comentarios.length} comentarios`)
  console.log(`❤️ ${meGustas.length} me gusta`)
  console.log(`⭐ ${resenas.length} resenas`)
  console.log(`⭐ ${favoritos.length} favoritos`)
  console.log(`📋 ${postulaciones.length} postulaciones`)
  console.log(`✉️ ${mensajesDirectos.length} mensaje directo`)
  console.log(`🔔 ${notificaciones.length} notificaciones`)
  console.log(`⚙️  ${configuraciones.length} configuraciones de plataforma`)
  // ── Nota: todos los IDs ahora son generados exclusivamente por Firestore ──
  console.log('\n🔑 Todos los IDs de documentos fueron generados por Firestore (formato: xMMeLtvh0mU2xe6LuypeMRcPus82)')

  process.exit(0)
}

seed().catch((e) => {
  console.error('❌ Error durante el seed:', e)
  process.exit(1)
})
