import { Injectable, Inject, NotFoundException, ForbiddenException, Logger } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { v4 as uuid } from 'uuid'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { parsearTiposDiscapacidad } from '../../common/utils/firestore-helpers'
import { CreateInstitucionDto } from './dto/create-institucion.dto'
import { UpdateInstitucionDto } from './dto/update-institucion.dto'

@Injectable()
export class InstitutionsService {
  private readonly logger = new Logger('InstitutionsService')

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private col(nombre: string) { return this.db.collection(nombre) }

  // ─── Listar instituciones (público) ────────────────────────────────
  async findAll(filtros: { page?: number; limit?: number; busqueda?: string; categoria?: string; ciudad?: string } = {}) {
    const page = Math.max(1, Number(filtros.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(filtros.limit) || 10))

    let q = this.col(COLECCIONES.instituciones).where('activa', '==', true)
    if (filtros.categoria) q = q.where('categoria', '==', filtros.categoria)

    const snap = await q.get()
    let filas = snap.docs.map(d => this.parsear({ id: d.id, ...d.data() }))

    // Filtrar en memoria para campos que Firestore no indexa bien
    if (filtros.ciudad) {
      const termino = filtros.ciudad.toLowerCase()
      filas = filas.filter((f: any) => (f.ciudad ?? '').toLowerCase().includes(termino))
    }

    if (filtros.busqueda) {
      const termino = filtros.busqueda.toLowerCase()
      filas = filas.filter((f: any) =>
        (f.nombre ?? '').toLowerCase().includes(termino) ||
        (f.descripcion ?? '').toLowerCase().includes(termino) ||
        (f.ciudad ?? '').toLowerCase().includes(termino)
      )
    }

    // Ordenar por calificación promedio descendente
    filas.sort((a: any, b: any) => (b.calificacionPromedio ?? 0) - (a.calificacionPromedio ?? 0))

    const total = filas.length
    const inicio = (page - 1) * limit
    const paginadas = filas.slice(inicio, inicio + limit)

    return {
      datos: paginadas,
      paginacion: {
        total,
        pagina: page,
        limite: limit,
        totalPaginas: Math.ceil(total / limit),
      },
    }
  }

  // ─── Detalle de institución (público) ──────────────────────────────
  async findOne(id: string) {
    const doc = await this.col(COLECCIONES.instituciones).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Institución no encontrada')
    return this.parsear({ id: doc.id, ...doc.data()! })
  }

