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
}

/** Valores por defecto: todas las funcionalidades habilitadas. */
export const FEATURES_POR_DEFECTO: FeatureFlags = {
  chat: true,
  postulaciones: true,
  comunidad: true,
  resenas: true,
  descubrimiento: true,
  favoritos: true,
}
