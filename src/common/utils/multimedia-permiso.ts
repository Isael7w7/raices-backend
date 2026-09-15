import { ForbiddenException } from '@nestjs/common'
import { CurrentUserPayload } from '../interfaces/current-user.interface'

/**
 * Verifica que el usuario tenga el permiso `multimedia` activo cuando adjunta
 * contenido multimedia (mediaUrl) en mensajes o publicaciones.
 *
 * - Sin mediaUrl (o vacío) no se bloquea: el texto sigue funcionando aunque
 *   el permiso esté desactivado.
 * - Los administradores siempre tienen acceso (mismo criterio que FeatureGuard).
 * - Si el perfil no trae features, se asume habilitado (igual que
 *   FEATURES_POR_DEFECTO en FeatureGuard).
 */
export function verificarMultimediaPermitida(user: CurrentUserPayload, mediaUrl?: string | null): void {
  const media = mediaUrl?.trim()
  if (!media) return
  if (user.rol === 'admin') return
  if ((user.features?.multimedia ?? true) === false) {
    throw new ForbiddenException(
      'Funcionalidad "multimedia" desactivada para tu cuenta. Contacta a tu tutor para activarla.',
    )
  }
}

/** Normaliza mediaUrl: recorta espacios y convierte vacío/null en null */
export function normalizarMediaUrl(mediaUrl?: string | null): string | null {
  const media = mediaUrl?.trim()
  return media ? media : null
}
