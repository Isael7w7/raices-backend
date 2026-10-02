/**
 * Banderas de funcionalidades que un Tutor puede activar/desactivar
 * para una PCD vinculada o un dependiente plano.
 */
export interface FeatureFlags {
  chat: boolean
  postulaciones: boolean
  comunidad: boolean
  resenas: boolean
  descubrimiento: boolean
  favoritos: boolean
  /** Acceso a contenido multimedia (fotos, videos, audios) */
  multimedia: boolean
}

/** Valores por defecto: todas las funcionalidades habilitadas. */
export const FEATURES_POR_DEFECTO: FeatureFlags = {
  chat: true,
  postulaciones: true,
  comunidad: true,
  resenas: true,
  descubrimiento: true,
  favoritos: true,
  multimedia: true,
}

/**
 * Permisos del modal "Permisos de acceso" / "Configurar opciones" del tutor:
 * módulos (casillas) y acciones (interruptores) del dependiente.
 *
 * Los módulos/acciones con equivalente funcional se reflejan en `features`
 * (`instituciones`→`descubrimiento`, `empleo`→`postulaciones`,
 * `comunidad`→`comunidad`, `accesoChat`→`chat`, `accesoMultimedia`→`multimedia`);
 * `puedeComentar` y `puedeInteractuar` se guardan solo en este objeto.
 */
export interface PermisosDependiente {
  instituciones: boolean
  empleo: boolean
  comunidad: boolean
  puedeComentar: boolean
  puedeInteractuar: boolean
  accesoMultimedia: boolean
  accesoChat: boolean
}

/** Valores por defecto: todo habilitado (igual que FEATURES_POR_DEFECTO). */
export const PERMISOS_DEFECTO: PermisosDependiente = {
  instituciones: true,
  empleo: true,
  comunidad: true,
  puedeComentar: true,
  puedeInteractuar: true,
  accesoMultimedia: true,
  accesoChat: true,
}
