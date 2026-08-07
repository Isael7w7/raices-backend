import { Injectable, Inject, Logger, NotFoundException, ForbiddenException } from '@nestjs/common'
import { Firestore, FieldValue, Query, DocumentData } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { obtenerDocumentosPorIds } from '../../common/utils/firestore-helpers'
import { paginar, ordenar, RespuestaPaginada } from '../../common/dto/paginacion.dto'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { verificarMultimediaPermitida, normalizarMediaUrl } from '../../common/utils/multimedia-permiso'

/** Objeto de autor por defecto cuando el autor no existe o está deshabilitado */
const AUTOR_NO_DISPONIBLE = Object.freeze({
  nombreCompleto: 'Usuario no disponible',
  urlAvatar: null,
})

/** Spread seguro de un snapshot de Firestore; retorna objeto vacío si data() es undefined */
function extraerDoc<T = Record<string, any>>(d: { id: string; data(): DocumentData | undefined }): T & { id: string } {
  return { id: d.id, ...(d.data() ?? {}) } as T & { id: string }
}

/** Filtra valores falsy (null / undefined / '') de un array y retorna string[] limpio */
function idsValidos(ids: (string | undefined | null)[]): string[] {
  return ids.filter((id): id is string => !!id)
}

@Injectable()
export class CommunityService {
  private readonly logger = new Logger(CommunityService.name)

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async getGroups(pagina = 1, limite = 20, ordenarPor?: string, direccion?: 'asc' | 'desc', buscar?: string): Promise<RespuestaPaginada<any>> {
    try {
      const snap = await this.db.collection(COLECCIONES.grupos)
        .where('esPublico', '==', true).get()

      let grupos = snap.docs.map(d => extraerDoc(d))

      if (buscar) {
        const termino = buscar.toLowerCase()
        grupos = grupos.filter(g =>
          (g.nombre ?? '').toLowerCase().includes(termino) ||
          (g.descripcion ?? '').toLowerCase().includes(termino)
        )
      }

      if (ordenarPor) {
        grupos = ordenar(grupos, ordenarPor, direccion ?? 'desc')
      } else {
        grupos.sort((a: any, b: any) => (b.cantidadMiembros ?? 0) - (a.cantidadMiembros ?? 0))
      }

      const total = grupos.length
      const inicio = (pagina - 1) * limite
      return paginar(grupos.slice(inicio, inicio + limite), total, pagina, limite)
    } catch (error) {
      this.logger.error(`Error al obtener grupos: ${(error as Error).message}`, (error as Error).stack)
      return paginar([], 0, pagina, limite)
    }
  }

  async getPosts(grupoId?: string, usuarioId?: string, pagina = 1, limite = 20, ordenarPor?: string, direccion?: 'asc' | 'desc', buscar?: string): Promise<RespuestaPaginada<any>> {
    try {
      let q: Query = this.db.collection(COLECCIONES.publicaciones)
      if (grupoId) q = q.where('grupoId', '==', grupoId)

      const publicacionSnap = await q.get()
      let publicaciones = publicacionSnap.docs.map(d => extraerDoc(d))

      if (buscar) {
        try {
          const termino = buscar.toLowerCase()
          const autoresIdsBusqueda = idsValidos(publicaciones.map(p => p.autorId))
          const mapaAutoresBusqueda = await obtenerDocumentosPorIds(this.db, COLECCIONES.perfiles, autoresIdsBusqueda)
          publicaciones = publicaciones.filter(p =>
            (p.contenido ?? '').toLowerCase().includes(termino) ||
            (mapaAutoresBusqueda.get(p.autorId)?.nombreCompleto ?? '').toLowerCase().includes(termino)
          )
        } catch (searchErr) {
          this.logger.error(`Error al buscar publicaciones: ${(searchErr as Error).message}`, (searchErr as Error).stack)
        }
      }

      publicaciones = ordenar(publicaciones, ordenarPor ?? 'fechaCreacion', direccion ?? 'desc')

      // Batch lookup de autores con IDs válidos únicamente
      let mapaAutores = new Map<string, any>()
      try {
        const autoresIds = idsValidos([...new Set(publicaciones.map(p => p.autorId))])
        mapaAutores = await obtenerDocumentosPorIds(this.db, COLECCIONES.perfiles, autoresIds)
      } catch (authorsErr) {
        this.logger.error(`Error al obtener autores de publicaciones: ${(authorsErr as Error).message}`, (authorsErr as Error).stack)
      }

      const enriquecidas = publicaciones.map(p => {
        const autor = mapaAutores.get(p.autorId) ?? AUTOR_NO_DISPONIBLE
        return {
          ...p,
          nombreCompleto: autor.nombreCompleto,
          urlAvatar: autor.urlAvatar ?? null,
        }
      })

      let conMeGusta: any[]
      try {
        if (usuarioId) {
          const likedSnap = await this.db.collection(COLECCIONES.meGustas)
            .where('usuarioId', '==', usuarioId).get()
          const likedSet = new Set(likedSnap.docs.map(l => l.data().publicacionId))
          conMeGusta = enriquecidas.map(p => ({ ...p, usuarioMeGusta: likedSet.has(p.id) }))
        } else {
          conMeGusta = enriquecidas.map(p => ({ ...p, usuarioMeGusta: false }))
        }
      } catch (likesErr) {
        this.logger.error(`Error al obtener me gustas: ${(likesErr as Error).message}`, (likesErr as Error).stack)
        conMeGusta = enriquecidas.map(p => ({ ...p, usuarioMeGusta: false }))
      }

      const total = conMeGusta.length
      const inicio = (pagina - 1) * limite
      return paginar(conMeGusta.slice(inicio, inicio + limite), total, pagina, limite)
    } catch (error) {
      this.logger.error(`Error al obtener publicaciones: ${(error as Error).message}`, (error as Error).stack)
      return paginar([], 0, pagina, limite)
    }
  }

