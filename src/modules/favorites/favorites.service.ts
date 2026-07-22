import { Injectable, Inject } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { v4 as uuid } from 'uuid'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { parsearTiposDiscapacidad } from '../../common/utils/firestore-helpers'

@Injectable()
export class FavoritesService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async findByUser(usuarioId: string) {
    const favSnap = await this.db.collection(COLECCIONES.favoritos)
      .where('usuarioId', '==', usuarioId).get()
    if (favSnap.empty) return []
    const ids = favSnap.docs.map(f => f.data().institucionId)

    const lotes: string[][] = []
    for (let i = 0; i < ids.length; i += 30) lotes.push(ids.slice(i, i + 30))

    const instituciones: any[] = []
    for (const lote of lotes) {
      const snap = await this.db.collection(COLECCIONES.instituciones)
        .where('__name__', 'in', lote).get()
      instituciones.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }
    return instituciones.map((i: any) => ({
      ...i,
      tiposDiscapacidad: parsearTiposDiscapacidad(i.tiposDiscapacidad),
    }))
  }

  async toggle(usuarioId: string, institucionId: string) {
    const snap = await this.db.collection(COLECCIONES.favoritos)
      .where('usuarioId', '==', usuarioId)
      .where('institucionId', '==', institucionId)
      .limit(1).get()
    if (!snap.empty) {
      await snap.docs[0].ref.delete()
      return { favorito: false }
    }
    const favoritoId = uuid()
    await this.db.collection(COLECCIONES.favoritos).doc(favoritoId).set({
      id: favoritoId, usuarioId, institucionId,
      fechaCreacion: new Date().toISOString(),
    })
    return { favorito: true }
  }

  async getFavoriteIds(usuarioId: string): Promise<string[]> {
    const snap = await this.db.collection(COLECCIONES.favoritos)
      .where('usuarioId', '==', usuarioId).get()
    return snap.docs.map(f => f.data().institucionId)
  }
}
