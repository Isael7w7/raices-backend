import { Injectable, Inject } from '@nestjs/common'
import { Firestore, CollectionReference, Query } from 'firebase-admin/firestore'
import { randomUUID } from 'crypto'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import type {
  Vacante,
  Postulacion,
  FiltrosVacante,
  CrearVacanteDatos,
  CrearPostulacionDatos,
  IRepositorioVacante,
} from '../interfaces/job.repository.interface'

@Injectable()
export class RepositorioVacanteFirestore implements IRepositorioVacante {
  private readonly colVacantes: CollectionReference
  private readonly colPostulaciones: CollectionReference

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {
    this.colVacantes = this.db.collection(COLECCIONES.vacantes)
    this.colPostulaciones = this.db.collection(COLECCIONES.postulaciones)
  }

  // ── Vacantes ──────────────────────────────────────────────────────────

  async listar(filtros: FiltrosVacante = {}): Promise<Vacante[]> {
    let q: Query = this.colVacantes.where('activa', '==', true)
    if (filtros.modalidad) {
      q = q.where('modalidad', '==', filtros.modalidad)
    }
    const snap = await q.orderBy('fechaCreacion', 'desc').get()
    let filas = snap.docs.map((d) => this.vacanteADominio(d.id, d.data()))

    if (filtros.ciudad) {
      const termino = filtros.ciudad.toLowerCase()
      filas = filas.filter((f) => f.ciudad.toLowerCase().includes(termino))
    }

    if (filtros.tipoDiscapacidad) {
      const dt = filtros.tipoDiscapacidad.toLowerCase()
      filas = filas.filter((f) => f.tiposDiscapacidad.some((d) => d.toLowerCase() === dt))
    }

    return filas
  }

  async buscarPorId(id: string): Promise<Vacante | null> {
    const doc = await this.colVacantes.doc(id).get()
    if (!doc.exists) return null
    return this.vacanteADominio(doc.id, doc.data()!)
  }

  async buscarPorIds(ids: string[]): Promise<Vacante[]> {
    if (ids.length === 0) return []
    const lotes: string[][] = []
    for (let i = 0; i < ids.length; i += 30) {
      lotes.push(ids.slice(i, i + 30))
    }
    const resultados: Vacante[] = []
    for (const lote of lotes) {
      const snap = await this.colVacantes.where('__name__', 'in', lote).get()
      for (const doc of snap.docs) {
        resultados.push(this.vacanteADominio(doc.id, doc.data()))
      }
    }
    return resultados
  }

  async crear(datos: CrearVacanteDatos): Promise<Vacante> {
    const id = randomUUID()
    const ahora = new Date().toISOString()
    await this.colVacantes.doc(id).set({
      id,
      institucionId: datos.institucionId,
      titulo: datos.titulo,
      descripcion: datos.descripcion ?? '',
      requisitos: datos.requisitos ?? '',
      modalidad: datos.modalidad ?? 'presencial',
      horario: datos.horario ?? '',
      rangoSalario: datos.rangoSalario ?? '',
      ciudad: datos.ciudad ?? '',
      estado: datos.estado ?? '',
      inclusivaDiscapacidad: datos.inclusivaDiscapacidad !== false,
      tiposDiscapacidad: JSON.stringify(datos.tiposDiscapacidad ?? []),
      activa: true,
      fechaCreacion: ahora,
    })
    return (await this.buscarPorId(id))!
  }

  async actualizar(id: string, datos: Partial<Vacante>): Promise<void> {
    const datosActualizados: Record<string, any> = { ...datos }
    if (Array.isArray(datosActualizados.tiposDiscapacidad)) {
      datosActualizados.tiposDiscapacidad = JSON.stringify(datosActualizados.tiposDiscapacidad)
    }
    delete (datosActualizados as any).id
    datosActualizados.fechaActualizacion = new Date().toISOString()
    await this.colVacantes.doc(id).update(datosActualizados)
  }

  async eliminarSuave(id: string): Promise<void> {
    await this.colVacantes.doc(id).update({ activa: false, fechaActualizacion: new Date().toISOString() })
  }

  async contarActivas(): Promise<number> {
    const snap = await this.colVacantes.where('activa', '==', true).get()
    return snap.size
  }

  // ── Postulaciones ────────────────────────────────────────────────────

  async crearPostulacion(datos: CrearPostulacionDatos): Promise<Postulacion> {
    const id = randomUUID()
    const ahora = new Date().toISOString()
    const postulacion: Postulacion = {
      id,
      vacanteId: datos.vacanteId,
      usuarioId: datos.usuarioId,
      cartaPresentacion: datos.cartaPresentacion,
      estado: 'pendiente',
      fechaCreacion: ahora,
    }
    await this.colPostulaciones.doc(id).set(postulacion)
    return postulacion
  }

  async listarPostulacionesPorUsuario(usuarioId: string): Promise<Postulacion[]> {
    const snap = await this.colPostulaciones
      .where('usuarioId', '==', usuarioId)
      .orderBy('fechaCreacion', 'desc')
      .get()
    return snap.docs.map((d) => this.postulacionADominio(d.id, d.data()))
  }

  async buscarPostulacionPorUsuarioYVacante(
    usuarioId: string,
    vacanteId: string,
  ): Promise<Postulacion | null> {
    const snap = await this.colPostulaciones
      .where('usuarioId', '==', usuarioId)
      .where('vacanteId', '==', vacanteId)
      .limit(1)
      .get()
    if (snap.empty) return null
    const doc = snap.docs[0]
    return this.postulacionADominio(doc.id, doc.data())
  }

  async obtenerIdsVacantesPostuladas(usuarioId: string): Promise<string[]> {
    const snap = await this.colPostulaciones.where('usuarioId', '==', usuarioId).get()
    return snap.docs.map((d) => d.data().vacanteId as string)
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private vacanteADominio(id: string, data: FirebaseFirestore.DocumentData): Vacante {
    let tipos: string[] = []
    try {
      tipos = JSON.parse(data.tiposDiscapacidad ?? '[]')
      if (!Array.isArray(tipos)) tipos = []
    } catch {
      tipos = []
    }
    return {
      id,
      institucionId: data.institucionId ?? '',
      titulo: data.titulo ?? '',
      descripcion: data.descripcion ?? '',
      requisitos: data.requisitos ?? '',
      modalidad: data.modalidad ?? '',
      horario: data.horario ?? '',
      rangoSalario: data.rangoSalario ?? '',
      ciudad: data.ciudad ?? '',
      estado: data.estado ?? '',
      inclusivaDiscapacidad: data.inclusivaDiscapacidad ?? true,
      tiposDiscapacidad: tipos,
      activa: data.activa ?? false,
      fechaCreacion: data.fechaCreacion ?? '',
    }
  }

  private postulacionADominio(id: string, data: FirebaseFirestore.DocumentData): Postulacion {
    return {
      id,
      vacanteId: data.vacanteId ?? '',
      usuarioId: data.usuarioId ?? '',
      cartaPresentacion: data.cartaPresentacion ?? '',
      estado: data.estado ?? 'pendiente',
      fechaCreacion: data.fechaCreacion ?? '',
    }
  }
}
