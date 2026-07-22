import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { v4 as uuid } from 'uuid'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { parsearTiposDiscapacidad } from '../../common/utils/firestore-helpers'

@Injectable()
export class InstitutionsService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private col(nombre: string) { return this.db.collection(nombre) }

  async findAll(filtros: any = {}) {
    let q = this.col(COLECCIONES.instituciones).where('activa', '==', true)
    if (filtros.categoria) q = q.where('categoria', '==', filtros.categoria)

    const snap = await q.get()
    let filas = snap.docs.map(d => this.parsear({ id: d.id, ...d.data() }))

    // Ordenar en memoria por calificación promedio
    filas.sort((a, b) => (b.calificacionPromedio ?? 0) - (a.calificacionPromedio ?? 0))

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
        const arr = f.tiposDiscapacidad || []
        return arr.includes(filtros.tipoDiscapacidad)
      })
    }

    if (filtros.edad) {
      const edad = parseInt(filtros.edad, 10)
      filas = filas.filter((f: any) =>
        (f.edadMinima == null || f.edadMinima <= edad) &&
        (f.edadMaxima == null || f.edadMaxima >= edad)
      )
    }

    return filas
  }

  async findOne(id: string) {
    const doc = await this.col(COLECCIONES.instituciones).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Institución no encontrada')
    return this.parsear({ id: doc.id, ...doc.data()! })
  }

  async create(datos: any, usuarioId: string) {
    const id = uuid()
    const documento = {
      id,
      ...datos,
      tiposDiscapacidad: Array.isArray(datos.tiposDiscapacidad)
        ? datos.tiposDiscapacidad
        : parsearTiposDiscapacidad(datos.tiposDiscapacidad),
      creadoPor: usuarioId,
      activa: true,
      verificada: false,
      fechaCreacion: new Date().toISOString(),
    }

    await this.col(COLECCIONES.instituciones).doc(id).set(documento)
    return this.findOne(id)
  }

  private parsear(fila: any) {
    if (!fila) return fila
    return {
      ...fila,
      tiposDiscapacidad: parsearTiposDiscapacidad(fila.tiposDiscapacidad),
    }
  }


}
