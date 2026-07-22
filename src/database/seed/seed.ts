import * as dotenv from 'dotenv'
dotenv.config()

import * as fs from 'fs'
import * as path from 'path'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { v4 as uuid } from 'uuid'

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
    rol: 'admin',
    nombreCompleto: 'Admin Raices',
    ciudad: 'Merida',
    estado: 'Yucatan',
    uidEstatico: UIDS_ESTATICOS.admin,
  },
  {
    email: 'demo@raices.mx',
    password: 'Demo1234',
    rol: 'user',
    nombreCompleto: 'Luis Hernandez',
    ciudad: 'Merida',
    estado: 'Yucatan',
    uidEstatico: UIDS_ESTATICOS.user,
  },
  {
    email: 'tutor@raices.mx',
    password: 'Tutor1234',
    rol: 'tutor',
    nombreCompleto: 'Ana Garcia',
    ciudad: 'Merida',
    estado: 'Yucatan',
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
          displayName: usuarioDemo.nombreCompleto,
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
    COLECCIONES.perfiles, COLECCIONES.perfilesExtendidos, COLECCIONES.dependientes,
    COLECCIONES.favoritos, COLECCIONES.resenas, COLECCIONES.publicaciones, COLECCIONES.comentarios,
    COLECCIONES.meGustas, COLECCIONES.grupos, COLECCIONES.miembrosGrupo,
    COLECCIONES.mensajesDirectos, COLECCIONES.notificaciones, COLECCIONES.postulaciones,
    COLECCIONES.instituciones, COLECCIONES.vacantes,
    COLECCIONES.configuraciones,
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

  await insertarLote(COLECCIONES.perfiles, [
    {
      id: adminId, email: 'admin@raices.mx', rol: 'admin',
      nombreCompleto: 'Admin Raices', ciudad: 'Merida', estado: 'Yucatan',
      urlAvatar: null, activo: true, verificado: true, fechaCreacion: ahora,
    },
    {
      id: demoId, email: 'demo@raices.mx', rol: 'user',
      nombreCompleto: 'Luis Hernandez', ciudad: 'Merida', estado: 'Yucatan',
      urlAvatar: null, activo: true, verificado: true, fechaCreacion: ahora,
    },
    {
      id: tutorId, email: 'tutor@raices.mx', rol: 'tutor',
      nombreCompleto: 'Ana Garcia', ciudad: 'Merida', estado: 'Yucatan',
      urlAvatar: null, activo: true, verificado: true, fechaCreacion: ahora,
    },
  ])
  console.log('👤 3 usuarios demo creados en Firestore')

  await insertarLote(COLECCIONES.perfilesExtendidos, [
    {
      id: uuid(), usuarioId: demoId,
      tiposDiscapacidad: JSON.stringify(['tea']),
      severidadDiscapacidad: null,
      modosComunicacion: JSON.stringify([]),
      necesidadesMovilidad: JSON.stringify([]),
      accesoTecnologia: JSON.stringify([]),
      zonasPreferidas: JSON.stringify(['Centro', 'Norte']),
      necesidades: JSON.stringify(['socializacion', 'aprendizaje']),
      metasActuales: JSON.stringify(['escuela', 'actividades_sociales']),
      areasApoyo: JSON.stringify(['integracion_social']),
      historialEducacion: JSON.stringify({ escolarizado: true, tipo: 'regular', nivel: 'secundaria' }),
      historialTerapia: JSON.stringify({ tomado: true, tipos: ['lenguaje'] }),
      etapaVida: 'adolescencia',
      preocupacionesActuales: 'Dificultades de socializacion en la escuela',
      nivelApoyo: 'medio',
    },
    {
      id: uuid(), usuarioId: tutorId,
      tiposDiscapacidad: JSON.stringify([]),
      severidadDiscapacidad: null,
      modosComunicacion: JSON.stringify([]),
      necesidadesMovilidad: JSON.stringify([]),
      accesoTecnologia: JSON.stringify([]),
      zonasPreferidas: JSON.stringify(['Sur', 'Oriente']),
      necesidades: JSON.stringify(['informacion', 'acompanamiento']),
      metasActuales: JSON.stringify(['encontrar_terapia_para_hijo', 'integracion_laboral']),
      areasApoyo: JSON.stringify(['orientacion_familiar']),
      historialEducacion: JSON.stringify({ escolarizado: true, tipo: 'regular', nivel: 'universidad' }),
      historialTerapia: JSON.stringify({ tomado: false, tipos: [] }),
      etapaVida: 'adulto',
      preocupacionesActuales: 'Buscar opciones de terapia para mi hijo',
      nivelApoyo: 'bajo',
    },
  ])
  console.log('📋 2 perfiles de necesidades creados')

  await insertarLote(COLECCIONES.dependientes, [
    {
      id: uuid(), tutorId: tutorId,
      nombreCompleto: 'Mateo Garcia',
      parentesco: 'hijo',
      datosPerfil: JSON.stringify({
        tiposDiscapacidad: ['tea'], rangoEdad: '6-12', etapaVida: 'infancia',
        notas: 'Diagnostico TEA nivel 1. En terapia de lenguaje desde los 4 anios.',
      }),
      fechaCreacion: ahora,
    },
    {
      id: uuid(), tutorId: tutorId,
      nombreCompleto: 'Sofia Garcia',
      parentesco: 'hija',
      datosPerfil: JSON.stringify({
        tiposDiscapacidad: ['intelectual'], rangoEdad: '3-5', etapaVida: 'primera_infancia',
        notas: 'Rezago en el desarrollo del lenguaje. En estimulacion temprana.',
      }),
      fechaCreacion: ahora,
    },
  ])
  console.log('👨‍👩‍👧 2 dependientes creados para el tutor')

  const instituciones = [
    {
      id: uuid(), nombre: 'Centro de Rehabilitacion DIF Merida',
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
      id: uuid(), nombre: 'CREE Yucatan - IMSS',
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
      id: uuid(), nombre: 'CEDIS - Estimulacion Temprana',
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
      id: uuid(), nombre: 'Clinica Voces - Fonoaudiologia',
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
      id: uuid(), nombre: 'Escuela de Educacion Especial No. 5',
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
      id: uuid(), nombre: 'Colegio Futuros Brillantes',
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
      id: uuid(), nombre: 'Talleres Inclusivos Yucatan',
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
      id: uuid(), nombre: 'Tech Accesible MX',
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
      id: uuid(), nombre: 'Fundacion Alas y Raices Merida',
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
      id: uuid(), nombre: 'Grupo de Apoyo TEA Familias',
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
      id: uuid(), nombre: 'ASPADEM',
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
      id: uuid(), nombre: 'Atletismo Paralimpico Yucatan',
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

  const vacantes = [
    {
      id: uuid(), institucionId: instituciones[6].id,
      titulo: 'Carpintero/a Artesanal',
      descripcion: 'Taller de carpinteria artesanal para crear muebles y objetos decorativos. Capacitacion incluida.',
      requisitos: 'Interes en manualidades. No se requiere experiencia previa.',
      modalidad: 'presencial', horario: 'Lun-Vie 8:00-14:00',
      rangoSalario: '$4,000 - $6,000 MXN', ciudad: 'Merida', estado: 'Yucatan',
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(['intelectual', 'motriz']),
      activa: true, fechaCreacion: ahora,
    },
    {
      id: uuid(), institucionId: instituciones[7].id,
      titulo: 'Asistente de Soporte Tecnico',
      descripcion: 'Soporte tecnico remoto para usuarios con discapacidad visual. Capacitacion en lectores de pantalla.',
      requisitos: 'Conocimientos basicos de computacion. Disponibilidad de equipo propio.',
      modalidad: 'remoto', horario: 'Lun-Vie 9:00-17:00',
      rangoSalario: '$8,000 - $12,000 MXN', ciudad: 'Merida', estado: 'Yucatan',
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(['visual', 'auditiva', 'motriz']),
      activa: true, fechaCreacion: ahora,
    },
    {
      id: uuid(), institucionId: instituciones[7].id,
      titulo: 'Desarrollador/a Frontend Junior',
      descripcion: 'Desarrollo de interfaces web accesibles. Trabajo remoto con horario flexible.',
      requisitos: 'Conocimiento de HTML, CSS y JavaScript. Portafolio o proyectos personales.',
      modalidad: 'remoto', horario: 'Flexible',
      rangoSalario: '$12,000 - $18,000 MXN', ciudad: 'Merida', estado: 'Yucatan',
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(['visual', 'auditiva', 'motriz']),
      activa: true, fechaCreacion: ahora,
    },
    {
      id: uuid(), institucionId: instituciones[9].id,
      titulo: 'Asistente Terapeutico',
      descripcion: 'Apoyo en sesiones de terapia ABA para ninos con autismo. Se proporciona capacitacion.',
      requisitos: 'Paciencia, empatia y disposicion para trabajar con ninos. Estudiantes de psicologia o terapia son bienvenidos.',
      modalidad: 'presencial', horario: 'Lun-Vie 8:00-15:00',
      rangoSalario: '$6,000 - $9,000 MXN', ciudad: 'Merida', estado: 'Yucatan',
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(['tea']),
      activa: true, fechaCreacion: ahora,
    },
    {
      id: uuid(), institucionId: instituciones[11].id,
      titulo: 'Auxiliar de Cocina',
      descripcion: 'Apoyo en cocina comunitaria para talleres de capacitacion laboral.',
      requisitos: 'Interes en gastronomia. Entorno adaptado y supervisado.',
      modalidad: 'presencial', horario: 'Lun-Vie 7:00-13:00',
      rangoSalario: '$4,500 - $6,500 MXN', ciudad: 'Merida', estado: 'Yucatan',
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(['intelectual', 'multiple']),
      activa: true, fechaCreacion: ahora,
    },
    {
      id: uuid(), institucionId: instituciones[8].id,
      titulo: 'Educador/a de Estimulacion Temprana',
      descripcion: 'Imparticion de sesiones de estimulacion temprana para ninos de 0 a 6 anios con rezago en desarrollo.',
      requisitos: 'Licenciatura en educacion especial, psicologia o afines. Experiencia minima de 1 anio.',
      modalidad: 'presencial', horario: 'Lun-Vie 8:00-14:00',
      rangoSalario: '$9,000 - $13,000 MXN', ciudad: 'Merida', estado: 'Yucatan',
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(['intelectual', 'multiple']),
      activa: true, fechaCreacion: ahora,
    },
    {
      id: uuid(), institucionId: instituciones[0].id,
      titulo: 'Terapeuta Ocupacional',
      descripcion: 'Atencion terapeutica ocupacional para pacientes con discapacidad motriz y neurodesarrollo.',
      requisitos: 'Licenciatura en Terapia Ocupacional. Experiencia en centros de rehabilitacion deseable.',
      modalidad: 'presencial', horario: 'Lun-Vie 7:00-15:00',
      rangoSalario: '$12,000 - $16,000 MXN', ciudad: 'Merida', estado: 'Yucatan',
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(['motriz', 'intelectual']),
      activa: true, fechaCreacion: ahora,
    },
  ]

  await insertarLote(COLECCIONES.vacantes, vacantes)
  console.log(`💼 ${vacantes.length} vacantes de empleo creadas`)

  const grupos = [
    {
      id: uuid(), nombre: 'Feed general',
      descripcion: 'Espacio abierto para todos los miembros de Raices.',
      categoria: 'social', tiposDiscapacidad: JSON.stringify([]),
      esPublico: true, cantidadMiembros: 0, creadoPor: adminId, fechaCreacion: ahora,
    },
    {
      id: uuid(), nombre: 'TEA - Primera infancia',
      descripcion: 'Familias con ninos con autismo de 0 a 6 anios. Intercambio de experiencias y recursos.',
      categoria: 'social', tiposDiscapacidad: JSON.stringify(['tea']),
      esPublico: true, cantidadMiembros: 0, creadoPor: adminId, fechaCreacion: ahora,
    },
    {
      id: uuid(), nombre: 'Adultos con TDAH',
      descripcion: 'Estrategias, apoyo y experiencias de vida para adultos diagnosticados con TDAH.',
      categoria: 'social', tiposDiscapacidad: JSON.stringify(['intelectual']),
      esPublico: true, cantidadMiembros: 0, creadoPor: adminId, fechaCreacion: ahora,
    },
    {
      id: uuid(), nombre: 'Inclusion laboral',
      descripcion: 'Empleos, capacitacion y experiencias laborales inclusivas. Comparte ofertas y oportunidades.',
      categoria: 'laboral', tiposDiscapacidad: JSON.stringify([]),
      esPublico: true, cantidadMiembros: 0, creadoPor: adminId, fechaCreacion: ahora,
    },
    {
      id: uuid(), nombre: 'Tramites y derechos',
      descripcion: 'Guia sobre derechos, IMSS, pensiones, credencial de discapacidad y tramites gubernamentales.',
      categoria: 'social', tiposDiscapacidad: JSON.stringify([]),
      esPublico: true, cantidadMiembros: 0, creadoPor: adminId, fechaCreacion: ahora,
    },
  ]

  await insertarLote(COLECCIONES.grupos, grupos)
  console.log(`👥 ${grupos.length} grupos de comunidad creados`)

  const publicaciones = [
    {
      id: uuid(), grupoId: grupos[0].id, autorId: tutorId,
      contenido: 'Hola a todos! Recien nos unimos a Raices y ya encontramos 3 opciones de terapia cerca de casa. Que increible plataforma!',
      cantidadMeGustas: 5, fechaCreacion: ahora,
    },
    {
      id: uuid(), grupoId: grupos[0].id, autorId: demoId,
      contenido: 'Alguien tiene experiencia con el CREE Yucatan? Queremos llevar a mi hermano para evaluacion inicial.',
      cantidadMeGustas: 2, fechaCreacion: ahora,
    },
    {
      id: uuid(), grupoId: grupos[3].id, autorId: adminId,
      contenido: 'Tech Accesible MX publico 2 nuevas vacantes remotas para desarrolladores front-end. Revisen la seccion de Empleo!',
      cantidadMeGustas: 8, fechaCreacion: ahora,
    },
    {
      id: uuid(), grupoId: grupos[1].id, autorId: tutorId,
      contenido: 'Nuestro hijo fue diagnosticado TEA nivel 1 a los 5 anios. Hoy tiene 8 y va en 3er grado. La terapia ABA le cambio la vida. Si necesitan orientacion, estoy para ayudar.',
      cantidadMeGustas: 12, fechaCreacion: ahora,
    },
    {
      id: uuid(), grupoId: grupos[4].id, autorId: demoId,
      contenido: 'Alguien sabe cuanto tarda en llegar la credencial de discapacidad por CONADIS? Ya hice el tramite hace 3 semanas.',
      cantidadMeGustas: 3, fechaCreacion: ahora,
    },
  ]

  await insertarLote(COLECCIONES.publicaciones, publicaciones)
  console.log(`📝 ${publicaciones.length} posts de comunidad creados`)

  const configuraciones = [
    { id: uuid(), clave: 'nombrePlataforma', valor: 'Raices para Florecer', fechaActualizacion: ahora },
    { id: uuid(), clave: 'emailSoporte', valor: 'soporte@raices.mx', fechaActualizacion: ahora },
    { id: uuid(), clave: 'permitirRegistro', valor: 'true', fechaActualizacion: ahora },
    { id: uuid(), clave: 'aprobacionInstitucionRequerida', valor: 'true', fechaActualizacion: ahora },
    { id: uuid(), clave: 'iaHabilitada', valor: 'true', fechaActualizacion: ahora },
    { id: uuid(), clave: 'modoMantenimiento', valor: 'false', fechaActualizacion: ahora },
    { id: uuid(), clave: 'maxResenasPorUsuario', valor: '10', fechaActualizacion: ahora },
    { id: uuid(), clave: 'ciudadPorDefecto', valor: 'Merida', fechaActualizacion: ahora },
  ]

  await insertarLote(COLECCIONES.configuraciones, configuraciones)
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
