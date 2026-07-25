import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common'
import { Firestore, FieldValue, Query } from 'firebase-admin/firestore'
import { v4 as uuid } from 'uuid'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { obtenerDocumentosPorIds } from '../../common/utils/firestore-helpers'
import { paginar, RespuestaPaginada } from '../../common/dto/paginacion.dto'

@Injectable()
export class CommunityService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async getGroups(pagina = 1, limite = 20): Promise<RespuestaPaginada<any>> {
    const snap = await this.db.collection(COLECCIONES.grupos)
      .where('esPublico', '==', true).get()

    // Quitamos .orderBy() de Firestore para evitar error de índice compuesto
    const grupos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    grupos.sort((a: any, b: any) => (b.cantidadMiembros ?? 0) - (a.cantidadMiembros ?? 0))

    const total = grupos.length
    const inicio = (pagina - 1) * limite
    return paginar(grupos.slice(inicio, inicio + limite), total, pagina, limite)
  }

  async getPosts(grupoId?: string, usuarioId?: string, pagina = 1, limite = 20): Promise<RespuestaPaginada<any>> {
    let q: Query = this.db.collection(COLECCIONES.publicaciones)
    if (grupoId) q = q.where('grupoId', '==', grupoId)

    // Quitamos .orderBy() de Firestore para evitar error de índice compuesto
    const publicacionSnap = await q.get()
    const publicaciones = publicacionSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    // Ordenar en memoria
    publicaciones.sort((a, b) => (b.fechaCreacion ?? '').localeCompare(a.fechaCreacion ?? ''))

    // Batch lookup de autores en lugar de N+1 queries
    const autoresIds = [...new Set(publicaciones.map(p => p.autorId))]
    const mapaAutores = await obtenerDocumentosPorIds(this.db, COLECCIONES.perfiles, autoresIds)

    const enriquecidas = publicaciones.map(p => ({
      ...p,
      nombreCompleto: mapaAutores.get(p.autorId)?.nombreCompleto ?? null,
      urlAvatar: mapaAutores.get(p.autorId)?.urlAvatar ?? null,
    }))

    let conMeGusta: any[]
    if (usuarioId) {
      const likedSnap = await this.db.collection(COLECCIONES.meGustas)
        .where('usuarioId', '==', usuarioId).get()
      const likedSet = new Set(likedSnap.docs.map(l => l.data().publicacionId))
      conMeGusta = enriquecidas.map(p => ({ ...p, usuarioMeGusta: likedSet.has(p.id) }))
    } else {
      conMeGusta = enriquecidas.map(p => ({ ...p, usuarioMeGusta: false }))
    }

    const total = conMeGusta.length
    const inicio = (pagina - 1) * limite
    return paginar(conMeGusta.slice(inicio, inicio + limite), total, pagina, limite)
  }

  async getComments(publicacionId: string, pagina = 1, limite = 20): Promise<RespuestaPaginada<any>> {
    const snap = await this.db.collection(COLECCIONES.comentarios)
      .where('publicacionId', '==', publicacionId).get()

    // Quitamos .orderBy() de Firestore para evitar error de índice compuesto
    const comentarios = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
    comentarios.sort((a, b) => (a.fechaCreacion ?? '').localeCompare(b.fechaCreacion ?? ''))

    // Batch lookup de autores en lugar de N+1 queries
    const autoresIds = [...new Set(comentarios.map(c => c.autorId))]
    const mapaAutores = await obtenerDocumentosPorIds(this.db, COLECCIONES.perfiles, autoresIds)

    const todos = comentarios.map(c => ({
      ...c,
      nombreCompleto: mapaAutores.get(c.autorId)?.nombreCompleto ?? null,
      urlAvatar: mapaAutores.get(c.autorId)?.urlAvatar ?? null,
    }))

    const total = todos.length
    const inicio = (pagina - 1) * limite
    return paginar(todos.slice(inicio, inicio + limite), total, pagina, limite)
  }

  async createPost(autorId: string, contenido: string, grupoId?: string) {
    const id = uuid()
    await this.db.collection(COLECCIONES.publicaciones).doc(id).set({
      id, autorId, contenido, grupoId: grupoId ?? null,
      cantidadMeGustas: 0, fechaCreacion: new Date().toISOString(),
    })

    const autorDoc = await this.db.collection(COLECCIONES.perfiles).doc(autorId).get()
    const autor = autorDoc.data()
    return { id, autorId, contenido, grupoId: grupoId ?? null, cantidadMeGustas: 0,
      fechaCreacion: new Date().toISOString(), nombreCompleto: autor?.nombreCompleto ?? null,
      urlAvatar: autor?.urlAvatar ?? null, usuarioMeGusta: false }
  }

  async createComment(publicacionId: string, autorId: string, contenido: string) {
    const id = uuid()
    await this.db.collection(COLECCIONES.comentarios).doc(id).set({
      id, publicacionId, autorId, contenido,
      fechaCreacion: new Date().toISOString(),
    })

    const doc = await this.db.collection(COLECCIONES.comentarios).doc(id).get()
    const autorDoc = await this.db.collection(COLECCIONES.perfiles).doc(autorId).get()
    const autor = autorDoc.data()
    return { id: doc.id, ...doc.data()!, nombreCompleto: autor?.nombreCompleto ?? null, urlAvatar: autor?.urlAvatar ?? null }
  }

  async toggleLike(usuarioId: string, publicacionId: string) {
    const snap = await this.db.collection(COLECCIONES.meGustas)
      .where('usuarioId', '==', usuarioId)
      .where('publicacionId', '==', publicacionId)
      .limit(1).get()

    if (!snap.empty) {
      await snap.docs[0].ref.delete()
      await this.db.collection(COLECCIONES.publicaciones).doc(publicacionId).update({
        cantidadMeGustas: FieldValue.increment(-1),
      })
      return { meGusta: false }
    }

    await this.db.collection(COLECCIONES.meGustas).doc(uuid()).set({
      usuarioId, publicacionId,
    })
    await this.db.collection(COLECCIONES.publicaciones).doc(publicacionId).update({
      cantidadMeGustas: FieldValue.increment(1),
    })
    return { meGusta: true }
  }

  async updatePost(id: string, usuarioId: string, contenido: string) {
    const doc = await this.db.collection(COLECCIONES.publicaciones).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Publicación no encontrada')
    const pub = doc.data() as any
    if (pub.autorId !== usuarioId) throw new ForbiddenException('No tienes permiso para editar esta publicación')

    await doc.ref.update({ contenido, fechaActualizacion: new Date().toISOString() })
    return { id, autorId: pub.autorId, contenido, grupoId: pub.grupoId ?? null,
      cantidadMeGustas: pub.cantidadMeGustas ?? 0, fechaCreacion: pub.fechaCreacion }
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
    const id = uuid()
    await this.db.collection(COLECCIONES.grupos).doc(id).set({
      id, nombre: dto.nombre, descripcion: dto.descripcion ?? '',
      esPublico: dto.esPublico !== false, creadorId,
      cantidadMiembros: 1, fechaCreacion: new Date().toISOString(),
    })
    await this.db.collection(COLECCIONES.miembrosGrupo).doc(uuid()).set({
      grupoId: id, usuarioId: creadorId, rol: 'admin',
      fechaCreacion: new Date().toISOString(),
    })
    const doc = await this.db.collection(COLECCIONES.grupos).doc(id).get()
    return { id, ...doc.data() } as any
  }

  async joinGroup(grupoId: string, usuarioId: string) {
    const grupoDoc = await this.db.collection(COLECCIONES.grupos).doc(grupoId).get()
    if (!grupoDoc.exists) throw new NotFoundException('Grupo no encontrado')

    const existente = await this.db.collection(COLECCIONES.miembrosGrupo)
      .where('grupoId', '==', grupoId).where('usuarioId', '==', usuarioId).limit(1).get()
    if (!existente.empty) return { yaMiembro: true }

    await this.db.collection(COLECCIONES.miembrosGrupo).doc(uuid()).set({
      grupoId, usuarioId, rol: 'miembro',
      fechaCreacion: new Date().toISOString(),
    })
    await this.db.collection(COLECCIONES.grupos).doc(grupoId).update({
      cantidadMiembros: FieldValue.increment(1),
    })
    return { unido: true }
  }

  async leaveGroup(grupoId: string, usuarioId: string) {
    const grupoDoc = await this.db.collection(COLECCIONES.grupos).doc(grupoId).get()
    if (!grupoDoc.exists) throw new NotFoundException('Grupo no encontrado')

    const snap = await this.db.collection(COLECCIONES.miembrosGrupo)
      .where('grupoId', '==', grupoId).where('usuarioId', '==', usuarioId).limit(1).get()
    if (snap.empty) throw new NotFoundException('No eres miembro de este grupo')

    const miembro = snap.docs[0].data()
    if (miembro.rol === 'admin') throw new ForbiddenException('El creador del grupo no puede salir. Elimina el grupo en su lugar.')

    await snap.docs[0].ref.delete()
    await this.db.collection(COLECCIONES.grupos).doc(grupoId).update({
      cantidadMiembros: FieldValue.increment(-1),
    })
    return { salido: true }
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
}
