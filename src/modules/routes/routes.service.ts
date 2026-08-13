import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { CrearRutaDto, ActualizarRutaDto, CrearPasoDto } from './dto/ruta-desarrollo.dto'

@Injectable()
export class RoutesService {
  private readonly logger = new Logger('RoutesService')

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private col(nombre: string) { return this.db.collection(nombre) }

  // ═══════════════════════════════════════════════════════════════════
  // Rutas de desarrollo
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Crea una nueva ruta de desarrollo para el usuario.
   */
  async crearRuta(usuarioId: string, dto: CrearRutaDto) {
    const ref = this.col(COLECCIONES.rutasDesarrollo).doc()
    const ruta = {
      id: ref.id,
      usuarioId,
      areaInteres: dto.areaInteres,
      nombre: dto.nombre,
      descripcion: dto.descripcion ?? '',
      metaFinal: dto.metaFinal ?? '',
      estado: 'activa',
      prioridad: dto.prioridad ?? 'media',
      totalPasos: 0,
      pasosCompletados: 0,
      porcentajeProgreso: 0,
      fechaLimite: dto.fechaLimite ?? null,
      fechaCreacion: new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
    }

    await ref.set(ruta)
    return ruta
  }

  /**
   * Lista todas las rutas de desarrollo del usuario.
   */
  async listarRutas(usuarioId: string, filtros?: { estado?: string; areaInteres?: string }) {
    let q = this.col(COLECCIONES.rutasDesarrollo)
      .where('usuarioId', '==', usuarioId)

    const snap = await q.get()
    let rutas = snap.docs.map(d => ({ id: d.id, ...d.data() }))

    // Filtros en memoria
    if (filtros?.estado) {
      rutas = rutas.filter(r => (r as any).estado === filtros.estado)
    }
    if (filtros?.areaInteres) {
      rutas = rutas.filter(r => (r as any).areaInteres === filtros.areaInteres)
    }

    // Ordenar por prioridad y fecha de creación
    const ordenPrioridad: Record<string, number> = { alta: 0, media: 1, baja: 2 }
    rutas.sort((a: any, b: any) => {
      const prioDiff = (ordenPrioridad[a.prioridad] ?? 1) - (ordenPrioridad[b.prioridad] ?? 1)
      if (prioDiff !== 0) return prioDiff
      return (b.fechaCreacion ?? '').localeCompare(a.fechaCreacion ?? '')
    })

    return rutas
  }

  /**
   * Obtiene el detalle de una ruta específica con sus pasos.
   */
  async obtenerRuta(usuarioId: string, rutaId: string) {
    const doc = await this.col(COLECCIONES.rutasDesarrollo).doc(rutaId).get()
    if (!doc.exists) throw new NotFoundException('Ruta no encontrada')

    const ruta = { id: doc.id, ...doc.data() } as any
    if (ruta.usuarioId !== usuarioId) {
      throw new ForbiddenException('No tienes permiso para ver esta ruta')
    }

    // Obtener pasos de la ruta
    const pasosSnap = await this.col(COLECCIONES.pasosRuta)
      .where('rutaId', '==', rutaId)
      .orderBy('orden', 'asc')
      .get()

    const pasos = pasosSnap.docs.map(d => ({ id: d.id, ...d.data() }))

    return { ...ruta, pasos }
  }