  async getComments(publicacionId: string, pagina = 1, limite = 20): Promise<RespuestaPaginada<any>> {
    try {
      const snap = await this.db.collection(COLECCIONES.comentarios)
        .where('publicacionId', '==', publicacionId).get()

      let comentarios = snap.docs.map(d => extraerDoc(d))
      comentarios.sort((a, b) => (a.fechaCreacion ?? '').localeCompare(b.fechaCreacion ?? ''))

      // Batch lookup de autores con IDs válidos únicamente
      const autoresIds = idsValidos([...new Set(comentarios.map(c => c.autorId))])
      const mapaAutores = await obtenerDocumentosPorIds(this.db, COLECCIONES.perfiles, autoresIds)

      const todos = comentarios.map(c => {
        const autor = mapaAutores.get(c.autorId) ?? AUTOR_NO_DISPONIBLE
        return {
          ...c,
          nombreCompleto: autor.nombreCompleto,
          urlAvatar: autor.urlAvatar ?? null,
        }
      })

      const total = todos.length
      const inicio = (pagina - 1) * limite
      return paginar(todos.slice(inicio, inicio + limite), total, pagina, limite)
    } catch (error) {
      this.logger.error(`Error al obtener comentarios: ${(error as Error).message}`, (error as Error).stack)
      return paginar([], 0, pagina, limite)
    }
  }

  async createPost(user: CurrentUserPayload, contenido: string, grupoId?: string, mediaUrl?: string) {
    const media = normalizarMediaUrl(mediaUrl)
    verificarMultimediaPermitida(user, media)
    const ref = this.db.collection(COLECCIONES.publicaciones).doc()
    await ref.set({
      id: ref.id, autorId: user.id, contenido, grupoId: grupoId ?? null,
      mediaUrl: media,
      cantidadMeGustas: 0, fechaCreacion: new Date().toISOString(),
    })

    const autorDoc = await this.db.collection(COLECCIONES.perfiles).doc(user.id).get()
    const autor = autorDoc.exists ? (autorDoc.data() ?? null) : null
    return {
      id: ref.id, autorId: user.id, contenido, grupoId: grupoId ?? null,
      mediaUrl: media, cantidadMeGustas: 0,
      fechaCreacion: new Date().toISOString(),
      nombreCompleto: autor?.nombreCompleto ?? AUTOR_NO_DISPONIBLE.nombreCompleto,
      urlAvatar: autor?.urlAvatar ?? null,
      usuarioMeGusta: false,
    }
  }

