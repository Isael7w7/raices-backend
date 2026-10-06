import { Injectable, Inject, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { Firestore, FieldValue, Query, DocumentData } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { obtenerDocumentosPorIds } from '../../common/utils/firestore-helpers'
import { coincideBusqueda } from '../../common/utils/busqueda'
import type { PerfilDoc, InstitucionDoc } from '../../common/interfaces/firestore-documents.interface'
import { paginar, ordenar, RespuestaPaginada } from '../../common/dto/paginacion.dto'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { verificarMultimediaPermitida, normalizarMediaUrl } from '../../common/utils/multimedia-permiso'
import { tieneMultimediaGaleria, construirItemGaleria, ItemGaleria } from './multimedia-galeria'
import { CrearGrupoDto } from './dto/crear-grupo.dto'
import { CrearForoDto } from './dto/crear-foro.dto'
import { CrearRespuestaForoDto } from './dto/crear-respuesta-foro.dto'

/** Mapa de etiquetas de rol para identificación visual */
const ETIQUETAS_ROL: Record<string, string> = {
  pcd: 'Persona con discapacidad',
  padre_tutor: 'Padre / Tutor',
  tutor: 'Padre / Tutor',
  institucion: 'Institución',
  especialista: 'Especialista',
  empresa: 'Empresa',
  admin: 'Administrador',
}

/** Etiqueta de rol amigable para mostrar en la UI */
export function etiquetaRol(rol: string | undefined | null): string | null {
  return rol ? (ETIQUETAS_ROL[rol] ?? rol) : null
}

/** Objeto de autor por defecto cuando el autor no existe o está deshabilitado */
const AUTOR_NO_DISPONIBLE = Object.freeze({
  nombreCompleto: 'Usuario no disponible',
  urlAvatar: null,
  rol: null,
})

/** Spread seguro de un snapshot de Firestore; retorna objeto vacío si data() es undefined */
function extraerDoc<T = Record<string, unknown>>(d: { id: string; data(): DocumentData | undefined }): T & { id: string } {
  return { id: d.id, ...(d.data() ?? {}) } as T & { id: string }
}

/** Documento de la colección `grupos`. */
interface GrupoDoc {
  nombre?: string
  descripcion?: string
  cantidadMiembros?: number
  fechaCreacion?: string
  [key: string]: unknown
}

/** Documento de la colección `publicaciones`. */
interface PublicacionDoc {
  autorId: string
  contenido?: string
  mediaUrl?: string | null
  categoriaCreativa?: string | null
  fechaCreacion?: string
  [key: string]: unknown
}

/** Documento de la colección `comentarios`. */
interface ComentarioDoc {
  autorId: string
  contenido?: string
  fechaCreacion?: string
  [key: string]: unknown
}

/** Documento de la colección `foros`. */
interface ForoDoc {
  titulo?: string
  descripcion?: string
  institucionId: string
  preguntasDetonantes?: string[]
  activo?: boolean
  fechaCreacion?: string
  [key: string]: unknown
}

/** Documento de la colección `respuestasForo`. */
interface RespuestaForoDoc {
  autorId: string
  preguntaIndex?: number
  fechaCreacion?: string
  [key: string]: unknown
}

/** Miembro/testimonio para la vista pública de la comunidad. */
interface MiembroComunidad {
  id: string
  nombreCompleto: string
  rol: string | null
  profesion: string | null
  bio: string | null
  ciudad: string | null
  estado: string | null
  urlAvatar: string | null
}

/** Filtra valores falsy (null / undefined / '') de un array y retorna string[] limpio */
function idsValidos(ids: (string | undefined | null)[]): string[] {
  return ids.filter((id): id is string => !!id)
}

@Injectable()
export class CommunityService {
  private readonly logger = new Logger(CommunityService.name)

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async getGroups(pagina = 1, limite = 20, ordenarPor?: string, direccion?: 'asc' | 'desc', buscar?: string): Promise<RespuestaPaginada<GrupoDoc & { id: string }>> {
    try {
      const snap = await this.db.collection(COLECCIONES.grupos)
        .where('esPublico', '==', true).get()

      let grupos = snap.docs.map(d => extraerDoc<GrupoDoc>(d))

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
        grupos.sort((a, b) => ((b.cantidadMiembros as number) ?? 0) - ((a.cantidadMiembros as number) ?? 0))
      }

      const total = grupos.length
      const inicio = (pagina - 1) * limite
      return paginar(grupos.slice(inicio, inicio + limite), total, pagina, limite)
    } catch (error) {
      this.logger.error(`Error al obtener grupos: ${(error as Error).message}`, (error as Error).stack)
      return paginar([], 0, pagina, limite)
    }
  }

  async getPosts(grupoId?: string, usuarioId?: string, pagina = 1, limite = 20, ordenarPor?: string, direccion?: 'asc' | 'desc', buscar?: string): Promise<RespuestaPaginada<PublicacionDoc & { id: string }>> {
    try {
      let q: Query = this.db.collection(COLECCIONES.publicaciones)
      if (grupoId) q = q.where('grupoId', '==', grupoId)

      const publicacionSnap = await q.get()
      let publicaciones = publicacionSnap.docs.map(d => extraerDoc<PublicacionDoc>(d))

      if (buscar) {
        try {
          const termino = buscar.toLowerCase()
          const autoresIdsBusqueda = idsValidos(publicaciones.map(p => p.autorId))
          const mapaAutoresBusqueda = await obtenerDocumentosPorIds<PerfilDoc>(this.db, COLECCIONES.perfiles, autoresIdsBusqueda)
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
      let mapaAutores = new Map<string, PerfilDoc>()
      try {
        const autoresIds = idsValidos([...new Set(publicaciones.map(p => p.autorId))])
        mapaAutores = await obtenerDocumentosPorIds<PerfilDoc>(this.db, COLECCIONES.perfiles, autoresIds)
      } catch (authorsErr) {
        this.logger.error(`Error al obtener autores de publicaciones: ${(authorsErr as Error).message}`, (authorsErr as Error).stack)
      }

      const enriquecidas = publicaciones.map(p => {
        const autor = mapaAutores.get(p.autorId) ?? AUTOR_NO_DISPONIBLE
        return {
          ...p,
          nombreCompleto: autor.nombreCompleto,
          rol: autor.rol ?? null,
          etiquetaRol: etiquetaRol(autor.rol),
          urlAvatar: autor.urlAvatar ?? null,
        }
      })

      let conMeGusta: (PublicacionDoc & { id: string; usuarioMeGusta: boolean })[]
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

  async getComments(publicacionId: string, pagina = 1, limite = 20): Promise<RespuestaPaginada<ComentarioDoc & { id: string }>> {
    try {
      const snap = await this.db.collection(COLECCIONES.comentarios)
        .where('publicacionId', '==', publicacionId).get()

      const comentarios = snap.docs.map(d => extraerDoc<ComentarioDoc>(d))
      comentarios.sort((a, b) => (a.fechaCreacion ?? '').localeCompare(b.fechaCreacion ?? ''))

      // Batch lookup de autores con IDs válidos únicamente
      const autoresIds = idsValidos([...new Set(comentarios.map(c => c.autorId))])
      const mapaAutores = await obtenerDocumentosPorIds<PerfilDoc>(this.db, COLECCIONES.perfiles, autoresIds)

      const todos = comentarios.map(c => {
        const autor = mapaAutores.get(c.autorId) ?? AUTOR_NO_DISPONIBLE
        return {
          ...c,
          nombreCompleto: autor.nombreCompleto,
          rol: autor.rol ?? null,
          etiquetaRol: etiquetaRol(autor.rol),
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

  async createPost(
    user: CurrentUserPayload,
    contenido: string,
    grupoId?: string,
    mediaUrl?: string,
    categoriaCreativa?: string,
    exclusivoPadres?: boolean,
  ) {
    const media = normalizarMediaUrl(mediaUrl)
    verificarMultimediaPermitida(user, media)
    const ref = this.db.collection(COLECCIONES.publicaciones).doc()
    await ref.set({
      id: ref.id, autorId: user.id, contenido, grupoId: grupoId ?? null,
      mediaUrl: media,
      categoriaCreativa: categoriaCreativa ?? null,
      exclusivoPadres: exclusivoPadres === true,
      cantidadMeGustas: 0, fechaCreacion: new Date().toISOString(),
    })

    const autorDoc = await this.db.collection(COLECCIONES.perfiles).doc(user.id).get()
    const autor = autorDoc.exists ? (autorDoc.data() ?? null) : null
    return {
      id: ref.id, autorId: user.id, contenido, grupoId: grupoId ?? null,
      mediaUrl: media,
      categoriaCreativa: categoriaCreativa ?? null,
      exclusivoPadres: exclusivoPadres === true,
      cantidadMeGustas: 0,
      fechaCreacion: new Date().toISOString(),
      nombreCompleto: autor?.nombreCompleto ?? AUTOR_NO_DISPONIBLE.nombreCompleto,
      rol: autor?.rol ?? null,
      etiquetaRol: etiquetaRol(autor?.rol),
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
    const pub = doc.data() as Omit<PublicacionDoc, 'id'>
    if (pub.autorId !== user.id) throw new ForbiddenException('No tienes permiso para editar esta publicación')

    const cambios: Record<string, unknown> = { contenido, fechaActualizacion: new Date().toISOString() }
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
    const pub = doc.data() as Omit<PublicacionDoc, 'id'>
    if (pub.autorId !== usuarioId && rol !== 'admin') {
      throw new ForbiddenException('No tienes permiso para eliminar esta publicación')
    }
    await doc.ref.delete()
    return { eliminado: true }
  }

  async createGroup(creadorId: string, dto: CrearGrupoDto) {
    const ref = this.db.collection(COLECCIONES.grupos).doc()
    // Miembro del creador con ID determinista: evita duplicados y permite
    // atomizar la creación del grupo + su primer miembro en un solo batch.
    const refMiembro = this.db.collection(COLECCIONES.miembrosGrupo).doc(`${ref.id}_${creadorId}`)

    const batch = this.db.batch()
    batch.set(ref, {
      id: ref.id, nombre: dto.nombre, descripcion: dto.descripcion ?? '',
      esPublico: dto.esPublico !== false, exclusivoPadres: dto.exclusivoPadres === true,
      creadorId,
      cantidadMiembros: 1, fechaCreacion: new Date().toISOString(),
    })
    batch.set(refMiembro, {
      id: refMiembro.id, grupoId: ref.id, usuarioId: creadorId, rol: 'admin',
      fechaCreacion: new Date().toISOString(),
    })
    await batch.commit()

    const doc = await this.db.collection(COLECCIONES.grupos).doc(ref.id).get()
    return { id: ref.id, ...(doc.data() ?? {}) } as ForoDoc & { id: string }
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
   * Sin `buscar`: solo usuarios activos que tengan bio (testimonios).
   * Con `buscar`: busca entre TODOS los perfiles activos por nombre/ciudad/
   * profesión con coincidencia parcial insensible a mayúsculas y acentos
   * (los usuarios sin bio también deben ser localizables para iniciar chats).
   */
  async getMembers(pagina = 1, limite = 20, buscar?: string): Promise<RespuestaPaginada<MiembroComunidad>> {
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
      }) as MiembroComunidad[]

      if (buscar) {
        // Búsqueda (modal "Nuevo mensaje"): cualquier perfil activo, no solo
        // testimonios, para que un usuario sin bio también sea localizable.
        miembros = miembros.filter(m => coincideBusqueda(buscar, m.nombreCompleto, m.ciudad, m.profesion))
      } else {
        // Listado de testimonios: solo usuarios que tengan bio configurada
        miembros = miembros.filter(m => m.bio)
      }

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

  // ═══════════════════════════════════════════════════════════════════
  // Foros Institucionales (tipo Classroom)
  // ═══════════════════════════════════════════════════════════════════

  async createForo(user: CurrentUserPayload, dto: CrearForoDto) {
    const perfilDoc = await this.db.collection(COLECCIONES.perfiles).doc(user.id).get()
    const perfil = perfilDoc.exists ? perfilDoc.data() : null
    const institucionId = perfil?.institucionId ?? user.id

    const ref = this.db.collection(COLECCIONES.foros).doc()
    const foroData = {
      id: ref.id,
      titulo: dto.titulo,
      descripcion: dto.descripcion ?? '',
      institucionId,
      creadorId: user.id,
      preguntasDetonantes: dto.preguntasDetonantes,
      exclusivoPadres: dto.exclusivoPadres === true,
      activo: true,
      fechaCreacion: new Date().toISOString(),
    }
    await ref.set(foroData)
    return { ...foroData, nombreInstitucion: perfil?.nombreCompleto ?? null }
  }

  async getForos(pagina = 1, limite = 20, buscar?: string): Promise<RespuestaPaginada<ForoDoc & { id: string }>> {
    const snap = await this.db.collection(COLECCIONES.foros)
      .where('activo', '==', true).get()
    let foros = snap.docs.map(d => extraerDoc<ForoDoc>(d))

    if (buscar) {
      const termino = buscar.toLowerCase()
      foros = foros.filter(f =>
        (f.titulo ?? '').toLowerCase().includes(termino) ||
        (f.descripcion ?? '').toLowerCase().includes(termino)
      )
    }

    // Enriquecer con nombre de institución
    const instIds = [...new Set(foros.map(f => f.institucionId).filter(Boolean))] as string[]
    const mapaInst = instIds.length > 0
      ? await obtenerDocumentosPorIds<InstitucionDoc>(this.db, COLECCIONES.instituciones, instIds)
      : new Map<string, InstitucionDoc>()

    foros = foros.map(f => ({
      ...f,
      nombreInstitucion: mapaInst.get(f.institucionId)?.nombre ?? null,
    }))

    foros.sort((a, b) => (b.fechaCreacion ?? '').localeCompare(a.fechaCreacion ?? ''))
    const total = foros.length
    const inicio = (pagina - 1) * limite
    return paginar(foros.slice(inicio, inicio + limite), total, pagina, limite)
  }

  async getForoById(foroId: string) {
    const doc = await this.db.collection(COLECCIONES.foros).doc(foroId).get()
    if (!doc.exists) throw new NotFoundException('Foro no encontrado')
    const foro = extraerDoc<ForoDoc>(doc)

    // Obtener respuestas del foro
    const respuestasSnap = await this.db.collection(COLECCIONES.respuestasForo)
      .where('foroId', '==', foroId).get()
    const respuestas = respuestasSnap.docs.map(d => extraerDoc<RespuestaForoDoc>(d))

    // Enriquecer respuestas con datos de autor
    const autorIds = [...new Set(respuestas.map(r => r.autorId).filter(Boolean))] as string[]
    const mapaAutores = autorIds.length > 0
      ? await obtenerDocumentosPorIds<PerfilDoc>(this.db, COLECCIONES.perfiles, autorIds)
      : new Map<string, PerfilDoc>()

    const respuestasEnriquecidas = respuestas.map(r => {
      const autor = mapaAutores.get(r.autorId) ?? AUTOR_NO_DISPONIBLE
      return {
        ...r,
        nombreCompleto: autor.nombreCompleto,
        rol: autor.rol ?? null,
        etiquetaRol: etiquetaRol(autor.rol),
        urlAvatar: autor.urlAvatar ?? null,
      }
    })

    // Agrupar respuestas por pregunta detonante
    const preguntasConRespuestas = (foro.preguntasDetonantes ?? []).map((pregunta: string, idx: number) => ({
      pregunta,
      respuestas: respuestasEnriquecidas.filter(r => r.preguntaIndex === idx),
    }))

    // Nombre de institución
    const instDoc = foro.institucionId
      ? await this.db.collection(COLECCIONES.instituciones).doc(foro.institucionId).get()
      : null

    return {
      ...foro,
      nombreInstitucion: instDoc?.exists ? instDoc.data()?.nombre ?? null : null,
      preguntasConRespuestas,
    }
  }

  async createRespuestaForo(user: CurrentUserPayload, foroId: string, dto: CrearRespuestaForoDto) {
    // Verificar que el foro exista y esté activo
    const foroDoc = await this.db.collection(COLECCIONES.foros).doc(foroId).get()
    if (!foroDoc.exists) throw new NotFoundException('Foro no encontrado')
    const foro = foroDoc.data()!
    if (!foro.activo) throw new BadRequestException('Este foro no está activo')

    // Verificar que el índice de pregunta sea válido
    const preguntas = foro.preguntasDetonantes ?? []
    if (dto.preguntaIndex >= preguntas.length) {
      throw new BadRequestException(`Índice de pregunta inválido. El foro tiene ${preguntas.length} preguntas detonantes (0-${preguntas.length - 1})`)
    }

    // Verificar exclusivoPadres: solo padres/tutores pueden responder
    if (foro.exclusivoPadres && user.rol !== 'padre_tutor' && user.rol !== 'admin') {
      throw new ForbiddenException('Este foro es exclusivo para padres/tutores')
    }

    const ref = this.db.collection(COLECCIONES.respuestasForo).doc()
    await ref.set({
      id: ref.id,
      foroId,
      preguntaIndex: dto.preguntaIndex,
      autorId: user.id,
      contenido: dto.contenido,
      fechaCreacion: new Date().toISOString(),
    })

    const autorDoc = await this.db.collection(COLECCIONES.perfiles).doc(user.id).get()
    const autor = autorDoc.exists ? (autorDoc.data() ?? null) : null

    return {
      id: ref.id,
      foroId,
      preguntaIndex: dto.preguntaIndex,
      autorId: user.id,
      contenido: dto.contenido,
      fechaCreacion: new Date().toISOString(),
      nombreCompleto: autor?.nombreCompleto ?? AUTOR_NO_DISPONIBLE.nombreCompleto,
      rol: autor?.rol ?? null,
      etiquetaRol: etiquetaRol(autor?.rol),
      urlAvatar: autor?.urlAvatar ?? null,
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Espacio "Conectemos" (Contenido Creativo PCD)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Galería "Conectemos": feed EXCLUSIVAMENTE multimedia.
   *
   * Solo publicaciones con `categoriaCreativa` que además tengan al menos un
   * adjunto visual real (imagen, dibujo, banner, video...). Se excluyen las de
   * solo texto, las que traen arreglos vacíos (`imagenes: []`, `multimedia: []`,
   * `archivos: []`) y las cuyos adjuntos son únicamente documentos no gráficos.
   *
   * Cada item incluye `recursosVisuales` (URLs) y `urlThumbnail` para poder
   * renderizar la cuadrícula/feed sin consultas extra.
   */
  async getConectemosPosts(pagina = 1, limite = 20, categoriaCreativa?: string, buscar?: string): Promise<RespuestaPaginada<PublicacionDoc & { id: string } & ItemGaleria>> {
    const q: Query = this.db.collection(COLECCIONES.publicaciones)
      .where('categoriaCreativa', '!=', null)

    const snap = await q.get()
    let publicaciones = snap.docs
      .map(d => extraerDoc<PublicacionDoc>(d))
      .filter(tieneMultimediaGaleria)

    if (categoriaCreativa) {
      publicaciones = publicaciones.filter(p => p.categoriaCreativa === categoriaCreativa)
    }
    if (buscar) {
      const termino = buscar.toLowerCase()
      publicaciones = publicaciones.filter(p =>
        (p.contenido ?? '').toLowerCase().includes(termino)
      )
    }

    publicaciones = ordenar(publicaciones, 'fechaCreacion', 'desc')

    // Enriquecer con datos de autor
    const autoresIds = [...new Set(publicaciones.map(p => p.autorId).filter(Boolean))] as string[]
    const mapaAutores = autoresIds.length > 0
      ? await obtenerDocumentosPorIds<PerfilDoc>(this.db, COLECCIONES.perfiles, autoresIds)
      : new Map<string, PerfilDoc>()

    const enriquecidas = publicaciones.map(p => {
      const autor = mapaAutores.get(p.autorId) ?? AUTOR_NO_DISPONIBLE
      return {
        ...construirItemGaleria(p),
        nombreCompleto: autor.nombreCompleto,
        rol: autor.rol ?? null,
        etiquetaRol: etiquetaRol(autor.rol),
        urlAvatar: autor.urlAvatar ?? null,
      }
    })

    const total = enriquecidas.length
    const inicio = (pagina - 1) * limite
    return paginar(enriquecidas.slice(inicio, inicio + limite), total, pagina, limite)
  }

  // ═══════════════════════════════════════════════════════════════════
  // Feed Mixto (Comunidad + Recomendaciones de Ruta)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Devuelve un feed mixto: 50% publicaciones de la comunidad (más recientes)
   * y 50% entidades inyectadas desde la ruta activa del usuario (instituciones
   * cercanas y vacantes relevantes al paso actual).
   *
   * Las entidades de ruta se enriquecen como items tipo "recomendación" con
   * metadatos que permiten distinguirlas visualmente en el frontend.
   */
  async getMixtoFeed(usuarioId: string, pagina = 1, limite = 12): Promise<{
    items: Array<Record<string, unknown>>
    pagina: number
    limite: number
    total: number
    totalPublicaciones: number
    totalEntidades: number
  }> {
    try {
      // 1. Obtener publicaciones recientes de la comunidad (50%)
      const publicacionesResult = await this.getPosts(undefined, usuarioId, 1, limite * 2, 'fechaCreacion', 'desc')
      const publicaciones = publicacionesResult.datos.slice(0, Math.ceil(limite / 2))

      // 2. Obtener la ruta activa del usuario para extraer entidades recomendadas
      const rutasSnap = await this.db.collection(COLECCIONES.rutasDesarrollo)
        .where('usuarioId', '==', usuarioId)
        .where('estado', '==', 'activa')
        .get()

      let pasoActualTitulo: string | undefined
      const entidades: Array<Record<string, unknown>> = []
      const vacantes: Array<Record<string, unknown>> = []

      if (!rutasSnap.empty) {
        // Tomar la ruta más reciente
        const rutaDocs = rutasSnap.docs.map(d => ({
          id: d.id,
          datos: d.data() as Record<string, unknown>,
        }))
        rutaDocs.sort((a, b) => String(b.datos.fechaCreacion ?? '').localeCompare(String(a.datos.fechaCreacion ?? '')))
        const rutaDoc = rutaDocs[0]

        // Obtener pasos y encontrar el paso actual
        const pasosSnap = await this.db.collection(COLECCIONES.pasosRuta)
          .where('rutaId', '==', rutaDoc.id)
          .get()
        const pasos = pasosSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Record<string, unknown>))
          .sort((a, b) => Number(a.orden ?? 0) - Number(b.orden ?? 0))
        const pasoActual = pasos.find(p => !p.completado)
        pasoActualTitulo = pasoActual?.titulo as string | undefined

        // Cargar perfil para ciudad
        const registroDoc = await this.db.collection(COLECCIONES.perfiles).doc(usuarioId).get()
        const registro = registroDoc.data() as Record<string, unknown> | undefined
        const ciudad = registro?.ciudad as string ?? ''

        // Obtener entidades locales (reutilizando lógica de RoutesService vía KnowledgeBase)
        // Nota: CommunityService no tiene acceso directo a KnowledgeBase, así que
        // replicamos la consulta básica de instituciones y vacantes.
        try {
          const instSnap = await this.db.collection(COLECCIONES.instituciones)
            .where('activa', '==', true)
            .where('ciudad', '==', ciudad)
            .get()

          const institucionesFiltradas = instSnap.docs.map(d => d.data() ?? {})
            .filter((inst: Record<string, unknown>) => inst.tipo !== 'empresa')
            .slice(0, 4)
          entidades.push(...institucionesFiltradas)
        } catch (err) {
          this.logger.warn(`getMixtoFeed: error obteniendo instituciones: ${err instanceof Error ? err.message : String(err)}`)
        }

        try {
          const vacSnap = await this.db.collection(COLECCIONES.vacantes)
            .where('activa', '==', true)
            .get()

          const vacantesFiltradas = vacSnap.docs.map(d => d.data() ?? {})
            .filter((v: Record<string, unknown>) => {
              const vCiudad = (v.ciudad as string) ?? ''
              return vCiudad && vCiudad.toLowerCase().includes(ciudad.toLowerCase())
            })
            .slice(0, 4)
          vacantes.push(...vacantesFiltradas)
        } catch (err) {
          this.logger.warn(`getMixtoFeed: error obteniendo vacantes: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      // 3. Transformar publicaciones a items del feed
      const itemsPublicaciones: Array<Record<string, unknown>> = publicaciones.map((p: typeof publicaciones[number]) => ({
        tipo: 'publicacion',
        id: p.id,
        titulo: p.contenido ?? '',
        contenido: p.contenido,
        autor: p.nombreCompleto,
        autorId: p.autorId,
        rol: p.rol ?? null,
        etiquetaRol: p.etiquetaRol ?? null,
        urlAvatar: p.urlAvatar ?? null,
        mediaUrl: p.mediaUrl ?? null,
        categoria: p.categoriaCreativa ?? undefined,
        categoriaLabel: p.categoriaCreativa ?? undefined,
        fechaCreacion: p.fechaCreacion ?? undefined,
        usuarioMeGusta: p.usuarioMeGusta ?? false,
        cantidadMeGustas: p.cantidadMeGustas ?? 0,
        fuenteRuta: false,
      }))

      // 4. Transformar instituciones a items del feed
      const itemsInstituciones: Array<Record<string, unknown>> = entidades.map(inst => ({
        tipo: 'institucion',
        id: String(inst.id),
        titulo: (inst.nombre as string) ?? 'Sin nombre',
        categoria: (inst.categoria as string) ?? 'general',
        categoriaLabel: inst.categoria ? this.etiquetaCategoria(String(inst.categoria)) : undefined,
        distancia: 'en tu ciudad',
        fuenteRuta: true,
        pasoActualTitulo,
      }))

      // 5. Transformar vacantes a items del feed
      const itemsVacantes: Array<Record<string, unknown>> = vacantes.map(vac => ({
        tipo: 'vacante',
        id: String(vac.id),
        titulo: (vac.titulo as string) ?? 'Sin título',
        modalidad: (vac.modalidad as string) ?? 'no especificada',
        ciudad: (vac.ciudad as string) ?? 'no especificada',
        fuenteRuta: true,
        pasoActualTitulo,
      }))

      // 6. Mezclar: 50% publicaciones + 50% entidades (instituciones + vacantes)
      const entidadesTotales = itemsInstituciones.length + itemsVacantes.length
      const itemsEntidades: Array<Record<string, unknown>> = [...itemsInstituciones, ...itemsVacantes]

      // Si no hay entidades, mostrar solo publicaciones con flag
      const items: Array<Record<string, unknown>> = entidadesTotales > 0
        ? this.mezclarItems(itemsPublicaciones, itemsEntidades, limite)
        : itemsPublicaciones

      const totalPublicaciones = publicacionesResult.total
      const totalEntidades = entidadesTotales

      const total = items.length
      const inicio = (pagina - 1) * limite

      return {
        items: items.slice(inicio, inicio + limite),
        pagina,
        limite,
        total,
        totalPublicaciones,
        totalEntidades,
      }
    } catch (error) {
      this.logger.error(`Error al obtener feed mixto: ${(error as Error).message}`, (error as Error).stack)
      return {
        items: [],
        pagina,
        limite,
        total: 0,
        totalPublicaciones: 0,
        totalEntidades: 0,
      }
    }
  }

  /**
   * Etiqueta amigable para categorías de instituciones.
   */
  private etiquetaCategoria(cat: string): string {
    const etiquetas: Record<string, string> = {
      terapia: 'Terapia',
      educacion: 'Educación',
      funcional: 'Funcional',
      laboral: 'Laboral',
      social: 'Social',
      salud: 'Salud',
      general: 'General',
    }
    return etiquetas[cat.toLowerCase()] ?? cat.charAt(0).toUpperCase() + cat.slice(1)
  }

  /**
   * Mezcla publicaciones con entidades de ruta manteniendo la proporción ~50/50.
   * Intercala items para que el feed no se sienta segmentado.
   */
  private mezclarItems(
    publicaciones: Array<Record<string, unknown>>,
    entidades: Array<Record<string, unknown>>,
    limite: number,
  ): Array<Record<string, unknown>> {
    const resultado: Array<Record<string, unknown>> = []
    const maxPublicaciones = Math.ceil(limite / 2)
    const maxEntidades = limite - maxPublicaciones

    const pubs = publicaciones.slice(0, maxPublicaciones)
    const ents = entidades.slice(0, maxEntidades)

    // Intercalar: empezar con publicación si hay más publicaciones, sino con entidad
    let i = 0, j = 0, k = 0
    while (i < pubs.length || j < ents.length) {
      if (k % 2 === 0 && i < pubs.length) {
        resultado.push(pubs[i] as unknown as typeof resultado[number])
        i++
      } else if (j < ents.length) {
        resultado.push(ents[j] as unknown as typeof resultado[number])
        j++
      } else if (i < pubs.length) {
        resultado.push(pubs[i] as unknown as typeof resultado[number])
        i++
      }
      k++
    }

    return resultado
  }
}
