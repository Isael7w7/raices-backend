// ─── Nombres de colecciones Firestore (español, sin prefijos) ──────
export const COLECCIONES = {
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
  documentosIdentidad: 'documentosIdentidad',
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