  // ─── Mi institución (autenticado) ──────────────────────────────────
  async findMine(usuarioId: string) {
    try {
      const snap = await this.col(COLECCIONES.instituciones)
        .where('creadoPor', '==', usuarioId)
        .where('activa', '==', true)
        .orderBy('fechaCreacion', 'desc')
        .limit(1)
        .get()

      if (snap.empty) throw new NotFoundException('No tienes una institución registrada')
      const doc = snap.docs[0]
      return this.parsear({ id: doc.id, ...doc.data() })
    } catch (error: any) {
      // Fallback: si el índice compuesto de Firebase aún no está listo,
      // se obtienen todas las instituciones activas del usuario
      // y se ordenan en memoria por fechaCreacion descendente.
      const esErrorDeIndice =
        error?.message?.toLowerCase().includes('requires an index') ||
        error?.code === 'failed-precondition' ||
        error?.code === 9

      if (!esErrorDeIndice) throw error

      this.logger.warn(
        `Índice compuesto no disponible para findMine, usando ordenamiento en memoria. Usuario: ${usuarioId}`,
      )

      const fallbackSnap = await this.col(COLECCIONES.instituciones)
        .where('creadoPor', '==', usuarioId)
        .where('activa', '==', true)
        .get()

      if (fallbackSnap.empty) throw new NotFoundException('No tienes una institución registrada')

      const docs = fallbackSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => {
          const tsA = new Date(a.fechaCreacion || 0).getTime()
          const tsB = new Date(b.fechaCreacion || 0).getTime()
          return tsB - tsA
        })

      return this.parsear(docs[0])
    }
  }

  // ─── Crear institución (autenticado) ───────────────────────────────
  async create(dto: CreateInstitucionDto, usuarioId: string) {
    const id = uuid()
    const documento = {
      id,
      nombre: dto.nombre,
      descripcion: dto.descripcion ?? '',
      categoria: dto.categoria,
      subcategoria: dto.subcategoria ?? '',
      direccion: dto.direccion ?? '',
      ciudad: dto.ciudad ?? '',
      estado: dto.estado ?? '',
      lat: dto.lat ?? null,
      lng: dto.lng ?? null,
      telefono: dto.telefono ?? '',
      whatsapp: dto.whatsapp ?? '',
      email: dto.email ?? '',
      sitioWeb: dto.sitioWeb ?? '',
      urlLogo: dto.urlLogo ?? null,
      urlPortada: dto.urlPortada ?? null,
      tiposDiscapacidad: Array.isArray(dto.tiposDiscapacidad)
        ? dto.tiposDiscapacidad
        : parsearTiposDiscapacidad(dto.tiposDiscapacidad),
      edadMinima: dto.edadMinima ?? null,
      edadMaxima: dto.edadMaxima ?? null,
      horarioAtencion: dto.horarioAtencion ?? '',
      tipoPlan: dto.tipoPlan ?? 'gratuito',
      servicios: dto.servicios ?? [],
      fotos: dto.fotos ?? [],
      calificacionPromedio: 0,
      cantidadCalificaciones: 0,
      verificada: false,
      activa: true,
      creadoPor: usuarioId,
      fechaCreacion: new Date().toISOString(),
    }

    await this.col(COLECCIONES.instituciones).doc(id).set(documento)
    return this.findOne(id)
  }

  // ─── Actualizar mi institución (autenticado) ───────────────────────
  async updateMine(usuarioId: string, dto: UpdateInstitucionDto) {
    const snap = await this.col(COLECCIONES.instituciones)
      .where('creadoPor', '==', usuarioId)
      .limit(1)
      .get()

    if (snap.empty) throw new NotFoundException('No tienes una institución registrada')

    const docSnap = snap.docs[0]
    const id = docSnap.id

    const carga = this.buildUpdatePayload(dto)
    if (Object.keys(carga).length === 0) return this.findOne(id)

    carga.fechaActualizacion = new Date().toISOString()
    await this.col(COLECCIONES.instituciones).doc(id).update(carga)
    return this.findOne(id)
  }

  // ─── Actualizar institución por ID (admin o propietario) ───────────
  async update(id: string, dto: UpdateInstitucionDto, usuarioId: string, rol: string) {
    const doc = await this.col(COLECCIONES.instituciones).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Institución no encontrada')

    // Solo admin o el propietario pueden actualizar
    const creadoPor = doc.data()?.creadoPor
    if (rol !== 'admin' && creadoPor !== usuarioId) {
      throw new ForbiddenException('No tienes permisos para actualizar esta institución')
    }

    const carga = this.buildUpdatePayload(dto)
    if (Object.keys(carga).length === 0) return this.findOne(id)

    carga.fechaActualizacion = new Date().toISOString()
    await this.col(COLECCIONES.instituciones).doc(id).update(carga)
    return this.findOne(id)
  }

  // ─── Eliminar institución (soft-delete, admin o propietario) ──────
  async remove(id: string, usuarioId: string, rol: string) {
    const doc = await this.col(COLECCIONES.instituciones).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Institución no encontrada')

    const creadoPor = doc.data()?.creadoPor
    if (rol !== 'admin' && creadoPor !== usuarioId) {
      throw new ForbiddenException('No tienes permisos para eliminar esta institución')
    }

    await this.col(COLECCIONES.instituciones).doc(id).update({
      activa: false,
      fechaEliminacion: new Date().toISOString(),
    })

    return { exito: true, mensaje: 'Institución eliminada correctamente' }
  }

  // ─── Helpers privados ──────────────────────────────────────────────
  private buildUpdatePayload(dto: UpdateInstitucionDto): Record<string, any> {
    const camposPermitidos = [
      'nombre', 'descripcion', 'categoria', 'subcategoria', 'direccion',
      'ciudad', 'estado', 'lat', 'lng', 'telefono', 'whatsapp', 'email',
      'sitioWeb', 'urlLogo', 'urlPortada', 'tiposDiscapacidad', 'edadMinima',
      'edadMaxima', 'horarioAtencion', 'tipoPlan', 'servicios', 'fotos',
    ]

    const carga: Record<string, any> = {}
    for (const campo of camposPermitidos) {
      const valor = (dto as any)[campo]
      if (valor !== undefined) {
        carga[campo] = valor
      }
    }

    // Normalizar tiposDiscapacidad si se envía
    if (carga.tiposDiscapacidad && !Array.isArray(carga.tiposDiscapacidad)) {
      carga.tiposDiscapacidad = parsearTiposDiscapacidad(carga.tiposDiscapacidad)
    }

    return carga
  }

  private parsear(fila: any) {
    if (!fila) return fila
    return {
      ...fila,
      tiposDiscapacidad: parsearTiposDiscapacidad(fila.tiposDiscapacidad),
    }
  }
}
