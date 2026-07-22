import { Injectable, Inject } from '@nestjs/common'
import { Firestore, CollectionReference, Query } from 'firebase-admin/firestore'
import { randomUUID } from 'crypto'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import type {
  Institucion,
  FiltrosInstitucion,
  CrearInstitucionDatos,
  IRepositorioInstitucion,
} from '../interfaces/institution.repository.interface'

@Injectable()
export class RepositorioInstitucionFirestore implements IRepositorioInstitucion {
  private readonly col: CollectionReference

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {
    this.col = this.db.collection(COLECCIONES.instituciones)
  }

  async listar(filtros: FiltrosInstitucion = {}): Promise<Institucion[]> {
    let q: Query = this.col.where('activa', '==', true)
    if (filtros.categoria) {
      q = q.where('categoria', '==', filtros.categoria)
    }
    const snap = await q.orderBy('calificacionPromedio', 'desc').get()
    let filas = snap.docs.map((d) => this.aDominio(d.id, d.data()))

    if (filtros.ciudad) {
      const termino = filtros.ciudad.toLowerCase()
      filas = filas.filter((f) => f.ciudad.toLowerCase().includes(termino))
    }
    if (filtros.busqueda) {
      const termino = filtros.busqueda.toLowerCase()
      filas = filas.filter(
        (f) =>
          f.nombre.toLowerCase().includes(termino) ||
          f.descripcion.toLowerCase().includes(termino) ||
          f.ciudad.toLowerCase().includes(termino) ||
          f.estado.toLowerCase().includes(termino),
      )
    }
    if (filtros.tipoDiscapacidad) {
      const dt = filtros.tipoDiscapacidad.toLowerCase()
      filas = filas.filter((f) => f.tiposDiscapacidad.some((d) => d.toLowerCase() === dt))
    }
    if (filtros.edad != null) {
      const edad = filtros.edad
      filas = filas.filter(
        (f) =>
          (f.edadMinima == null || f.edadMinima <= edad) &&
          (f.edadMaxima == null || f.edadMaxima >= edad),
      )
    }

    return filas
  }

  async buscarPorId(id: string): Promise<Institucion | null> {
    const doc = await this.col.doc(id).get()
    if (!doc.exists) return null
    return this.aDominio(doc.id, doc.data()!)
  }

  async buscarPorIds(ids: string[]): Promise<Institucion[]> {
    if (ids.length === 0) return []
    const lotes: string[][] = []
    for (let i = 0; i < ids.length; i += 30) {
      lotes.push(ids.slice(i, i + 30))
    }
    const resultados: Institucion[] = []
    for (const lote of lotes) {
      const snap = await this.col.where('__name__', 'in', lote).get()
      for (const doc of snap.docs) {
        resultados.push(this.aDominio(doc.id, doc.data()))
      }
    }
    return resultados
  }

  async crear(datos: CrearInstitucionDatos, usuarioId: string): Promise<Institucion> {
    const id = randomUUID()
    const ahora = new Date().toISOString()
    const docDatos: Record<string, any> = {
      id,
      nombre: datos.nombre,
      descripcion: datos.descripcion ?? '',
      categoria: datos.categoria,
      ciudad: datos.ciudad ?? '',
      estado: datos.estado ?? '',
      telefono: datos.telefono ?? '',
      email: datos.email ?? '',
      sitioWeb: datos.sitioWeb ?? '',
      tiposDiscapacidad: JSON.stringify(datos.tiposDiscapacidad ?? []),
      edadMinima: datos.edadMinima ?? null,
      edadMaxima: datos.edadMaxima ?? null,
      calificacionPromedio: 0,
      cantidadCalificaciones: 0,
      activa: true,
      verificada: false,
      creadoPor: usuarioId,
      fechaCreacion: ahora,
    }
    if (datos.emailContacto) docDatos.emailContacto = datos.emailContacto
    await this.col.doc(id).set(docDatos)
    return (await this.buscarPorId(id))!
  }

  async actualizar(id: string, datos: Partial<Institucion>): Promise<void> {
    const datosActualizados: Record<string, any> = { ...datos }
    if (Array.isArray(datosActualizados.tiposDiscapacidad)) {
      datosActualizados.tiposDiscapacidad = JSON.stringify(datosActualizados.tiposDiscapacidad)
    }
    delete (datosActualizados as any).id
    datosActualizados.fechaActualizacion = new Date().toISOString()
    await this.col.doc(id).update(datosActualizados)
  }

  async eliminarSuave(id: string): Promise<void> {
    await this.col.doc(id).update({ activa: false, fechaActualizacion: new Date().toISOString() })
  }

  async contarActivas(): Promise<number> {
    const snap = await this.col.where('activa', '==', true).get()
    return snap.size
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private aDominio(id: string, data: FirebaseFirestore.DocumentData): Institucion {
    let tipos: string[] = []
    try {
      tipos = JSON.parse(data.tiposDiscapacidad ?? '[]')
      if (!Array.isArray(tipos)) tipos = []
    } catch {
      tipos = []
    }
    return {
      id,
      nombre: data.nombre ?? '',
      descripcion: data.descripcion ?? '',
      categoria: data.categoria ?? '',
      ciudad: data.ciudad ?? '',
      estado: data.estado ?? '',
      telefono: data.telefono ?? '',
      email: data.email ?? '',
      sitioWeb: data.sitioWeb ?? '',
      tiposDiscapacidad: tipos,
      edadMinima: data.edadMinima ?? null,
      edadMaxima: data.edadMaxima ?? null,
      calificacionPromedio: data.calificacionPromedio ?? 0,
      cantidadCalificaciones: data.cantidadCalificaciones ?? 0,
      activa: data.activa ?? false,
      verificada: data.verificada ?? false,
      creadoPor: data.creadoPor ?? '',
      fechaCreacion: data.fechaCreacion ?? '',
      emailContacto: data.emailContacto ?? undefined,
    }
  }
}
