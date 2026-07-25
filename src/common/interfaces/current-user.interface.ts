/**
 * Payload del usuario autenticado que se inyecta via @CurrentUser().
 *
 * Se popula en Firebase Auth Guard a partir del token JWT decodificado
 * y el perfil almacenado en Firestore.
 */
export interface CurrentUserPayload {
  id: string
  email: string
  rol: 'pcd' | 'tutor' | 'institucion' | 'admin'
  nombreCompleto: string
  verificado: boolean
}
