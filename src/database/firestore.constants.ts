// ─── Nombres de colecciones Firestore (español, sin prefijos) ──────
export const COLECCIONES = {
  perfiles: 'perfiles',
  perfilesExtendidos: 'perfilesExtendidos',
  // Borrador del formulario de onboarding (guardado parcial / "continuar después")
  borradoresOnboarding: 'borradoresOnboarding',
  dependientes: 'dependientes',
  favoritos: 'favoritos',
  resenas: 'resenas',
  publicaciones: 'publicaciones',
  comentarios: 'comentarios',
  meGustas: 'meGustas',
  grupos: 'grupos',
  miembrosGrupo: 'miembrosGrupo',
  // Eventos de la comunidad (sección "Eventos" de Conectemos) y sus asistencias
  eventos: 'eventos',
  asistenciasEvento: 'asistenciasEvento',
  mensajesDirectos: 'mensajesDirectos',
  // Borrado lógico de conversaciones: un doc por (usuario, socio) que oculta
  // la conversación solo para ese usuario sin borrar los mensajes.
  conversacionesOcultas: 'conversacionesOcultas',
  mensajesContacto: 'mensajesContacto',
  notificaciones: 'notificaciones',
  postulaciones: 'postulaciones',
  instituciones: 'instituciones',
  foros: 'foros',
  respuestasForo: 'respuestasForo',
  especialistas: 'especialistas',
  interacciones: 'interacciones',
  vacantes: 'vacantes',
  configuraciones: 'configuraciones',
  documentosIdentidad: 'documentosIdentidad',
  validacionesIA: 'validacionesIA',
  rutasDesarrollo: 'rutasDesarrollo',
  pasosRuta: 'pasosRuta',
  analiticas: '_analiticas',
  auditoria: '_auditoria',
} as const

// ─── Límites de negocio ─────────────────────────────────────────────
/** Límite máximo de dependientes por tutor (configurable via env MAX_DEPENDIENTES_POR_TUTOR) */
export function getMaxDependientesPorTutor(): number {
  const val = process.env.MAX_DEPENDIENTES_POR_TUTOR
  const parsed = val ? parseInt(val, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5
}

/** @deprecated Usa getMaxDependientesPorTutor() para valor configurable */
export const MAX_DEPENDIENTES_POR_TUTOR = 5
