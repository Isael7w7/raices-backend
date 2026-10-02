import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Firestore, FieldValue, DocumentData } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { obtenerDocumentosPorIds } from '../../common/utils/firestore-helpers'
import { paginar, RespuestaPaginada } from '../../common/dto/paginacion.dto'
import type { EventoDoc, PerfilDoc } from '../../common/interfaces/firestore-documents.interface'
import type { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { CrearEventoDto } from './dto/crear-evento.dto'

/** Filtros del listado de eventos (sección "Eventos" de la comunidad). */
export interface FiltrosEventos {
  categoria?: string
  /** Día exacto (`YYYY-MM-DD`): busca eventos de esa fecha ignorando `desde`. */
  fecha?: string
  /** Fecha/hora mínima de inicio. Por defecto se usan "ahora" (próximos). */
  desde?: string
  buscar?: string
}

/** Evento enriquecido para la UI (asistencia del usuario + organizador). */
export type EventoVista = EventoDoc & {
  id: string
  asisto: boolean
  nombreCreador: string | null
  urlAvatarCreador: string | null
}

function aDocumento<T = Record<string, unknown>>(d: { id: string; data(): DocumentData | undefined }): T & { id: string } {
  return { id: d.id, ...(d.data() ?? {}) } as T & { id: string }
}

/**
 * Instante (ms) de una fecha ISO o `YYYY-MM-DD`; `NaN` si no es parseable.
 * Permite comparar eventos guardados como fecha simple con filtros completos.
 */
function instante(fecha: string | null | undefined): number {
  if (!fecha) return Number.NaN
  return Date.parse(fecha.length <= 10 ? `${fecha}T00:00:00.000Z` : fecha)
}

@Injectable()
export class EventosService {
  private readonly logger = new Logger(EventosService.name)

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  /**
   * Lista eventos activos ordenados por `fechaInicio` ascendente (próximos
   * primero). Filtros por categoría, día exacto (`fecha`), desde una fecha y
   * búsqueda de texto. Incluye `asisto` del usuario autenticado.
   */
  async listar(
    usuarioId: string,
    pagina = 1,
    limite = 20,
    filtros: FiltrosEventos = {},
  ): Promise<RespuestaPaginada<EventoVista>> {
    try {
      const snap = await this.db.collection(COLECCIONES.eventos)
        .where('activo', '==', true)
        .get()
      let eventos = snap.docs.map(d => aDocumento<EventoDoc>(d))

      if (filtros.fecha) {
        const dia = filtros.fecha.slice(0, 10)
        eventos = eventos.filter(e => (e.fechaInicio ?? '').slice(0, 10) === dia)
      } else {
        const desde = instante(filtros.desde) || Date.now()
        eventos = eventos.filter(e => instante(e.fechaInicio) >= desde)
      }

      if (filtros.categoria) {
        eventos = eventos.filter(e => e.categoria === filtros.categoria)
      }
      if (filtros.buscar) {
        const termino = filtros.buscar.toLowerCase()
        eventos = eventos.filter(e =>
          (e.titulo ?? '').toLowerCase().includes(termino) ||
          (e.descripcion ?? '').toLowerCase().includes(termino),
        )
      }

      eventos.sort((a, b) => instante(a.fechaInicio) - instante(b.fechaInicio))

      if (eventos.length === 0) return paginar([], 0, pagina, limite)

      // Asistencias del usuario (una sola consulta para toda la página)
      let asistidos = new Set<string>()
      try {
        const snapAsist = await this.db.collection(COLECCIONES.asistenciasEvento)
          .where('usuarioId', '==', usuarioId)
          .get()
        asistidos = new Set(snapAsist.docs.map(d => d.data().eventoId))
      } catch (asistErr) {
        this.logger.error(`Error al obtener asistencias: ${(asistErr as Error).message}`, (asistErr as Error).stack)
      }

      // Organizadores (batch)
      let mapaCreadores = new Map<string, PerfilDoc>()
      try {
        const creadoresIds = [...new Set(eventos.map(e => e.creadorId).filter(Boolean))] as string[]
        mapaCreadores = creadoresIds.length > 0
          ? await obtenerDocumentosPorIds<PerfilDoc>(this.db, COLECCIONES.perfiles, creadoresIds)
          : new Map<string, PerfilDoc>()
      } catch (creadoresErr) {
        this.logger.error(`Error al obtener organizadores: ${(creadoresErr as Error).message}`, (creadoresErr as Error).stack)
      }

      const enriquecidos: EventoVista[] = eventos.map(e => {
        const creador = e.creadorId ? mapaCreadores.get(e.creadorId) : undefined
        return {
          ...e,
          asisto: asistidos.has(e.id),
          nombreCreador: creador?.nombreCompleto ?? null,
          urlAvatarCreador: creador?.urlAvatar ?? null,
        }
      })

      const total = enriquecidos.length
      const inicio = (pagina - 1) * limite
      return paginar(enriquecidos.slice(inicio, inicio + limite), total, pagina, limite)
    } catch (error) {
      this.logger.error(`Error al listar eventos: ${(error as Error).message}`, (error as Error).stack)
      return paginar([], 0, pagina, limite)
    }
  }

  /** Detalle de un evento con la asistencia del usuario y el organizador. */
  async obtenerDetalle(eventoId: string, usuarioId: string): Promise<EventoVista> {
    const doc = await this.db.collection(COLECCIONES.eventos).doc(eventoId).get()
    if (!doc.exists) throw new NotFoundException('Evento no encontrado')
    const evento = aDocumento<EventoDoc>(doc)

    let asisto = false
    try {
      const asistencia = await this.db.collection(COLECCIONES.asistenciasEvento)
        .doc(`${eventoId}_${usuarioId}`)
        .get()
      asisto = asistencia.exists
    } catch (asistErr) {
      this.logger.error(`Error al verificar asistencia: ${(asistErr as Error).message}`, (asistErr as Error).stack)
    }

    let creador: PerfilDoc | undefined
    if (evento.creadorId) {
      try {
        const perfil = await this.db.collection(COLECCIONES.perfiles).doc(evento.creadorId).get()
        creador = perfil.exists ? (perfil.data() as PerfilDoc) : undefined
      } catch (creadorErr) {
        this.logger.error(`Error al obtener organizador: ${(creadorErr as Error).message}`, (creadorErr as Error).stack)
      }
    }

    return {
      ...evento,
      asisto,
      nombreCreador: creador?.nombreCompleto ?? null,
      urlAvatarCreador: creador?.urlAvatar ?? null,
    }
  }

  /**
   * Alterna la asistencia a un evento (confirmar / cancelar) con ID
   * determinista `eventoId_usuarioId` y contador atómico, igual que los
   * grupos: dos peticiones simultáneas no pueden duplicar ni desincronizar
   * `cantidadAsistentes`.
   */
  async toggleAsistencia(
    eventoId: string,
    usuarioId: string,
  ): Promise<{ asistiendo: boolean; cantidadAsistentes: number }> {
    const refAsistencia = this.db.collection(COLECCIONES.asistenciasEvento).doc(`${eventoId}_${usuarioId}`)
    const refEvento = this.db.collection(COLECCIONES.eventos).doc(eventoId)

    return this.db.runTransaction(async tx => {
      const eventoSnap = await tx.get(refEvento)
      if (!eventoSnap.exists) throw new NotFoundException('Evento no encontrado')

      const asistenciaSnap = await tx.get(refAsistencia)
      const base = (eventoSnap.data()?.cantidadAsistentes as number | undefined) ?? 0

      if (asistenciaSnap.exists) {
        tx.delete(refAsistencia)
        tx.update(refEvento, { cantidadAsistentes: FieldValue.increment(-1) })
        return { asistiendo: false, cantidadAsistentes: Math.max(0, base - 1) }
      }

      tx.set(refAsistencia, {
        id: refAsistencia.id,
        eventoId,
        usuarioId,
        fechaCreacion: new Date().toISOString(),
      })
      tx.update(refEvento, { cantidadAsistentes: FieldValue.increment(1) })
      return { asistiendo: true, cantidadAsistentes: base + 1 }
    })
  }

  /** Crea un evento de la comunidad y retorna su vista enriquecida. */
  async crearEvento(user: CurrentUserPayload, dto: CrearEventoDto): Promise<EventoVista> {
    const inicio = Date.parse(dto.fechaInicio)
    if (Number.isNaN(inicio)) {
      throw new BadRequestException('fechaInicio debe ser una fecha ISO 8601 válida')
    }
    if (dto.fechaFin) {
      const fin = Date.parse(dto.fechaFin)
      if (Number.isNaN(fin)) {
        throw new BadRequestException('fechaFin debe ser una fecha ISO 8601 válida')
      }
      if (fin < inicio) {
        throw new BadRequestException('La fecha de fin debe ser posterior a la fecha de inicio')
      }
    }

    const ref = this.db.collection(COLECCIONES.eventos).doc()
    const datos = {
      id: ref.id,
      creadorId: user.id,
      titulo: dto.titulo,
      descripcion: dto.descripcion ?? null,
      categoria: dto.categoria,
      fechaInicio: dto.fechaInicio,
      fechaFin: dto.fechaFin ?? null,
      ubicacion: dto.ubicacion ?? null,
      urlImagen: dto.urlImagen ?? null,
      cantidadAsistentes: 0,
      activo: true,
      fechaCreacion: new Date().toISOString(),
    }
    await ref.set(datos)

    let creador: PerfilDoc | undefined
    try {
      const perfil = await this.db.collection(COLECCIONES.perfiles).doc(user.id).get()
      creador = perfil.exists ? (perfil.data() as PerfilDoc) : undefined
    } catch (creadorErr) {
      this.logger.error(`Error al obtener organizador: ${(creadorErr as Error).message}`, (creadorErr as Error).stack)
    }

    return {
      ...datos,
      asisto: false,
      nombreCreador: creador?.nombreCompleto ?? user.nombreCompleto ?? null,
      urlAvatarCreador: creador?.urlAvatar ?? null,
    }
  }
}
