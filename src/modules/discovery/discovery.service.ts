import { Injectable, Inject } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'

@Injectable()
export class DiscoveryService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async discover(usuarioId: string, filtros: any = {}) {
    const perfilSnap = await this.db.collection(COLECCIONES.perfilesExtendidos)
      .where('usuarioId', '==', usuarioId).limit(1).get()
    let discapacidadesUsuario: string[] = []
    if (!perfilSnap.empty) {
      try { discapacidadesUsuario = JSON.parse(perfilSnap.docs[0].data().tiposDiscapacidad ?? '[]') } catch {}
    }

    let q = this.db.collection(COLECCIONES.instituciones).where('activa', '==', true)
    if (filtros.categoria) q = q.where('categoria', '==', filtros.categoria)
    const snap = await q.orderBy('calificacionPromedio', 'desc').limit(50).get()
    let filas = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    if (filtros.ciudad) {
      const termino = filtros.ciudad.toLowerCase()
      filas = filas.filter((f: any) => (f.ciudad ?? '').toLowerCase().includes(termino))
    }
    if (filtros.busqueda) {
      const termino = filtros.busqueda.toLowerCase()
      filas = filas.filter((f: any) => (f.nombre ?? '').toLowerCase().includes(termino))
    }
    if (filtros.tipoDiscapacidad) {
      filas = filas.filter((f: any) => {
        try { const arr: string[] = JSON.parse(f.tiposDiscapacidad ?? '[]'); return arr.includes(filtros.tipoDiscapacidad) } catch { return false }
      })
    }

    return filas.map((f: any) => {
      let tipos: string[] = []
      try { tipos = JSON.parse(f.tiposDiscapacidad ?? '[]') } catch {}
      const coincide = discapacidadesUsuario.length > 0 && discapacidadesUsuario.some((d) => tipos.includes(d))
      return { ...f, tiposDiscapacidad: tipos, coincidePerfil: coincide }
    }).sort((a: any, b: any) => (b.coincidePerfil ? 1 : 0) - (a.coincidePerfil ? 1 : 0))
  }
}
