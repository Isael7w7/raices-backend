import { Injectable, Inject } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { parsearTiposDiscapacidad } from '../../common/utils/firestore-helpers'
import { InstitucionDoc } from '../../common/interfaces/firestore-documents.interface'

/** Filtros de búsqueda para descubrimiento de instituciones */
export interface DiscoveryFilters {
  categoria?: string
  ciudad?: string
  busqueda?: string
  tipoDiscapacidad?: string
  [key: string]: string | string[] | undefined
}

/** Resultado de descubrimiento con score de coincidencia */
export interface DiscoveryResult extends InstitucionDoc {
  id: string
  tiposDiscapacidad: string[]
  coincidePerfil: boolean
}

@Injectable()
export class DiscoveryService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async discover(usuarioId: string, filtros: DiscoveryFilters = {}): Promise<DiscoveryResult[]> {
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
    let filas: (InstitucionDoc & { id: string })[] = snap.docs.map(d => ({ id: d.id, ...d.data() }))

    // Parsear tiposDiscapacidad de forma segura
    filas = filas.map(f => ({ ...f, tiposDiscapacidad: parsearTiposDiscapacidad(f.tiposDiscapacidad) }))

    // Ordenar en memoria por calificación promedio
    filas.sort((a, b) => (b.calificacionPromedio ?? 0) - (a.calificacionPromedio ?? 0))

    // Limitar a 50 después de ordenar
    filas = filas.slice(0, 50)

    if (filtros.ciudad) {
      const termino = filtros.ciudad.toLowerCase()
      filas = filas.filter(f => (f.ciudad ?? '').toLowerCase().includes(termino))
    }
    if (filtros.busqueda) {
      const termino = filtros.busqueda.toLowerCase()
      filas = filas.filter(f => (f.nombre ?? '').toLowerCase().includes(termino))
    }
    if (filtros.tipoDiscapacidad) {
      filas = filas.filter(f => {
        const arr = (Array.isArray(f.tiposDiscapacidad) ? f.tiposDiscapacidad : []) as string[]
        return arr.includes(filtros.tipoDiscapacidad!)
      })
    }

    return filas.map(f => {
      const tipos = (Array.isArray(f.tiposDiscapacidad) ? f.tiposDiscapacidad : []) as string[]
      const coincide = discapacidadesUsuario.length > 0 && discapacidadesUsuario.some((d) => tipos.includes(d))
      return { ...f, tiposDiscapacidad: tipos, coincidePerfil: coincide }
    }).sort((a, b) => (b.coincidePerfil ? 1 : 0) - (a.coincidePerfil ? 1 : 0))
  }
}
