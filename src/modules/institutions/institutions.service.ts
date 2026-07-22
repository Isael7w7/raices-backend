import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { v4 as uuid } from 'uuid'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'

@Injectable()
export class InstitutionsService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private col(nombre: string) { return this.db.collection(nombre) }

  async findAll(filtros: any = {}) {
    let q = this.col(COLECCIONES.instituciones).where('activa', '==', true)
    if (filtros.categoria) q = q.where('categoria', '==', filtros.categoria)
    const snap = await q.orderBy('calificacionPromedio', 'desc').get()
    let filas = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    if (filtros.ciudad) {
      const termino = filtros.ciudad.toLowerCase()
      filas = filas.filter((f: any) => (f.ciudad ?? '').toLowerCase().includes(termino))
    }
    if (filtros.busqueda) {
      const termino = filtros.busqueda.toLowerCase()
      filas = filas.filter((f: any) =>
        (f.nombre ?? '').toLowerCase().includes(termino) ||
        (f.descripcion ?? '').toLowerCase().includes(termino) ||
        (f.ciudad ?? '').toLowerCase().includes(termino) ||
        (f.estado ?? '').toLowerCase().includes(termino)
      )
    }
    if (filtros.tipoDiscapacidad) {
      filas = filas.filter((f: any) => {
        try { const arr: string[] = JSON.parse(f.tiposDiscapacidad ?? '[]'); return arr.includes(filtros.tipoDiscapacidad) } catch { return false }
      })
    }
    if (filtros.edad) {
      const edad = parseInt(filtros.edad)
      filas = filas.filter((f: any) =>
        (f.edadMinima == null || f.edadMinima <= edad) && (f.edadMaxima == null || f.edadMaxima >= edad)
      )
    }

    return filas.map(this.parsear)
  }

  async findOne(id: string) {
    const doc = await this.col(COLECCIONES.instituciones).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Institución no encontrada')
    return this.parsear({ id: doc.id, ...doc.data()! })
  }

  async create(datos: any, usuarioId: string) {
    const id = uuid()
    await this.col(COLECCIONES.instituciones).doc(id).set({
      id, ...datos,
      tiposDiscapacidad: JSON.stringify(datos.tiposDiscapacidad ?? []),
      creadoPor: usuarioId, activa: true, verificada: false,
      fechaCreacion: new Date().toISOString(),
    })
    return this.findOne(id)
  }

  private parsear(fila: any) {
    if (!fila) return fila
    try { fila.tiposDiscapacidad = JSON.parse(fila.tiposDiscapacidad ?? '[]') } catch { fila.tiposDiscapacidad = [] }
    return fila
  }
}
