import * as dotenv from "dotenv";
dotenv.config();

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const COLECCIONES = {
  perfiles: "perfiles",
  perfilesExtendidos: "perfilesExtendidos",
  dependientes: "dependientes",
  favoritos: "favoritos",
  resenas: "resenas",
  publicaciones: "publicaciones",
  comentarios: "comentarios",
  meGustas: "meGustas",
  grupos: "grupos",
  miembrosGrupo: "miembrosGrupo",
  mensajesDirectos: "mensajesDirectos",
  notificaciones: "notificaciones",
  postulaciones: "postulaciones",
  instituciones: "instituciones",
  vacantes: "vacantes",
  configuraciones: "configuraciones",
};

const FEATURES_POR_DEFECTO = {
  chat: true,
  postulaciones: true,
  comunidad: true,
  resenas: true,
  descubrimiento: true,
  favoritos: true,
};

const projectId = process.env.FIREBASE_PROJECT_ID || "raices-demo";
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

if (getApps().length === 0) {
  if (serviceAccountJson) {
    try {
      const parsedServiceAccount =
        typeof serviceAccountJson === "string"
          ? JSON.parse(serviceAccountJson)
          : serviceAccountJson;

      initializeApp({
        credential: cert(parsedServiceAccount),
        projectId: parsedServiceAccount.project_id || projectId,
      });
    } catch (e) {
      console.warn(
        "⚠️ No se pudo parsear FIREBASE_SERVICE_ACCOUNT de las variables de entorno.",
      );
      initializeApp({ projectId });
    }
  } else {
    initializeApp({ projectId });
  }
}

const db = getFirestore();
// Evita que Google Cloud busque el archivo 'firebase-service-account.json' en la raíz
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

/** Genera un ID en formato Firebase (20 chars alfanuméricos) */
function firestoreId(): string {
  return db.collection("_").doc().id;
}

async function limpiarColeccion(nombre: string) {
  const snap = await db.collection(nombre).get();
  if (snap.empty) return;
  const lote = db.batch();
  for (const doc of snap.docs) lote.delete(doc.ref);
  await lote.commit();
}

/**
 * Inserta documentos en lote. Si el documento tiene un campo `id` explícito,
 * se usa ese; si no, Firestore genera el ID automáticamente (formato Firebase).
 * Siempre se guarda el `id` final en el documento.
 */
async function insertarLote(
  coleccion: string,
  documentos: Record<string, any>[],
) {
  for (let i = 0; i < documentos.length; i += 500) {
    const lote = db.batch();
    const porcion = documentos.slice(i, i + 500);
    for (const datos of porcion) {
      const ref = datos.id
        ? db.collection(coleccion).doc(datos.id)
        : db.collection(coleccion).doc();
      lote.set(ref, { ...datos, id: ref.id });
    }
    await lote.commit();
  }
}

// ── Cuentas de usuario ───────────────────────────────────────
const USUARIOS = [
  {
    email: "admin@raices.mx",
    password: "Admin1234",
    rol: "admin",
    nombreCompleto: "Admin Raices",
    ciudad: "Merida",
    estado: "Yucatan",
    uid: "nawu8fPdhIORVtUgv8eCrF86s923",
    profesion: "Administrador",
    bio: "Gestor principal de la plataforma Raices para Florecer. Supervisa operaciones y asegura la calidad del servicio.",
  },
  {
    email: "tutor@raices.mx",
    password: "Tutor1234",
    rol: "tutor",
    nombreCompleto: "Tutor Raices",
    ciudad: "Merida",
    estado: "Yucatan",
    uid: "kTs7a3PFVWSBaEbzokt1vw3pKG03",
    profesion: "Tutor y cuidador",
    bio: "Cuida a su hermano menor (22 años, discapacidad intelectual). Participa en el grupo de Terapia y Empleo.",
  },
  {
    email: "usuario@raices.com",
    password: "Usuario1234",
    rol: "beneficiario",
    nombreCompleto: "Usuario Raices",
    ciudad: "Merida",
    estado: "Yucatan",
    uid: "39y7Wmk5umhdnmedPMsGSDXiERu1",
    profesion: "Madre de familia",
    bio: "Mamá de Santiago (8 años, TEA). Comparte experiencias sobre terapia ABA y escuela inclusiva.",
  },
];

