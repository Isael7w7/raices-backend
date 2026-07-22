import { Injectable, Inject } from '@nestjs/common'
import { Firestore, FieldValue, Query } from 'firebase-admin/firestore'
import { v4 as uuid } from 'uuid'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'

@Injectable()
export class CommunityService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async getGroups() {
    const snap = await this.db.collection(COLECCIONES.grupos)
      .where('esPublico', '==', true).get()

    // Quitamos .orderBy() de Firestore para evitar error de índice compuesto
    const grupos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    grupos.sort((a: any, b: any) => (b.cantidadMiembros ?? 0) - (a.cantidadMiembros ?? 0))
    return grupos
  }

  async getPosts(grupoId?: string, usuarioId?: string, limite = 20) {
    let q: Query = this.db.collection(COLECCIONES.publicaciones)
    if (grupoId) q = q.where('grupoId', '==', grupoId)

    // Quitamos .orderBy() de Firestore para evitar error de índice compuesto
    const publicacionSnap = await q.get()
    const publicaciones = publicacionSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    // Ordenar en memoria y limitar
    publicaciones.sort((a, b) => (b.fechaCreacion ?? '').localeCompare(a.fechaCreacion ?? ''))
    publicaciones.splice(limite)

    const autoresIds = [...new Set(publicaciones.map(p => p.autorId))]
    const mapaAutores = new Map<string, any>()
    for (const aid of autoresIds) {
      const doc = await this.db.collection(COLECCIONES.perfiles).doc(aid).get()
      if (doc.exists) mapaAutores.set(aid, doc.data())
    }

    const enriquecidas = publicaciones.map(p => ({
      ...p,
      nombreCompleto: mapaAutores.get(p.autorId)?.nombreCompleto ?? null,
      urlAvatar: mapaAutores.get(p.autorId)?.urlAvatar ?? null,
    }))

    if (usuarioId) {
      const likedSnap = await this.db.collection(COLECCIONES.meGustas)
        .where('usuarioId', '==', usuarioId).get()
      const likedSet = new Set(likedSnap.docs.map(l => l.data().publicacionId))
      return enriquecidas.map(p => ({ ...p, usuarioMeGusta: likedSet.has(p.id) }))
    }

    return enriquecidas.map(p => ({ ...p, usuarioMeGusta: false }))
  }

  async getComments(publicacionId: string) {
    const snap = await this.db.collection(COLECCIONES.comentarios)
      .where('publicacionId', '==', publicacionId).get()

    // Quitamos .orderBy() de Firestore para evitar error de índice compuesto
    const comentarios = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
    comentarios.sort((a, b) => (a.fechaCreacion ?? '').localeCompare(b.fechaCreacion ?? ''))

    const autoresIds = [...new Set(comentarios.map(c => c.autorId))]
    const mapaAutores = new Map<string, any>()
    for (const aid of autoresIds) {
      const doc = await this.db.collection(COLECCIONES.perfiles).doc(aid).get()
      if (doc.exists) mapaAutores.set(aid, doc.data())
    }

    return comentarios.map(c => ({
      ...c,
      nombreCompleto: mapaAutores.get(c.autorId)?.nombreCompleto ?? null,
      urlAvatar: mapaAutores.get(c.autorId)?.urlAvatar ?? null,
    }))
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
}
