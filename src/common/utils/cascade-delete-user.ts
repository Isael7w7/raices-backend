import { Firestore, DocumentData } from 'firebase-admin/firestore'
import { Logger } from '@nestjs/common'
import { COLECCIONES } from '../../database/firestore.constants'
import { extractStoragePath } from './storage-path.util'
import type { StorageService } from '../../modules/storage/storage.service'
import type { Auth as FirebaseAuth } from 'firebase-admin/auth'
import { getAuth } from 'firebase-admin/auth'

/**
 * Elimina documentos coincidentes en lote (batch) para una colección y campo dados.
 */
export async function eliminarDocsEnLote(
  db: Firestore,
  coleccion: string,
  campo: string,
  valor: string,
): Promise<void> {
  const snap = await db.collection(coleccion).where(campo, '==', valor).get()
  const batch = db.batch()
  for (const doc of snap.docs) {
    batch.delete(doc.ref)
  }
  if (!snap.empty) await batch.commit()
}

/**
 * Elimina todas las instituciones de un usuario (canónica con ID = UID y creadas por creadoPor)
 * junto con sus vacantes asociadas.
 */
export async function eliminarInstitucionesDeUsuario(
  db: Firestore,
  usuarioId: string,
): Promise<void> {
  const [canonicalSnap, porCreadorSnap] = await Promise.all([
    db.collection(COLECCIONES.instituciones).doc(usuarioId).get(),
    db.collection(COLECCIONES.instituciones).where('creadoPor', '==', usuarioId).get(),
  ])

  const ids = new Set<string>()
  if (canonicalSnap.exists) ids.add(canonicalSnap.id)
  porCreadorSnap.docs.forEach((d) => ids.add(d.id))

  for (const id of ids) {
    const vacantesSnap = await db.collection(COLECCIONES.vacantes)
      .where('institucionId', '==', id).get()
    const batch = db.batch()
    for (const v of vacantesSnap.docs) batch.delete(v.ref)
    batch.delete(db.collection(COLECCIONES.instituciones).doc(id))
    await batch.commit()
  }
}

/**
 * Ejecuta la eliminación en cascada completa y permanente de un usuario:
 * 1. Elimina avatar de Storage si existe.
 * 2. Elimina en paralelo dependientes, perfilesExtendidos, favoritos, reseñas, publicaciones,
 *    comentarios, mensajes directos, notificaciones, postulaciones, miembros de grupo e instituciones.
 * 3. Elimina el documento principal de 'perfiles'.
 * 4. Elimina al usuario de Firebase Auth.
 */
export async function ejecutarEliminacionPermanenteUsuario(
  db: Firestore,
  storage: StorageService,
  auth: FirebaseAuth | undefined,
  usuarioId: string,
  perfil: DocumentData,
  logger: Logger = new Logger('CascadeDeleteUser'),
): Promise<void> {
  // 1. Eliminar avatar de Storage
  if (perfil.urlAvatar) {
    try {
      const filePath = extractStoragePath(perfil.urlAvatar)
      if (filePath) await storage.delete(filePath)
    } catch (err: unknown) {
      logger.warn(`No se pudo eliminar avatar de Storage: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const esInstitucion = perfil.rol === 'institucion' || perfil.rol === 'institution'

  // 2. Eliminar datos relacionados en paralelo
  await Promise.all([
    // Dependientes cuando el eliminado es tutor
    eliminarDocsEnLote(db, COLECCIONES.dependientes, 'tutorId', usuarioId),
    // Relación dependiente cuando el eliminado es una PCD vinculada
    db.collection(COLECCIONES.dependientes).doc(usuarioId).delete(),
    // Perfil extendido de necesidades
    eliminarDocsEnLote(db, COLECCIONES.perfilesExtendidos, 'usuarioId', usuarioId),
    // Favoritos
    eliminarDocsEnLote(db, COLECCIONES.favoritos, 'usuarioId', usuarioId),
    // Reseñas
    eliminarDocsEnLote(db, COLECCIONES.resenas, 'usuarioId', usuarioId),
    // Publicaciones en comunidad
    eliminarDocsEnLote(db, COLECCIONES.publicaciones, 'autorId', usuarioId),
    // Comentarios
    eliminarDocsEnLote(db, COLECCIONES.comentarios, 'autorId', usuarioId),
    // Mensajes directos
    eliminarDocsEnLote(db, COLECCIONES.mensajesDirectos, 'emisorId', usuarioId),
    eliminarDocsEnLote(db, COLECCIONES.mensajesDirectos, 'receptorId', usuarioId),
    // Notificaciones
    eliminarDocsEnLote(db, COLECCIONES.notificaciones, 'usuarioId', usuarioId),
    // Postulaciones
    eliminarDocsEnLote(db, COLECCIONES.postulaciones, 'usuarioId', usuarioId),
    // Miembros de grupo
    eliminarDocsEnLote(db, COLECCIONES.miembrosGrupo, 'usuarioId', usuarioId),
    // Institución + vacantes si el rol es institucion
    esInstitucion ? eliminarInstitucionesDeUsuario(db, usuarioId) : Promise.resolve(),
  ])

  // 3. Eliminar perfil principal en Firestore
  await db.collection(COLECCIONES.perfiles).doc(usuarioId).delete()

  // 4. Eliminar de Firebase Auth
  try {
    const authSdk = auth ?? getAuth()
    await authSdk.deleteUser(usuarioId)
  } catch (err: unknown) {
    logger.warn(`No se pudo eliminar usuario ${usuarioId} de Firebase Auth: ${err instanceof Error ? err.message : String(err)}`)
  }
}
