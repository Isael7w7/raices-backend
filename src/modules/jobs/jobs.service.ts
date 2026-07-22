import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { randomUUID } from 'crypto'

@Injectable()
export class JobsService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async findAll(filtros: { ciudad?: string; modalidad?: string; tiposDiscapacidad?: string } = {}) {
    let q = this.db.collection(COLECCIONES.vacantes).where('activa', '==', true)
    if (filtros.modalidad) q = q.where('modalidad', '==', filtros.modalidad)
    const snap = await q.orderBy('fechaCreacion', 'desc').get()
    let vacantes = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    const instIds = [...new Set(vacantes.map(v => v.institucionId))]
    const mapaInst = new Map<string, any>()
    for (const iid of instIds) {
      const doc = await this.db.collection(COLECCIONES.instituciones).doc(iid).get()
      if (doc.exists) mapaInst.set(iid, { id: doc.id, ...doc.data() })
    }

    if (filtros.ciudad) {
      const termino = filtros.ciudad.toLowerCase()
      vacantes = vacantes.filter(v => (v.ciudad ?? '').toLowerCase().includes(termino))
    }

    return vacantes.map(v => {
      const inst = mapaInst.get(v.institucionId) ?? {}
      return {
        ...v,
        tiposDiscapacidad: (() => { try { return JSON.parse(v.tiposDiscapacidad) } catch { return [] } })(),
        nombreInstitucion: inst.nombre ?? null,
        ciudadInstitucion: inst.ciudad ?? null,
        institucionVerificada: inst.verificada ?? false,
      }
    }).filter(v => mapaInst.has(v.institucionId) && (mapaInst.get(v.institucionId).activa ?? false))
  }

  async findOne(id: string) {
    const doc = await this.db.collection(COLECCIONES.vacantes).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Vacante no encontrada')
    const vacante = { id: doc.id, ...doc.data() } as any

    const instDoc = await this.db.collection(COLECCIONES.instituciones).doc(vacante.institucionId).get()
    const inst = instDoc.data() ?? {}

    vacante.tiposDiscapacidad = (() => { try { return JSON.parse(vacante.tiposDiscapacidad) } catch { return [] } })()
    return {
      ...vacante,
      nombreInstitucion: inst.nombre ?? null,
      ciudadInstitucion: inst.ciudad ?? null,
      descripcionInstitucion: inst.descripcion ?? null,
      telefonoInstitucion: inst.telefono ?? null,
      emailInstitucion: inst.email ?? null,
      sitioWebInstitucion: inst.sitioWeb ?? null,
      institucionVerificada: inst.verificada ?? false,
    }
  }

  async apply(usuarioId: string, vacanteId: string, cartaPresentacion: string) {
    const vacanteDoc = await this.db.collection(COLECCIONES.vacantes).doc(vacanteId).get()
    if (!vacanteDoc.exists || !vacanteDoc.data()?.activa) throw new NotFoundException('Vacante no encontrada o inactiva')

    const existente = await this.db.collection(COLECCIONES.postulaciones)
      .where('vacanteId', '==', vacanteId).where('usuarioId', '==', usuarioId).limit(1).get()
    if (!existente.empty) throw new ConflictException('Ya enviaste una solicitud para esta vacante')

    const id = randomUUID()
    await this.db.collection(COLECCIONES.postulaciones).doc(id).set({
      id, vacanteId, usuarioId, cartaPresentacion, estado: 'pendiente',
      fechaCreacion: new Date().toISOString(),
    })
    return { id, estado: 'pendiente', mensaje: '¡Solicitud enviada con éxito!' }
  }

  async myApplications(usuarioId: string) {
    const snap = await this.db.collection(COLECCIONES.postulaciones)
      .where('usuarioId', '==', usuarioId).orderBy('fechaCreacion', 'desc').get()
    const postulaciones = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    const vacanteIds = [...new Set(postulaciones.map(p => p.vacanteId))]
    const mapaVacantes = new Map<string, any>()
    for (const vid of vacanteIds) {
      const doc = await this.db.collection(COLECCIONES.vacantes).doc(vid).get()
      if (doc.exists) mapaVacantes.set(vid, doc.data())
    }

    const instIds = [...new Set([...mapaVacantes.values()].map(v => v?.institucionId).filter(Boolean))]
    const mapaInst = new Map<string, any>()
    for (const iid of instIds) {
      const doc = await this.db.collection(COLECCIONES.instituciones).doc(iid).get()
      if (doc.exists) mapaInst.set(iid, doc.data())
    }

    return postulaciones.map(p => {
      const vacante = mapaVacantes.get(p.vacanteId) ?? {}
      const inst = mapaInst.get(vacante.institucionId) ?? {}
      return { ...p, titulo: vacante.titulo, modalidad: vacante.modalidad, nombreInstitucion: inst.nombre ?? null }
    })
  }

  async getAppliedJobIds(usuarioId: string): Promise<string[]> {
    const snap = await this.db.collection(COLECCIONES.postulaciones)
      .where('usuarioId', '==', usuarioId).get()
    return snap.docs.map(d => d.data().vacanteId)
  }

  async createJob(institucionId: string, dto: any) {
    const id = randomUUID()
    await this.db.collection(COLECCIONES.vacantes).doc(id).set({
      id, institucionId, titulo: dto.titulo, descripcion: dto.descripcion ?? '',
      requisitos: dto.requisitos ?? '', modalidad: dto.modalidad ?? 'presencial',
      horario: dto.horario ?? '', rangoSalario: dto.rangoSalario ?? '',
      ciudad: dto.ciudad ?? '', estado: dto.estado ?? '',
      inclusivaDiscapacidad: dto.inclusivaDiscapacidad !== false,
      tiposDiscapacidad: JSON.stringify(dto.tiposDiscapacidad ?? []),
      activa: true, fechaCreacion: new Date().toISOString(),
    })
    return this.findOne(id)
  }
}