  /**
   * Actualiza una ruta de desarrollo.
   */
  async actualizarRuta(usuarioId: string, rutaId: string, dto: ActualizarRutaDto) {
    const doc = await this.col(COLECCIONES.rutasDesarrollo).doc(rutaId).get()
    if (!doc.exists) throw new NotFoundException('Ruta no encontrada')

    const ruta = doc.data() as any
    if (ruta.usuarioId !== usuarioId) {
      throw new ForbiddenException('No tienes permiso para actualizar esta ruta')
    }

    const carga: Record<string, any> = {}
    if (dto.nombre !== undefined) carga.nombre = dto.nombre
    if (dto.descripcion !== undefined) carga.descripcion = dto.descripcion
    if (dto.metaFinal !== undefined) carga.metaFinal = dto.metaFinal
    if (dto.estado !== undefined) carga.estado = dto.estado
    if (dto.prioridad !== undefined) carga.prioridad = dto.prioridad
    if (dto.fechaLimite !== undefined) carga.fechaLimite = dto.fechaLimite

    if (Object.keys(carga).length === 0) return { id: rutaId, ...ruta }

    carga.fechaActualizacion = new Date().toISOString()
    await doc.ref.update(carga)

    return { id: rutaId, ...ruta, ...carga }
  }

  /**
   * Elimina una ruta de desarrollo y sus pasos asociados.
   */
  async eliminarRuta(usuarioId: string, rutaId: string) {
    const doc = await this.col(COLECCIONES.rutasDesarrollo).doc(rutaId).get()
    if (!doc.exists) throw new NotFoundException('Ruta no encontrada')

    const ruta = doc.data() as any
    if (ruta.usuarioId !== usuarioId) {
      throw new ForbiddenException('No tienes permiso para eliminar esta ruta')
    }

    // Eliminar pasos asociados
    const pasosSnap = await this.col(COLECCIONES.pasosRuta)
      .where('rutaId', '==', rutaId).get()

    const batch = this.db.batch()
    for (const paso of pasosSnap.docs) {
      batch.delete(paso.ref)
    }
    batch.delete(doc.ref)
    await batch.commit()

    return { eliminado: true }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Pasos de ruta
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Agrega un paso a una ruta.
   */
  async agregarPaso(usuarioId: string, rutaId: string, dto: CrearPasoDto) {
    // Verificar que la ruta exista y pertenezca al usuario
    const rutaDoc = await this.col(COLECCIONES.rutasDesarrollo).doc(rutaId).get()
    if (!rutaDoc.exists) throw new NotFoundException('Ruta no encontrada')

    const ruta = rutaDoc.data() as any
    if (ruta.usuarioId !== usuarioId) {
      throw new ForbiddenException('No tienes permiso para modificar esta ruta')
    }

    // Obtener el último orden
    const pasosSnap = await this.col(COLECCIONES.pasosRuta)
      .where('rutaId', '==', rutaId)
      .orderBy('orden', 'desc')
      .limit(1)
      .get()

    const ultimoOrden = pasosSnap.empty ? 0 : (pasosSnap.docs[0].data().orden ?? 0)
    const orden = dto.orden ?? ultimoOrden + 1

    const ref = this.col(COLECCIONES.pasosRuta).doc()
    const paso = {
      id: ref.id,
      rutaId,
      titulo: dto.titulo,
      descripcion: dto.descripcion ?? '',
      orden,
      completado: false,
      fechaCompletado: null,
      fechaCreacion: new Date().toISOString(),
    }

    await ref.set(paso)

    // Actualizar total de pasos en la ruta
    await rutaDoc.ref.update({
      totalPasos: (ruta.totalPasos ?? 0) + 1,
      fechaActualizacion: new Date().toISOString(),
    })

    return paso
  }

  /**
   * Marca un paso como completado.
   */
  async completarPaso(usuarioId: string, rutaId: string, pasoId: string) {
    // Verificar ruta
    const rutaDoc = await this.col(COLECCIONES.rutasDesarrollo).doc(rutaId).get()
    if (!rutaDoc.exists) throw new NotFoundException('Ruta no encontrada')

    const ruta = rutaDoc.data() as any
    if (ruta.usuarioId !== usuarioId) {
      throw new ForbiddenException('No tienes permiso para modificar esta ruta')
    }

    // Verificar paso
    const pasoDoc = await this.col(COLECCIONES.pasosRuta).doc(pasoId).get()
    if (!pasoDoc.exists) throw new NotFoundException('Paso no encontrado')

    const paso = pasoDoc.data() as any
    if (paso.rutaId !== rutaId) {
      throw new BadRequestException('El paso no pertenece a esta ruta')
    }

    if (paso.completado) {
      return { id: pasoId, ...paso } // Ya completado
    }

    // Marcar como completado
    await pasoDoc.ref.update({
      completado: true,
      fechaCompletado: new Date().toISOString(),
    })

    // Actualizar progreso de la ruta
    const pasosSnap = await this.col(COLECCIONES.pasosRuta)
      .where('rutaId', '==', rutaId).get()

    const totalPasos = pasosSnap.size
    const completados = pasosSnap.docs.filter(d => d.data().completado || d.id === pasoId).length
    const porcentaje = totalPasos > 0 ? Math.round((completados / totalPasos) * 100) : 0

    await rutaDoc.ref.update({
      pasosCompletados: completados,
      porcentajeProgreso: porcentaje,
      estado: porcentaje === 100 ? 'completada' : ruta.estado,
      fechaActualizacion: new Date().toISOString(),
    })

    return {
      id: pasoId,
      ...paso,
      completado: true,
      fechaCompletado: new Date().toISOString(),
    }
  }

  /**
   * Desmarca un paso como completado.
   */
  async descompletarPaso(usuarioId: string, rutaId: string, pasoId: string) {
    // Verificar ruta
    const rutaDoc = await this.col(COLECCIONES.rutasDesarrollo).doc(rutaId).get()
    if (!rutaDoc.exists) throw new NotFoundException('Ruta no encontrada')

    const ruta = rutaDoc.data() as any
    if (ruta.usuarioId !== usuarioId) {
      throw new ForbiddenException('No tienes permiso para modificar esta ruta')
    }

    // Verificar paso
    const pasoDoc = await this.col(COLECCIONES.pasosRuta).doc(pasoId).get()
    if (!pasoDoc.exists) throw new NotFoundException('Paso no encontrado')

    const paso = pasoDoc.data() as any
    if (paso.rutaId !== rutaId) {
      throw new BadRequestException('El paso no pertenece a esta ruta')
    }

    if (!paso.completado) {
      return { id: pasoId, ...paso } // Ya descompletado
    }

    // Descompletar
    await pasoDoc.ref.update({
      completado: false,
      fechaCompletado: null,
    })

    // Actualizar progreso
    const pasosSnap = await this.col(COLECCIONES.pasosRuta)
      .where('rutaId', '==', rutaId).get()

    const totalPasos = pasosSnap.size
    const completados = pasosSnap.docs.filter(d => d.data().completado && d.id !== pasoId).length
    const porcentaje = totalPasos > 0 ? Math.round((completados / totalPasos) * 100) : 0

    await rutaDoc.ref.update({
      pasosCompletados: completados,
      porcentajeProgreso: porcentaje,
      estado: 'activa', // Si se descompleta un paso, vuelve a activa
      fechaActualizacion: new Date().toISOString(),
    })

    return {
      id: pasoId,
      ...paso,
      completado: false,
      fechaCompletado: null,
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Resumen
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Obtiene el resumen de rutas del usuario.
   */
  async resumenRutas(usuarioId: string) {
    const snap = await this.col(COLECCIONES.rutasDesarrollo)
      .where('usuarioId', '==', usuarioId).get()

    const rutas = snap.docs.map(d => d.data())

    const total = rutas.length
    const activas = rutas.filter(r => r.estado === 'activa').length
    const completadas = rutas.filter(r => r.estado === 'completada').length
    const pausadas = rutas.filter(r => r.estado === 'pausada').length

    const progresoPromedio = total > 0
      ? Math.round(rutas.reduce((sum, r) => sum + (r.porcentajeProgreso ?? 0), 0) / total)
      : 0

    return {
      totalRutas: total,
      rutasActivas: activas,
      rutasCompletadas: completadas,
      rutasPausadas: pausadas,
      progresoPromedio,
    }
  }
}
