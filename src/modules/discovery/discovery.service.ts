import { Injectable, Inject } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { parsearTiposDiscapacidad } from '../../common/utils/firestore-helpers'

@Injectable()
export class DiscoveryService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async discover(usuarioId: string, filtros: any = {}) {
    const perfilSnap = await this.db.collection(COLECCIONES.perfilesExtendidos)
      .where('usuarioId', '==', usuarioId).limit(1).get()
    let discapacidadesUsuario: string[] = []
    if (!perfilSnap.empty) {
      discapacidadesUsuario = parsearTiposDiscapacidad(perfilSnap.docs[0].data().tiposDiscapacidad)
    }

    let q = this.db.collection(COLECCIONES.instituciones).where('activa', '==', true)
    if (filtros.categoria) q = q.where('categoria', '==', filtros.categoria)

    // Quitamos .orderBy() de Firestore para evitar error de índice compuesto
    const snap = await q.get()
    let filas = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    // Parsear tiposDiscapacidad de forma segura
    filas = filas.map(f => ({ ...f, tiposDiscapacidad: parsearTiposDiscapacidad(f.tiposDiscapacidad) }))

    // Ordenar en memoria por calificación promedio
    filas.sort((a, b) => (b.calificacionPromedio ?? 0) - (a.calificacionPromedio ?? 0))

    // Limitar a 50 después de ordenar
    filas = filas.slice(0, 50)

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
        const arr = f.tiposDiscapacidad || []
        return arr.includes(filtros.tipoDiscapacidad)
      })
    }

    return filas.map((f: any) => {
      const tipos = f.tiposDiscapacidad || []
      const coincide = discapacidadesUsuario.length > 0 && discapacidadesUsuario.some((d) => tipos.includes(d))
      return { ...f, tiposDiscapacidad: tipos, coincidePerfil: coincide }
    }).sort((a: any, b: any) => (b.coincidePerfil ? 1 : 0) - (a.coincidePerfil ? 1 : 0))
  }
}