  async createComment(publicacionId: string, autorId: string, contenido: string) {
    const ref = this.db.collection(COLECCIONES.comentarios).doc()
    await ref.set({
      id: ref.id, publicacionId, autorId, contenido,
      fechaCreacion: new Date().toISOString(),
    })

    const doc = await this.db.collection(COLECCIONES.comentarios).doc(ref.id).get()
    const autorDoc = await this.db.collection(COLECCIONES.perfiles).doc(autorId).get()
    const autor = autorDoc.exists ? (autorDoc.data() ?? null) : null
    return {
      id: doc.id, ...(doc.data() ?? {}),
      nombreCompleto: autor?.nombreCompleto ?? AUTOR_NO_DISPONIBLE.nombreCompleto,
      urlAvatar: autor?.urlAvatar ?? null,
    }
  }

  async toggleLike(usuarioId: string, publicacionId: string) {
    // ID determinista (usuario_publicación): dos toggles simultáneos no pueden
    // crear likes duplicados ni desincronizar el contador, porque la existencia
    // del like y el incremento se resuelven en una única transacción.
    const refLike = this.db.collection(COLECCIONES.meGustas).doc(`${usuarioId}_${publicacionId}`)

    return this.db.runTransaction(async (tx) => {
      const likeSnap = await tx.get(refLike)
      const refPublicacion = this.db.collection(COLECCIONES.publicaciones).doc(publicacionId)
      const pubSnap = await tx.get(refPublicacion)
      if (!pubSnap.exists) throw new NotFoundException('Publicación no encontrada')

      if (likeSnap.exists) {
        tx.delete(refLike)
        tx.update(refPublicacion, { cantidadMeGustas: FieldValue.increment(-1) })
        return { meGusta: false }
      }

      tx.set(refLike, {
        id: refLike.id, usuarioId, publicacionId, fechaCreacion: new Date().toISOString(),
      })
      tx.update(refPublicacion, { cantidadMeGustas: FieldValue.increment(1) })
      return { meGusta: true }
    })
  }

  async updatePost(id: string, user: CurrentUserPayload, contenido: string, mediaUrl?: string) {
    const media = normalizarMediaUrl(mediaUrl)
    verificarMultimediaPermitida(user, media)
    const doc = await this.db.collection(COLECCIONES.publicaciones).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Publicación no encontrada')
    const pub = doc.data() as any
    if (pub.autorId !== user.id) throw new ForbiddenException('No tienes permiso para editar esta publicación')

    const cambios: Record<string, any> = { contenido, fechaActualizacion: new Date().toISOString() }
    // Si se omite mediaUrl, se conserva el existente; si llega '' o null, se limpia
    if (mediaUrl !== undefined) cambios.mediaUrl = media
    await doc.ref.update(cambios)
    return {
      id, autorId: pub.autorId, contenido, grupoId: pub.grupoId ?? null,
      mediaUrl: mediaUrl !== undefined ? media : (pub.mediaUrl ?? null),
      cantidadMeGustas: pub.cantidadMeGustas ?? 0, fechaCreacion: pub.fechaCreacion,
    }
  }

  async removePost(id: string, usuarioId: string, rol: string) {
    const doc = await this.db.collection(COLECCIONES.publicaciones).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Publicación no encontrada')
    const pub = doc.data() as any
    if (pub.autorId !== usuarioId && rol !== 'admin') {
      throw new ForbiddenException('No tienes permiso para eliminar esta publicación')
    }
    await doc.ref.delete()
    return { eliminado: true }
  }

  async createGroup(creadorId: string, dto: any) {
    const ref = this.db.collection(COLECCIONES.grupos).doc()
    // Miembro del creador con ID determinista: evita duplicados y permite
    // atomizar la creación del grupo + su primer miembro en un solo batch.
    const refMiembro = this.db.collection(COLECCIONES.miembrosGrupo).doc(`${ref.id}_${creadorId}`)

    const batch = this.db.batch()
    batch.set(ref, {
      id: ref.id, nombre: dto.nombre, descripcion: dto.descripcion ?? '',
      esPublico: dto.esPublico !== false, creadorId,
      cantidadMiembros: 1, fechaCreacion: new Date().toISOString(),
    })
    batch.set(refMiembro, {
      id: refMiembro.id, grupoId: ref.id, usuarioId: creadorId, rol: 'admin',
      fechaCreacion: new Date().toISOString(),
    })
    await batch.commit()

    const doc = await this.db.collection(COLECCIONES.grupos).doc(ref.id).get()
    return { id: ref.id, ...(doc.data() ?? {}) } as any
  }

