import { FeatureFlags, FEATURES_POR_DEFECTO } from './feature-flags.interface'

/**
 * Payload del usuario autenticado que se inyecta via @CurrentUser().
 *
 * Se popula en Firebase Auth Guard a partir del token JWT decodificado
 * y el perfil almacenado en Firestore.
 */
export interface CurrentUserPayload {
  id: string
  email: string
  rol: 'pcd' | 'padre_tutor' | 'institucion' | 'especialista' | 'empresa' | 'institucional' | 'admin'
  nombreCompleto: string
  verificado: boolean
  /** Si el usuario es una PCD vinculada a un tutor, aquí está el ID del tutor */
  tutorId?: string | null
  /** Banderas de funcionalidades (por defecto todas true) */
  features: FeatureFlags
}

/** Valor por defecto para usar en guards / servicios cuando no hay perfil */
export const CURRENT_USER_DEFAULT_FEATURES: FeatureFlags = { ...FEATURES_POR_DEFECTO }
