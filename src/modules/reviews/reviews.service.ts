import { Injectable, Inject } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { v4 as uuid } from 'uuid'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'

@Injectable()
export class ReviewsService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async findByInstitution(institucionId: string) {
    const revSnap = await this.db.collection(COLECCIONES.resenas)
      .where('institucionId', '==', institucionId).orderBy('fechaCreacion', 'desc').get()
    const resenas = revSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    const usuariosIds = [...new Set(resenas.map(r => r.usuarioId))]
    const mapaUsuarios = new Map<string, any>()
    for (const uid of usuariosIds) {
      const doc = await this.db.collection(COLECCIONES.perfiles).doc(uid).get()
      if (doc.exists) mapaUsuarios.set(uid, doc.data())
    }

    return resenas.map(r => ({
      id: r.id, calificacion: r.calificacion, comentario: r.comentario, fechaCreacion: r.fechaCreacion,
      nombreCompleto: mapaUsuarios.get(r.usuarioId)?.nombreCompleto ?? null,
      urlAvatar: mapaUsuarios.get(r.usuarioId)?.urlAvatar ?? null,
    }))
  }

  async submit(usuarioId: string, institucionId: string, calificacion: number, comentario: string) {
    const snap = await this.db.collection(COLECCIONES.resenas)
      .where('usuarioId', '==', usuarioId)
      .where('institucionId', '==', institucionId)
      .limit(1).get()

    if (!snap.empty) {
      await snap.docs[0].ref.update({ calificacion, comentario })
    } else {
      await this.db.collection(COLECCIONES.resenas).doc(uuid()).set({
        id: uuid(), usuarioId, institucionId,
        calificacion, comentario, fechaCreacion: new Date().toISOString(),
      })
    }

    const todasRev = await this.db.collection(COLECCIONES.resenas)
      .where('institucionId', '==', institucionId).get()
    const calificaciones = todasRev.docs.map(d => d.data().calificacion as number)
    const promedio = calificaciones.reduce((s, r) => s + r, 0) / calificaciones.length
    await this.db.collection(COLECCIONES.instituciones).doc(institucionId).update({
      calificacionPromedio: parseFloat(promedio.toFixed(2)),
      cantidadCalificaciones: calificaciones.length,
    })

    return { ok: true }
  }

  async myReviews(usuarioId: string) {
    const revSnap = await this.db.collection(COLECCIONES.resenas)
      .where('usuarioId', '==', usuarioId).orderBy('fechaCreacion', 'desc').get()
    const resenas = revSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    const instIds = [...new Set(resenas.map(r => r.institucionId))]
    const mapaInst = new Map<string, any>()
    for (const iid of instIds) {
      const doc = await this.db.collection(COLECCIONES.instituciones).doc(iid).get()
      if (doc.exists) mapaInst.set(iid, doc.data())
    }

    return resenas.map(r => ({
      ...r,
      nombreInstitucion: mapaInst.get(r.institucionId)?.nombre ?? null,
      categoria: mapaInst.get(r.institucionId)?.categoria ?? null,
    }))
  }
}