  async joinGroup(grupoId: string, usuarioId: string) {
    // ID determinista (grupo_usuario): dos uniones simultáneas no crean
    // membresías duplicadas ni inflan el contador, porque la verificación de
    // existencia y el incremento se resuelven en una única transacción.
    const refMiembro = this.db.collection(COLECCIONES.miembrosGrupo).doc(`${grupoId}_${usuarioId}`)

    return this.db.runTransaction(async (tx) => {
      const grupoSnap = await tx.get(this.db.collection(COLECCIONES.grupos).doc(grupoId))
      if (!grupoSnap.exists) throw new NotFoundException('Grupo no encontrado')

      const miembroSnap = await tx.get(refMiembro)
      if (miembroSnap.exists) return { yaMiembro: true }

      tx.set(refMiembro, {
        id: refMiembro.id, grupoId, usuarioId, rol: 'miembro',
        fechaCreacion: new Date().toISOString(),
      })
      tx.update(this.db.collection(COLECCIONES.grupos).doc(grupoId), {
        cantidadMiembros: FieldValue.increment(1),
      })
      return { unido: true }
    })
  }

  async leaveGroup(grupoId: string, usuarioId: string) {
    // Mismo ID determinista que joinGroup: la salida es atómica con el
    // decremento del contador y no puede dejar la membresía a medias.
    const refMiembro = this.db.collection(COLECCIONES.miembrosGrupo).doc(`${grupoId}_${usuarioId}`)

    return this.db.runTransaction(async (tx) => {
      const grupoSnap = await tx.get(this.db.collection(COLECCIONES.grupos).doc(grupoId))
      if (!grupoSnap.exists) throw new NotFoundException('Grupo no encontrado')

      const miembroSnap = await tx.get(refMiembro)
      if (!miembroSnap.exists) throw new NotFoundException('No eres miembro de este grupo')
      if (miembroSnap.data()?.rol === 'admin') {
        throw new ForbiddenException('El creador del grupo no puede salir. Elimina el grupo en su lugar.')
      }

      tx.delete(refMiembro)
      tx.update(this.db.collection(COLECCIONES.grupos).doc(grupoId), {
        cantidadMiembros: FieldValue.increment(-1),
      })
      return { salido: true }
    })
  }

  async getStats() {
    const [gruposSnap, publicacionesSnap, comentariosSnap] = await Promise.all([
      this.db.collection(COLECCIONES.grupos).get(),
      this.db.collection(COLECCIONES.publicaciones).get(),
      this.db.collection(COLECCIONES.comentarios).get(),
    ])
    return {
      totalGrupos: gruposSnap.size,
      totalPublicaciones: publicacionesSnap.size,
      totalComentarios: comentariosSnap.size,
    }
  }

  /**
   * Devuelve miembros/testimonios públicos de la comunidad.
   * Solo usuarios activos que tengan una bio configurada.
   */
  async getMembers(pagina = 1, limite = 20): Promise<RespuestaPaginada<any>> {
    try {
      const snap = await this.db.collection(COLECCIONES.perfiles)
        .where('activo', '==', true)
        .get()

      let miembros = snap.docs.map(d => {
        const data = d.data() ?? {}
        return {
          id: d.id,
          nombreCompleto: data.nombreCompleto ?? AUTOR_NO_DISPONIBLE.nombreCompleto,
          rol: data.rol ?? null,
          profesion: data.profesion ?? null,
          bio: data.bio ?? null,
          ciudad: data.ciudad ?? null,
          estado: data.estado ?? null,
          urlAvatar: data.urlAvatar ?? null,
        }
      })

      // Solo usuarios que tengan bio (testimonios)
      miembros = miembros.filter(m => m.bio)

      // Aleatorizar para que la sección se sienta dinámica
      miembros.sort(() => Math.random() - 0.5)

      const total = miembros.length
      const inicio = (pagina - 1) * limite
      return paginar(miembros.slice(inicio, inicio + limite), total, pagina, limite)
    } catch (error) {
      this.logger.error(`Error al obtener miembros/testimonios: ${(error as Error).message}`, (error as Error).stack)
      return paginar([], 0, pagina, limite)
    }
  }
}
