import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { CrearRutaDto, ActualizarRutaDto, CrearPasoDto } from './dto/ruta-desarrollo.dto'
import { KnowledgeBaseService } from './knowledge-base.service'
import { parsearTiposDiscapacidad } from '../../common/utils/firestore-helpers'
import type { PerfilExtendidoDoc, PerfilDoc } from '../../common/interfaces/firestore-documents.interface'

/** Ruta de desarrollo de la colección `rutasDesarrollo`. */
interface RutaDoc {
  id: string
  usuarioId: string
  estado: string
  prioridad: string
  totalPasos: number
  fechaCreacion?: string
  [key: string]: unknown
}

/** Paso de la colección `pasosRuta`. */
interface PasoDoc {
  rutaId: string
  [key: string]: unknown
}

@Injectable()
export class RoutesService {
  private readonly logger = new Logger('RoutesService')

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly knowledgeBase: KnowledgeBaseService,
  ) {}

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
    const q = this.col(COLECCIONES.rutasDesarrollo)
      .where('usuarioId', '==', usuarioId)

    const snap = await q.get()
    let rutas = snap.docs.map(d => ({ id: d.id, ...d.data() } as RutaDoc))

    // Filtros en memoria
    if (filtros?.estado) {
      rutas = rutas.filter(r => r.estado === filtros.estado)
    }
    if (filtros?.areaInteres) {
      rutas = rutas.filter(r => r.areaInteres === filtros.areaInteres)
    }

    // Ordenar por prioridad y fecha de creación
    const ordenPrioridad: Record<string, number> = { alta: 0, media: 1, baja: 2 }
    rutas.sort((a, b) => {
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

    const ruta = { id: doc.id, ...doc.data() } as RutaDoc
    if (ruta.usuarioId !== usuarioId) {
      throw new ForbiddenException('No tienes permiso para ver esta ruta')
    }

    // Obtener pasos de la ruta (sin .orderBy() para evitar índice compuesto; se ordena en memoria)
    const pasosSnap = await this.col(COLECCIONES.pasosRuta)
      .where('rutaId', '==', rutaId)
      .get()

    const pasos = pasosSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as PasoDoc & { id: string }))
      .sort((a, b) => Number(a.orden ?? 0) - Number(b.orden ?? 0))

    return { ...ruta, pasos }
  }

  /**
   * Actualiza una ruta de desarrollo.
   */
  async actualizarRuta(usuarioId: string, rutaId: string, dto: ActualizarRutaDto) {
    const doc = await this.col(COLECCIONES.rutasDesarrollo).doc(rutaId).get()
    if (!doc.exists) throw new NotFoundException('Ruta no encontrada')

    const ruta = doc.data() as Omit<RutaDoc, 'id'>
    if (ruta.usuarioId !== usuarioId) {
      throw new ForbiddenException('No tienes permiso para actualizar esta ruta')
    }

    const carga: Record<string, unknown> = {}
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

    const ruta = doc.data() as Omit<RutaDoc, 'id'>
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

    const ruta = rutaDoc.data() as Omit<RutaDoc, 'id'>
    if (ruta.usuarioId !== usuarioId) {
      throw new ForbiddenException('No tienes permiso para modificar esta ruta')
    }

    // Obtener el último orden (sin .orderBy() para evitar índice compuesto; máximo en memoria)
    const pasosSnap = await this.col(COLECCIONES.pasosRuta)
      .where('rutaId', '==', rutaId)
      .get()

    const ultimoOrden = pasosSnap.docs.reduce((max, d) => {
      const o = d.data().orden
      return typeof o === 'number' && o > max ? o : max
    }, 0)
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
      totalPasos: Number(ruta.totalPasos ?? 0) + 1,
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

    const ruta = rutaDoc.data() as Omit<RutaDoc, 'id'>
    if (ruta.usuarioId !== usuarioId) {
      throw new ForbiddenException('No tienes permiso para modificar esta ruta')
    }

    // Verificar paso
    const pasoDoc = await this.col(COLECCIONES.pasosRuta).doc(pasoId).get()
    if (!pasoDoc.exists) throw new NotFoundException('Paso no encontrado')

    const paso = pasoDoc.data() as Omit<PasoDoc, 'id'>
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

    const ruta = rutaDoc.data() as Omit<RutaDoc, 'id'>
    if (ruta.usuarioId !== usuarioId) {
      throw new ForbiddenException('No tienes permiso para modificar esta ruta')
    }

    // Verificar paso
    const pasoDoc = await this.col(COLECCIONES.pasosRuta).doc(pasoId).get()
    if (!pasoDoc.exists) throw new NotFoundException('Paso no encontrado')

    const paso = pasoDoc.data() as Omit<PasoDoc, 'id'>
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
  // Generación personalizada de rutas (Día Cero + Algoritmo Evolutivo)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Genera una ruta personalizada para el usuario.
   *
   * Flujo:
   * 1. Día Cero: Si el usuario es nuevo (sin rutas previas), genera una ruta
   *    experta por defecto basada en su tipo de discapacidad.
   * 2. Fase Evolutiva: Si hay perfiles similares con rutas completadas,
   *    mejora los pasos usando la sabiduría comunitaria.
   * 3. Siempre incluye entidades locales (instituciones, vacantes) relevantes.
   */
  async generarRutaPersonalizada(usuarioId: string) {
    // 1. Cargar perfil del usuario
    const [perfilSnap, registroSnap] = await Promise.all([
      this.col(COLECCIONES.perfilesExtendidos)
        .where('usuarioId', '==', usuarioId).limit(1).get(),
      this.col(COLECCIONES.perfiles).doc(usuarioId).get(),
    ])

    const perfil = perfilSnap.empty ? null : (perfilSnap.docs[0].data() as PerfilExtendidoDoc)
    const registro = registroSnap.data() as PerfilDoc | undefined

    // 2. Verificar si ya tiene una ruta activa generada automáticamente
    const rutasExistentes = await this.col(COLECCIONES.rutasDesarrollo)
      .where('usuarioId', '==', usuarioId)
      .where('estado', '==', 'activa')
      .get()

    if (!rutasExistentes.empty) {
      // Ya tiene ruta activa: retornar la primera con sus pasos
      const rutaExistente = rutasExistentes.docs[0]
      return this.obtenerRuta(usuarioId, rutaExistente.id)
    }

    // 3. Obtener tipos de discapacidad del usuario
    const tiposDiscapacidad = perfil?.tiposDiscapacidad
      ? parsearTiposDiscapacidad(perfil.tiposDiscapacidad)
      : []

    // 4. Obtener ruta experta base (Día Cero)
    const rutaExperta = this.knowledgeBase.obtenerRutaExperta(tiposDiscapacidad)

    // 5. Buscar perfiles similares (Fase Evolutiva)
    const perfilesSimilares = perfil && registro
      ? await this.knowledgeBase.buscarPerfilesSimilares(usuarioId, perfil, registro)
      : []

    // 6. Mejorar pasos con sabiduría comunitaria si hay evidencia
    const pasosFinales = perfilesSimilares.length >= 2
      ? this.knowledgeBase.mejorarPasosConComunidad(rutaExperta.pasos, perfilesSimilares)
      : rutaExperta.pasos

    // 7. Crear la ruta en Firestore
    const refRuta = this.col(COLECCIONES.rutasDesarrollo).doc()
    const ruta = {
      id: refRuta.id,
      usuarioId,
      areaInteres: rutaExperta.areaInteres,
      nombre: rutaExperta.nombre,
      descripcion: rutaExperta.descripcion,
      metaFinal: 'Completar todos los pasos de la ruta de desarrollo',
      estado: 'activa',
      prioridad: 'alta' as const,
      totalPasos: pasosFinales.length,
      pasosCompletados: 0,
      porcentajeProgreso: 0,
      fechaLimite: null,
      fechaCreacion: new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
      origen: perfilesSimilares.length >= 2 ? 'comunidad' : 'experto',
      perfilesSimilaresUsados: perfilesSimilares.map(p => p.usuarioId),
    }

    await refRuta.set(ruta)

    // 8. Crear los pasos
    for (const paso of pasosFinales) {
      const refPaso = this.col(COLECCIONES.pasosRuta).doc()
      await refPaso.set({
        id: refPaso.id,
        rutaId: refRuta.id,
        titulo: paso.titulo,
        descripcion: paso.descripcion,
        orden: paso.orden,
        completado: false,
        fechaCompletado: null,
        fechaCreacion: new Date().toISOString(),
      })
    }

    this.logger.log(`Ruta personalizada generada para ${usuarioId}: ${rutaExperta.nombre} (${pasosFinales.length} pasos, origen: ${ruta.origen})`)

    return this.obtenerRuta(usuarioId, refRuta.id)
  }

  // ═══════════════════════════════════════════════════════════════════
  // Mi Ruta (con entidades locales)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Obtiene la ruta activa del usuario con entidades asociadas de su zona.
   * Incluye instituciones cercanas y vacantes relevantes para el paso actual.
   */
  async obtenerMiRuta(usuarioId: string) {
    // Buscar la ruta activa más reciente
    const rutasSnap = await this.col(COLECCIONES.rutasDesarrollo)
      .where('usuarioId', '==', usuarioId)
      .where('estado', '==', 'activa')
      .get()

    if (rutasSnap.empty) {
      return {
        ruta: null,
        pasos: [],
        entidadesLocales: { instituciones: [], vacantes: [] },
        mensaje: 'No tienes una ruta activa. Genera una ruta personalizada para comenzar.',
      }
    }

    // Tomar la ruta más reciente
    const rutaDocs = rutasSnap.docs.map(d => ({
      id: d.id,
      datos: d.data() as Record<string, unknown>,
    }))
    rutaDocs.sort((a, b) => String(b.datos.fechaCreacion ?? '').localeCompare(String(a.datos.fechaCreacion ?? '')))
    const rutaDoc = rutaDocs[0]

    const ruta = { id: rutaDoc.id, ...rutaDoc.datos } as unknown as RutaDoc

    // Obtener pasos
    const pasosSnap = await this.col(COLECCIONES.pasosRuta)
      .where('rutaId', '==', rutaDoc.id)
      .get()

    const pasos = pasosSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as Record<string, unknown>))
      .sort((a, b) => Number(a.orden ?? 0) - Number(b.orden ?? 0))

    // Encontrar el paso actual (primero no completado)
    const pasoActual = pasos.find(p => !p.completado)

    // Cargar perfil para ciudad y discapacidades
    const perfilSnap = await this.col(COLECCIONES.perfilesExtendidos)
      .where('usuarioId', '==', usuarioId).limit(1).get()
    const perfil = perfilSnap.empty ? null : (perfilSnap.docs[0].data() as PerfilExtendidoDoc)
    const registroDoc = await this.col(COLECCIONES.perfiles).doc(usuarioId).get()
    const registro = registroDoc.data() as PerfilDoc | undefined

    const ciudad = registro?.ciudad ?? ''
    const tiposDiscapacidad = perfil?.tiposDiscapacidad
      ? parsearTiposDiscapacidad(perfil.tiposDiscapacidad)
      : []

    // Obtener entidades locales relevantes
    const [instituciones, vacantes] = await Promise.all([
      this.knowledgeBase.obtenerInstitucionesCercanas(ciudad, tiposDiscapacidad),
      pasoActual?.categoria === 'laboral'
        ? this.knowledgeBase.obtenerVacantesRelevantes(ciudad, tiposDiscapacidad)
        : Promise.resolve([]),
    ])

    return {
      ruta,
      pasos,
      pasoActual: pasoActual ?? null,
      entidadesLocales: { instituciones, vacantes },
      origen: ruta.origen ?? 'experto',
      perfilesSimilaresUsados: ruta.perfilesSimilaresUsados ?? [],
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