async function seed() {
  const t0 = Date.now();
  console.log("🌱 Sembrando datos demo en Firestore...\n");

  // ── Limpiar todas las colecciones ──────────────────────────────
  const coleccionesALimpiar = [
    COLECCIONES.perfiles,
    COLECCIONES.perfilesExtendidos,
    COLECCIONES.dependientes,
    COLECCIONES.favoritos,
    COLECCIONES.resenas,
    COLECCIONES.publicaciones,
    COLECCIONES.comentarios,
    COLECCIONES.meGustas,
    COLECCIONES.grupos,
    COLECCIONES.miembrosGrupo,
    COLECCIONES.mensajesDirectos,
    COLECCIONES.notificaciones,
    COLECCIONES.postulaciones,
    COLECCIONES.instituciones,
    COLECCIONES.vacantes,
    COLECCIONES.configuraciones,
    // Colecciones antiguas en inglés (eliminar residuos)
    "users",
    "profiles",
    "userProfiles",
    "dependents",
    "favorites",
    "reviews",
    "posts",
    "comments",
    "likes",
    "groups",
    "groupsMembers",
    "messages",
    "notifications",
    "applications",
    "institutions",
    "jobs",
    "settings",
    "u_profiles",
    "u_user_profiles",
    "u_dependents",
    "u_favorites",
    "u_reviews",
    "u_posts",
    "u_comments",
    "u_post_likes",
    "u_groups",
    "u_group_members",
    "u_notifications",
    "u_job_applications",
    "u_direct_messages",
    "p_institutions",
    "p_institution_docs",
    "p_jobs",
    "s_settings",
    "_analytics",
    "usuarios",
    "tareas",
  ];
  for (const col of coleccionesALimpiar) await limpiarColeccion(col);
  console.log(`✨ ${coleccionesALimpiar.length} colecciones limpiadas\n`);

  const ahora = new Date().toISOString();

  // ── Asignar UIDs fijos (reales de Firebase Auth) ───────────────
  const userIds: Record<string, string> = {};
  for (const usuario of USUARIOS) {
    userIds[usuario.rol] = usuario.uid;
    console.log(
      `   🔑 ${usuario.email} (${usuario.rol}) → UID fijo: ${usuario.uid}`,
    );
  }

  const adminId = userIds["admin"];
  const tutorId = userIds["tutor"];
  const beneficiarioId = userIds["beneficiario"];

  // ── Perfiles en Firestore ──────────────────────────────────────
  for (const usuario of USUARIOS) {
    const uid = userIds[usuario.rol];
    await db
      .collection(COLECCIONES.perfiles)
      .doc(uid)
      .set({
        id: uid,
        email: usuario.email,
        rol: usuario.rol,
        nombreCompleto: usuario.nombreCompleto,
        ciudad: usuario.ciudad,
        estado: usuario.estado,
        urlAvatar: null,
        activo: true,
        verificado: usuario.rol === "admin",
        tutorId: null,
        features: { ...FEATURES_POR_DEFECTO },
        profesion: usuario.profesion ?? null,
        bio: usuario.bio ?? null,
        fechaCreacion: ahora,
      });
    console.log(`👤 Perfil creado: ${usuario.email} (${usuario.rol}) → ${uid}`);
  }

  // ── Instituciones ──────────────────────────────────────────────
  const instIds = Array.from({ length: 12 }, () => firestoreId());

  const instituciones = [
    {
      id: instIds[0],
      nombre: "Centro de Rehabilitacion DIF Merida",
      descripcion:
        "Terapias fisicas, ocupacionales y de lenguaje para personas con discapacidad motriz y del neurodesarrollo.",
      categoria: "funcional",
      subcategoria: "terapias",
      direccion: "Calle 50 x 65 #123",
      ciudad: "Merida",
      estado: "Yucatan",
      lat: 20.9674,
      lng: -89.6237,
      telefono: "9999990001",
      whatsapp: "9991110001",
      email: "contacto@difmerida.mx",
      tiposDiscapacidad: JSON.stringify(["motriz", "intelectual", "tea"]),
      edadMinima: 0,
      edadMaxima: 99,
      verificada: true,
      activa: true,
      calificacionPromedio: 4.5,
      cantidadCalificaciones: 12,
      tipoPlan: "gratuito",
      creadoPor: adminId,
      fechaCreacion: ahora,
    },
    {
      id: instIds[1],
      nombre: "CREE Yucatan - IMSS",
      descripcion:
        "Centro de Rehabilitacion y Educacion Especial. Atencion medica y terapeutica integral del IMSS.",
      categoria: "funcional",
      subcategoria: "atencion_especializada",
      direccion: "Av. Jacinto Canek S/N",
      ciudad: "Merida",
      estado: "Yucatan",
      lat: 20.9589,
      lng: -89.6412,
      telefono: "9999990004",
      whatsapp: null,
      email: "cree.yucatan@imss.gob.mx",
      tiposDiscapacidad: JSON.stringify([
        "motriz",
        "visual",
        "auditiva",
        "intelectual",
        "multiple",
      ]),
      edadMinima: 0,
      edadMaxima: 99,
      verificada: true,
      activa: true,
      calificacionPromedio: 4.0,
      cantidadCalificaciones: 35,
      tipoPlan: "gratuito",
      creadoPor: adminId,
      fechaCreacion: ahora,
    },
    {
      id: instIds[2],
      nombre: "CEDIS - Estimulacion Temprana",
      descripcion:
        "Estimulacion temprana y atencion a ninos con rezago en el desarrollo de 0 a 6 anios.",
      categoria: "funcional",
      subcategoria: "terapias",
      direccion: "Av. Prolongacion Montejo 480",
      ciudad: "Merida",
      estado: "Yucatan",
      lat: 21.0098,
      lng: -89.624,
      telefono: "9999990009",
      whatsapp: "9991110009",
      email: "cedis.merida@salud.gob.mx",
      tiposDiscapacidad: JSON.stringify(["intelectual", "multiple"]),
      edadMinima: 0,
      edadMaxima: 6,
      verificada: true,
      activa: true,
      calificacionPromedio: 4.9,
      cantidadCalificaciones: 18,
      tipoPlan: "gratuito",
      creadoPor: adminId,
      fechaCreacion: ahora,
    },
    {
      id: instIds[3],
      nombre: "Clinica Voces - Fonoaudiologia",
      descripcion:
        "Terapia de lenguaje para ninos y adultos con tartamudez, dislexia, TEA y afasia.",
      categoria: "funcional",
      subcategoria: "terapias",
      direccion: "Calle 17 x 28 #240",
      ciudad: "Merida",
      estado: "Yucatan",
      lat: 20.982,
      lng: -89.6174,
      telefono: "9999990011",
      whatsapp: "9991110011",
      email: "info@clinicavoces.mx",
      tiposDiscapacidad: JSON.stringify(["tea", "auditiva", "intelectual"]),
      edadMinima: 2,
      edadMaxima: 70,
      verificada: true,
      activa: true,
      calificacionPromedio: 4.5,
      cantidadCalificaciones: 22,
      tipoPlan: "gratuito",
      creadoPor: adminId,
      fechaCreacion: ahora,
    },
    {
      id: instIds[4],
      nombre: "Escuela de Educacion Especial No. 5",
      descripcion:
        "Educacion especial y habilidades adaptativas para ninos y jovenes con discapacidad intelectual.",
      categoria: "educativo",
      subcategoria: "escuelas",
      direccion: "Av. Itzaes 200",
      ciudad: "Merida",
      estado: "Yucatan",
      lat: 20.9712,
      lng: -89.6301,
      telefono: "9999990002",
      whatsapp: "9991110002",
      email: "ee5.merida@seyy.gob.mx",
      tiposDiscapacidad: JSON.stringify(["intelectual", "tea"]),
      edadMinima: 3,
      edadMaxima: 22,
      verificada: true,
      activa: true,
      calificacionPromedio: 4.2,
      cantidadCalificaciones: 8,
      tipoPlan: "gratuito",
      creadoPor: adminId,
      fechaCreacion: ahora,
    },
    {
      id: instIds[5],
      nombre: "Colegio Futuros Brillantes",
      descripcion:
        "Escuela privada con modelo de educacion inclusiva. Apoya TDAH, dislexia y TEA leve.",
      categoria: "educativo",
      subcategoria: "escuelas",
      direccion: "Calle 13 x 22 #150 Altabrisa",
      ciudad: "Merida",
      estado: "Yucatan",
      lat: 21.0034,
      lng: -89.6185,
      telefono: "9999990006",
      whatsapp: "9991110006",
      email: "admision@futurosbrillantes.mx",
      tiposDiscapacidad: JSON.stringify(["tea", "intelectual"]),
      edadMinima: 3,
      edadMaxima: 18,
      verificada: true,
      activa: true,
      calificacionPromedio: 4.6,
      cantidadCalificaciones: 9,
      tipoPlan: "gratuito",
      creadoPor: adminId,
      fechaCreacion: ahora,
    },
    {
      id: instIds[6],
      nombre: "Talleres Inclusivos Yucatan",
      descripcion:
        "Capacitacion laboral para adultos con discapacidad: carpinteria, bisuteria, panaderia.",
      categoria: "laboral",
      subcategoria: "capacitacion",
      direccion: "Calle 62 #400",
      ciudad: "Merida",
      estado: "Yucatan",
      lat: 20.9651,
      lng: -89.6325,
      telefono: "9999990005",
      whatsapp: "9991110005",
      email: "talleres@inclusivos.mx",
      tiposDiscapacidad: JSON.stringify(["intelectual", "motriz"]),
      edadMinima: 18,
      edadMaxima: 60,
      verificada: true,
      activa: true,
      calificacionPromedio: 4.3,
      cantidadCalificaciones: 15,
      tipoPlan: "gratuito",
      creadoPor: adminId,
      fechaCreacion: ahora,
    },
    {
      id: instIds[7],
      nombre: "Tech Accesible MX",
      descripcion:
        "Bolsa de trabajo especializada en vacantes para personas con discapacidad en sector tecnologico.",
      categoria: "laboral",
      subcategoria: "insercion_laboral",
      direccion: "Remoto / Col. Poligono 108",
      ciudad: "Merida",
      estado: "Yucatan",
      lat: 20.99,
      lng: -89.615,
      telefono: "9991110010",
      whatsapp: "9991110010",
      email: "empleo@techaccesible.mx",
      tiposDiscapacidad: JSON.stringify(["visual", "auditiva", "motriz"]),
      edadMinima: 18,
      edadMaxima: 55,
      verificada: true,
      activa: true,
      calificacionPromedio: 4.4,
      cantidadCalificaciones: 7,
      tipoPlan: "gratuito",
      creadoPor: adminId,
      fechaCreacion: ahora,
    },
    {
      id: instIds[8],
      nombre: "Fundacion Alas y Raices Merida",
      descripcion:
        "Apoyo integral a personas con autismo: terapias ABA, integracion social y orientacion familiar.",
      categoria: "social",
      subcategoria: "centros_comunitarios",
      direccion: "Calle 20 #300 Col. Garcia Gineres",
      ciudad: "Merida",
      estado: "Yucatan",
      lat: 20.9801,
      lng: -89.6198,
      telefono: "9999990003",
      whatsapp: "9991110003",
      email: "info@alasyraices.mx",
      tiposDiscapacidad: JSON.stringify(["tea"]),
      edadMinima: 2,
      edadMaxima: 30,
      verificada: true,
      activa: true,
      calificacionPromedio: 4.8,
      cantidadCalificaciones: 20,
      tipoPlan: "gratuito",
      creadoPor: adminId,
      fechaCreacion: ahora,
    },
    {
      id: instIds[9],
      nombre: "Grupo de Apoyo TEA Familias",
      descripcion:
        "Red de familias con hijos con autismo. Reuniones quincenales, asesorias y apoyo emocional.",
      categoria: "social",
      subcategoria: "actividades",
      direccion: "Sede rotativa",
      ciudad: "Merida",
      estado: "Yucatan",
      lat: 20.974,
      lng: -89.622,
      telefono: "9991110007",
      whatsapp: "9991110007",
      email: "contacto@teafamilias.mx",
      tiposDiscapacidad: JSON.stringify(["tea"]),
      edadMinima: 0,
      edadMaxima: 99,
      verificada: false,
      activa: true,
      calificacionPromedio: 4.7,
      cantidadCalificaciones: 6,
      tipoPlan: "gratuito",
      creadoPor: adminId,
      fechaCreacion: ahora,
    },
    {
      id: instIds[10],
      nombre: "ASPADEM",
      descripcion:
        "Talleres productivos, vivienda asistida y programa de vida independiente para discapacidad mental.",
      categoria: "social",
      subcategoria: "centros_comunitarios",
      direccion: "Calle 29A x 46 #199",
      ciudad: "Merida",
      estado: "Yucatan",
      lat: 20.9703,
      lng: -89.6289,
      telefono: "9999990008",
      whatsapp: "9991110008",
      email: "info@aspadem.mx",
      tiposDiscapacidad: JSON.stringify(["intelectual", "multiple"]),
      edadMinima: 18,
      edadMaxima: 99,
      verificada: true,
      activa: true,
      calificacionPromedio: 4.1,
      cantidadCalificaciones: 11,
      tipoPlan: "gratuito",
      creadoPor: adminId,
      fechaCreacion: ahora,
    },
    {
      id: instIds[11],
      nombre: "Atletismo Paralimpico Yucatan",
      descripcion:
        "Entrenamiento deportivo adaptado para personas con discapacidad motriz.",
      categoria: "social",
      subcategoria: "actividades",
      direccion: "UADY Estadio Carlos Iturralde",
      ciudad: "Merida",
      estado: "Yucatan",
      lat: 20.9854,
      lng: -89.6278,
      telefono: "9999990012",
      whatsapp: "9991110012",
      email: "deporte@paralimpico.mx",
      tiposDiscapacidad: JSON.stringify(["motriz"]),
      edadMinima: 8,
      edadMaxima: 50,
      verificada: true,
      activa: true,
      calificacionPromedio: 4.7,
      cantidadCalificaciones: 14,
      tipoPlan: "gratuito",
      creadoPor: adminId,
      fechaCreacion: ahora,
    },
  ];

  await insertarLote(COLECCIONES.instituciones, instituciones);
  console.log(`🏢 ${instituciones.length} instituciones insertadas`);

  // ── Vacantes (Pre-generamos IDs para evitar dependencias asíncronas) ──
  const vacIds = Array.from({ length: 7 }, () => firestoreId());

  const vacantesDatos = [
    {
      id: vacIds[0],
      institucionId: instIds[6],
      titulo: "Carpintero/a Artesanal",
      descripcion:
        "Taller de carpinteria artesanal para crear muebles y objetos decorativos. Capacitacion incluida.",
      requisitos: "Interes en manualidades. No se requiere experiencia previa.",
      modalidad: "presencial",
      horario: "Lun-Vie 8:00-14:00",
      rangoSalario: "$4,000 - $6,000 MXN",
      ciudad: "Merida",
      estado: "Yucatan",
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(["intelectual", "motriz"]),
      activa: true,
      fechaCreacion: ahora,
    },
    {
      id: vacIds[1],
      institucionId: instIds[7],
      titulo: "Asistente de Soporte Tecnico",
      descripcion:
        "Soporte tecnico remoto para usuarios con discapacidad visual. Capacitacion en lectores de pantalla.",
      requisitos:
        "Conocimientos basicos de computacion. Disponibilidad de equipo propio.",
      modalidad: "remoto",
      horario: "Lun-Vie 9:00-17:00",
      rangoSalario: "$8,000 - $12,000 MXN",
      ciudad: "Merida",
      estado: "Yucatan",
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(["visual", "auditiva", "motriz"]),
      activa: true,
      fechaCreacion: ahora,
    },
    {
      id: vacIds[2],
      institucionId: instIds[7],
      titulo: "Desarrollador/a Frontend Junior",
      descripcion:
        "Desarrollo de interfaces web accesibles. Trabajo remoto con horario flexible.",
      requisitos:
        "Conocimiento de HTML, CSS y JavaScript. Portafolio o proyectos personales.",
      modalidad: "remoto",
      horario: "Flexible",
      rangoSalario: "$12,000 - $18,000 MXN",
      ciudad: "Merida",
      estado: "Yucatan",
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(["visual", "auditiva", "motriz"]),
      activa: true,
      fechaCreacion: ahora,
    },
    {
      id: vacIds[3],
      institucionId: instIds[8],
      titulo: "Asistente Terapeutico",
      descripcion:
        "Apoyo en sesiones de terapia ABA para ninos con autismo. Se proporciona capacitacion.",
      requisitos:
        "Paciencia, empatia y disposicion para trabajar con ninos. Estudiantes de psicologia o terapia son bienvenidos.",
      modalidad: "presencial",
      horario: "Lun-Vie 8:00-15:00",
      rangoSalario: "$6,000 - $9,000 MXN",
      ciudad: "Merida",
      estado: "Yucatan",
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(["tea"]),
      activa: true,
      fechaCreacion: ahora,
    },
    {
      id: vacIds[4],
      institucionId: instIds[6],
      titulo: "Auxiliar de Cocina",
      descripcion:
        "Apoyo en cocina comunitaria para talleres de capacitacion laboral.",
      requisitos: "Interes en gastronomia. Entorno adaptado y supervisado.",
      modalidad: "presencial",
      horario: "Lun-Vie 7:00-13:00",
      rangoSalario: "$4,500 - $6,500 MXN",
      ciudad: "Merida",
      estado: "Yucatan",
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(["intelectual", "multiple"]),
      activa: true,
      fechaCreacion: ahora,
    },
    {
      id: vacIds[5],
      institucionId: instIds[2],
      titulo: "Educador/a de Estimulacion Temprana",
      descripcion:
        "Imparticion de sesiones de estimulacion temprana para ninos de 0 a 6 anios con rezago en desarrollo.",
      requisitos:
        "Licenciatura en educacion especial, psicologia o afines. Experiencia minima de 1 anio.",
      modalidad: "presencial",
      horario: "Lun-Vie 8:00-14:00",
      rangoSalario: "$9,000 - $13,000 MXN",
      ciudad: "Merida",
      estado: "Yucatan",
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(["intelectual", "multiple"]),
      activa: true,
      fechaCreacion: ahora,
    },
    {
      id: vacIds[6],
      institucionId: instIds[0],
      titulo: "Terapeuta Ocupacional",
      descripcion:
        "Atencion terapeutica ocupacional para pacientes con discapacidad motriz y neurodesarrollo.",
      requisitos:
        "Licenciatura en Terapia Ocupacional. Experiencia en centros de rehabilitacion deseable.",
      modalidad: "presencial",
      horario: "Lun-Vie 7:00-15:00",
      rangoSalario: "$12,000 - $16,000 MXN",
      ciudad: "Merida",
      estado: "Yucatan",
      inclusivaDiscapacidad: true,
      tiposDiscapacidad: JSON.stringify(["motriz", "intelectual"]),
      activa: true,
      fechaCreacion: ahora,
    },
  ];

  await insertarLote(COLECCIONES.vacantes, vacantesDatos);
  console.log(`💼 ${vacantesDatos.length} vacantes de empleo creadas`);

  // ── Grupos de comunidad ────────────────────────────────────────
  const grpIds = Array.from({ length: 5 }, () => firestoreId());

  const grupos = [
    {
      id: grpIds[0],
      nombre: "Feed general",
      descripcion: "Espacio abierto para todos los miembros de Raices.",
      categoria: "social",
      tiposDiscapacidad: JSON.stringify([]),
      esPublico: true,
      cantidadMiembros: 1,
      creadoPor: adminId,
      fechaCreacion: ahora,
    },
    {
      id: grpIds[1],
      nombre: "TEA - Primera infancia",
      descripcion:
        "Familias con ninos con autismo de 0 a 6 anios. Intercambio de experiencias y recursos.",
      categoria: "social",
      tiposDiscapacidad: JSON.stringify(["tea"]),
      esPublico: true,
      cantidadMiembros: 1,
      creadoPor: adminId,
      fechaCreacion: ahora,
    },
    {
      id: grpIds[2],
      nombre: "Adultos con TDAH",
      descripcion:
        "Estrategias, apoyo y experiencias de vida para adultos diagnosticados con TDAH.",
      categoria: "social",
      tiposDiscapacidad: JSON.stringify(["intelectual"]),
      esPublico: true,
      cantidadMiembros: 1,
      creadoPor: adminId,
      fechaCreacion: ahora,
    },
    {
      id: grpIds[3],
      nombre: "Inclusion laboral",
      descripcion:
        "Empleos, capacitacion y experiencias laborales inclusivas. Comparte ofertas y oportunidades.",
      categoria: "laboral",
      tiposDiscapacidad: JSON.stringify([]),
      esPublico: true,
      cantidadMiembros: 1,
      creadoPor: adminId,
      fechaCreacion: ahora,
    },
    {
      id: grpIds[4],
      nombre: "Tramites y derechos",
      descripcion:
        "Guia sobre derechos, IMSS, pensiones, credencial de discapacidad y tramites gubernamentales.",
      categoria: "social",
      tiposDiscapacidad: JSON.stringify([]),
      esPublico: true,
      cantidadMiembros: 1,
      creadoPor: adminId,
      fechaCreacion: ahora,
    },
  ];

  await insertarLote(COLECCIONES.grupos, grupos);
  console.log(`👥 ${grupos.length} grupos de comunidad creados`);

  // ── Miembros de grupo ───────────────────────────────────────────
  const miembrosGrupo = grpIds.map((grupoId) => ({
    id: firestoreId(),
    grupoId,
    usuarioId: adminId,
    rol: "admin",
    fechaUnificacion: ahora,
  }));
  await insertarLote(COLECCIONES.miembrosGrupo, miembrosGrupo);
  console.log(`👤 ${miembrosGrupo.length} miembros de grupo asignados`);

  // ── Publicaciones ───────────────────────────────────────────────
  const pubIds = [firestoreId(), firestoreId(), firestoreId()];
  const publicaciones = [
    {
      id: pubIds[0],
      autorId: adminId,
      grupoId: grpIds[0],
      contenido:
        "Bienvenidos a Raices para Florecer! Este es un espacio para compartir experiencias, recursos y apoyarnos mutuamente.",
      cantidadMeGustas: 1,
      activa: true,
      fechaCreacion: ahora,
    },
    {
      id: pubIds[1],
      autorId: adminId,
      grupoId: grpIds[1],
      contenido:
        "Comparto recursos sobre terapias ABA para ninos con TEA en la primera infancia. Alguien tiene recomendaciones de centros en Merida?",
      cantidadMeGustas: 1,
      activa: true,
      fechaCreacion: ahora,
    },
    {
      id: pubIds[2],
      autorId: adminId,
      grupoId: grpIds[3],
      contenido:
        "Recordatorio: El proximo jueves hay feria de empleo inclusivo en el Centro de Convenciones Siglo XXI. No falten!",
      cantidadMeGustas: 1,
      activa: true,
      fechaCreacion: ahora,
    },
  ];
  await insertarLote(COLECCIONES.publicaciones, publicaciones);
  console.log(`📝 ${publicaciones.length} publicaciones creadas`);

  // ── Comentarios ─────────────────────────────────────────────────
  const comentarios = [
    {
      id: firestoreId(),
      publicacionId: pubIds[0],
      autorId: adminId,
      contenido:
        "Que gran iniciativa! Espero que este espacio sea de gran ayuda para todos.",
      fechaCreacion: ahora,
    },
    {
      id: firestoreId(),
      publicacionId: pubIds[1],
      autorId: beneficiarioId,
      contenido:
        "Yo conozco el CRI Merida, tienen buen programa de atencion temprana. Recomiendo agendar una cita de valoracion.",
      fechaCreacion: ahora,
    },
  ];
  await insertarLote(COLECCIONES.comentarios, comentarios);
  console.log(`💬 ${comentarios.length} comentarios agregados`);

  // ── Me gustas ───────────────────────────────────────────────────
  const meGustas = [
    {
      id: firestoreId(),
      publicacionId: pubIds[0],
      usuarioId: tutorId,
      fechaCreacion: ahora,
    },
  ];
  await insertarLote(COLECCIONES.meGustas, meGustas);
  console.log(`❤️ ${meGustas.length} me gusta registrado`);

  // ── Resenas ─────────────────────────────────────────────────────
  const resenas = [
    {
      id: firestoreId(),
      institucionId: instIds[0],
      usuarioId: adminId,
      calificacion: 5,
      comentario:
        "Excelente centro de rehabilitacion. El personal es muy atento y las instalaciones estan bien equipadas. Totalmente recomendado.",
      verificada: true,
      fechaCreacion: ahora,
    },
    {
      id: firestoreId(),
      institucionId: instIds[0],
      usuarioId: beneficiarioId,
      calificacion: 5,
      comentario:
        "Ofrecen terapias de lenguaje, fisica y ocupacional. Mi experiencia ha sido muy positiva.",
      verificada: true,
      fechaCreacion: ahora,
    },
    {
      id: firestoreId(),
      institucionId: instIds[1],
      usuarioId: tutorId,
      calificacion: 5,
      comentario:
        "Atencion integral del IMSS. Cuentan con especialistas en rehabilitacion y equipo multidisciplinario.",
      verificada: true,
      fechaCreacion: ahora,
    },
  ];
  await insertarLote(COLECCIONES.resenas, resenas);
  console.log(`⭐ ${resenas.length} resenas registradas`);

  // ── Favoritos ───────────────────────────────────────────────────
  const favoritos = [
    {
      id: firestoreId(),
      usuarioId: beneficiarioId,
      institucionId: instIds[0],
      fechaCreacion: ahora,
    },
    {
      id: firestoreId(),
      usuarioId: tutorId,
      institucionId: instIds[2],
      fechaCreacion: ahora,
    },
  ];
  await insertarLote(COLECCIONES.favoritos, favoritos);
  console.log(`⭐ ${favoritos.length} favoritos agregados`);

  // ── Postulaciones ───────────────────────────────────────────────
  const postulaciones = [
    {
      id: firestoreId(),
      vacanteId: vacIds[0],
      usuarioId: beneficiarioId,
      estado: "pendiente",
      mensaje:
        "Me interesa mucho esta oportunidad. Tengo experiencia en carpinteria artesanal y muchas ganas de aprender.",
      fechaCreacion: ahora,
    },
    {
      id: firestoreId(),
      vacanteId: vacIds[1],
      usuarioId: beneficiarioId,
      estado: "pendiente",
      mensaje:
        "Cuento con conocimientos basicos de computacion y estoy interesado en desarrollar habilidades en soporte tecnico.",
      fechaCreacion: ahora,
    },
  ];
  await insertarLote(COLECCIONES.postulaciones, postulaciones);
  console.log(`📋 ${postulaciones.length} postulaciones registradas`);

  // ── Mensajes Directos ───────────────────────────────────────────
  const mensajesDirectos = [
    {
      id: firestoreId(),
      remitenteId: adminId,
      destinatarioId: beneficiarioId,
      contenido:
        "Bienvenido a Raices para Florecer! Este es tu panel de administracion. Explora las secciones para gestionar la plataforma.",
      leido: true,
      fechaCreacion: ahora,
    },
  ];
  await insertarLote(COLECCIONES.mensajesDirectos, mensajesDirectos);
  console.log(`✉️ ${mensajesDirectos.length} mensaje directo creado`);

  // ── Notificaciones ──────────────────────────────────────────────
  const notificaciones = [
    {
      id: firestoreId(),
      usuarioId: beneficiarioId,
      titulo: "Bienvenido a Raices",
      mensaje:
        "Gracias por ser parte de Raices para Florecer. Revisa las nuevas instituciones registradas en la plataforma.",
      leida: false,
      tipo: "sistema",
      fechaCreacion: ahora,
    },
    {
      id: firestoreId(),
      usuarioId: beneficiarioId,
      titulo: "Nueva institucion pendiente",
      mensaje:
        "Hay instituciones que requieren revision y aprobacion. Accede al panel de administracion para gestionarlas.",
      leida: false,
      tipo: "sistema",
      fechaCreacion: ahora,
    },
  ];
  await insertarLote(COLECCIONES.notificaciones, notificaciones);
  console.log(`🔔 ${notificaciones.length} notificaciones creadas`);

  // ── Configuraciones de plataforma ──────────────────────────────
  const configuraciones = [
    {
      id: "nombrePlataforma",
      clave: "nombrePlataforma",
      valor: "Raices para Florecer",
      fechaActualizacion: ahora,
    },
    {
      id: "emailSoporte",
      clave: "emailSoporte",
      valor: "soporte@raices.mx",
      fechaActualizacion: ahora,
    },
    {
      id: "permitirRegistro",
      clave: "permitirRegistro",
      valor: "true",
      fechaActualizacion: ahora,
    },
    {
      id: "aprobacionInstitucionRequerida",
      clave: "aprobacionInstitucionRequerida",
      valor: "true",
      fechaActualizacion: ahora,
    },
    {
      id: "iaHabilitada",
      clave: "iaHabilitada",
      valor: "true",
      fechaActualizacion: ahora,
    },
    {
      id: "modoMantenimiento",
      clave: "modoMantenimiento",
      valor: "false",
      fechaActualizacion: ahora,
    },
    {
      id: "maxResenasPorUsuario",
      clave: "maxResenasPorUsuario",
      valor: "10",
      fechaActualizacion: ahora,
    },
    {
      id: "ciudadPorDefecto",
      clave: "ciudadPorDefecto",
      valor: "Merida",
      fechaActualizacion: ahora,
    },
  ];

  await insertarLote(COLECCIONES.configuraciones, configuraciones);
  console.log(
    `⚙️  ${configuraciones.length} configuraciones de plataforma creadas`,
  );

  // ── Resumen final ──────────────────────────────────────────────
  const tiempoTotal = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✅ Seed completo en ${tiempoTotal}s\n`);
  console.log(
    `👤 ${USUARIOS.length} cuentas de usuario (UIDs fijos de Firebase Auth):`,
  );
  for (const usuario of USUARIOS) {
    const uid = userIds[usuario.rol];
    console.log(
      `   ${usuario.email} (${usuario.rol})  password: ${usuario.password}  → UID: ${uid}`,
    );
  }
  console.log(`\n🏢 ${instituciones.length} instituciones de Merida`);
  console.log(`💼 ${vacantesDatos.length} vacantes de empleo inclusivo`);
  console.log(`👥 ${grupos.length} grupos de comunidad`);
  console.log(`👤 ${miembrosGrupo.length} miembros de grupo`);
  console.log(`📝 ${publicaciones.length} publicaciones`);
  console.log(`💬 ${comentarios.length} comentarios`);
  console.log(`❤️ ${meGustas.length} me gusta`);
  console.log(`⭐ ${resenas.length} resenas`);
  console.log(`⭐ ${favoritos.length} favoritos`);
  console.log(`📋 ${postulaciones.length} postulaciones`);
  console.log(`✉️ ${mensajesDirectos.length} mensaje directo`);
  console.log(`🔔 ${notificaciones.length} notificaciones`);
  console.log(`⚙️  ${configuraciones.length} configuraciones de plataforma`);

  console.log(
    "\n🔑 Todos los IDs de documentos fueron asignados y vinculados correctamente en Firestore.",
  );

  process.exit(0);
}

seed().catch((e) => {
  console.error("❌ Error durante el seed:", e);
  process.exit(1);
});
