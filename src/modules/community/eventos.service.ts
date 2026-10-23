import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Firestore, FieldValue, DocumentData } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { obtenerDocumentosPorIds } from '../../common/utils/firestore-helpers'
import { paginar, RespuestaPaginada } from '../../common/dto/paginacion.dto'
import type { EventoDoc, PerfilDoc } from '../../common/interfaces/firestore-documents.interface'
import type { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { NotificationsService } from '../notifications/notifications.service'
import { CrearEventoDto } from './dto/crear-evento.dto'

/** Filtros del listado de eventos (sección "Eventos" de la comunidad). */
export interface FiltrosEventos {
  categoria?: string
  /** Día exacto (`YYYY-MM-DD`): busca eventos de esa fecha ignorando `desde`. */
  fecha?: string
  /** Fecha/hora mínima de inicio. Por defecto se usan "ahora" (próximos). */
  desde?: string
  buscar?: string
  /** Filtrar por ciudad */
  ciudad?: string
  /** Filtrar por modalidad: presencial, virtual o hibrido */
  modalidad?: 'presencial' | 'virtual' | 'hibrido'
  /** Solo eventos con fecha >= hoy. Por defecto true. */
  proximos?: boolean
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

/** Instante (ms) de una fecha ISO o `YYYY-MM-DD`; `NaN` si no es parseable.
 * Permite comparar eventos guardados como fecha simple con filtros completos.
 */
function instante(fecha: string | null | undefined): number {
  if (!fecha) return Number.NaN
  return Date.parse(fecha.length <= 10 ? `${fecha}T00:00:00.000Z` : fecha)
}

@Injectable()
export class EventosService {
  private readonly logger = new Logger(EventosService.name)
  private timerRecordatorios?: NodeJS.Timeout

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly notificaciones: NotificationsService,
  ) {
    this.programarRecordatorios24h()
  }

  /**
   * Programa el barrido horario de recordatorios "24 horas antes".
   * Se omite en tests (NODE_ENV=test) para no dejar timers vivos.
   */
  private programarRecordatorios24h(): void {
    if (process.env.NODE_ENV === 'test') return
    this.timerRecordatorios = setInterval(() => {
      void this.enviarRecordatorios24h().catch((e: unknown) =>
        this.logger.error(`Error en recordatorios de eventos: ${(e as Error).message}`, (e as Error).stack),
      )
    }, 60 * 60 * 1000)
    // No impide la salida del proceso si no hay más trabajo pendiente.
    this.timerRecordatorios.unref?.()
  }

  /**
   * Notifica a los usuarios activos de la misma ciudad que se publicó un
   * evento nuevo ("evento cercano"). Best-effort en segundo plano.
   */
  private async notificarEventoCercano(datos: { id: string; titulo: string; ciudad: string | null; creadorId: string }): Promise<number> {
    if (!datos.ciudad) return 0
    try {
      const snap = await this.db.collection(COLECCIONES.perfiles).where('ciudad', '==', datos.ciudad).get()
      const destinatarios = snap.docs
        .map(d => ({ id: d.id, ...(d.data() ?? {}) } as { id: string; activo?: boolean }))
        .filter(p => p.activo !== false && p.id !== datos.creadorId)
        .slice(0, 200)

      for (const p of destinatarios) {
        await this.notificaciones.crear(
          p.id,
          'evento_cercano',
          '📅 Nuevo evento en tu ciudad',
          `Se publicó "${datos.titulo}" en ${datos.ciudad}. ¡Revisa los detalles y comparte tu asistencia!`,
          datos.id,
        ).catch((e: unknown) => this.logger.warn(`No se pudo notificar evento cercano a ${p.id}: ${(e as Error).message}`))
      }
      return destinatarios.length
    } catch (e) {
      this.logger.warn(`No se pudo notificar el evento cercano ${datos.id}: ${(e as Error).message}`)
      return 0
    }
  }

  /**
   * Barrido de recordatorios: para cada evento activo que inicia dentro de las
   * próximas 24 horas y aún no avisado, avisa a los asistentes inscritos.
   *
   * El marcado `recordatorio24hEnviado` se reclama en una transacción, así que
   * si varias instancias de Cloud Run ejecutan el barrido a la vez, solo una
   * envía cada recordatorio.
   */
  async enviarRecordatorios24h(): Promise<{ avisados: number }> {
    const snap = await this.db.collection(COLECCIONES.eventos).where('activo', '==', true).get()
    const ahora = Date.now()
    const horizonte = ahora + 24 * 60 * 60 * 1000

    const candidatos = snap.docs.filter(d => {
      const e = d.data() as EventoDoc
      if (e.recordatorio24hEnviado) return false
      const inicio = instante(e.fechaInicio)
      return inicio > ahora && inicio <= horizonte
    })

    let avisados = 0
    for (const d of candidatos) {
      const e = d.data() as EventoDoc

      // Reclamo exclusivo: solo esta instancia envía el recordatorio.
      let reclamado = false
      try {
        await this.db.runTransaction(async tx => {
          const actual = await tx.get(d.ref)
          if (!actual.exists || actual.data()?.recordatorio24hEnviado) return
          tx.update(d.ref, {
            recordatorio24hEnviado: true,
            recordatorioEnviadoEn: new Date().toISOString(),
          })
          reclamado = true
        })
      } catch (e) {
        this.logger.warn(`No se pudo reclamar el recordatorio de ${d.id}: ${(e as Error).message}`)
        continue
      }
      if (!reclamado) continue

      try {
        const asistSnap = await this.db.collection(COLECCIONES.asistenciasEvento)
          .where('eventoId', '==', d.id).get()
        const destinatarios = [...new Set(
          asistSnap.docs.map(a => a.data()?.usuarioId as string | undefined).filter((id): id is string => !!id),
        )]

        for (const usuarioId of destinatarios) {
          await this.notificaciones.crear(
            usuarioId,
            'evento_recordatorio',
            '⏰ Tu evento es en menos de 24 horas',
            `Recuerda: "${e.titulo}" inicia el ${e.fechaInicio ?? ''}. ¡No faltes!`,
            d.id,
          ).catch((err: unknown) => this.logger.warn(`No se pudo notificar recordatorio a ${usuarioId}: ${(err as Error).message}`))
          avisados++
        }
      } catch (e) {
        this.logger.warn(`No se pudo notificar asistentes de ${d.id}: ${(e as Error).message}`)
      }
    }

    return { avisados }
  }

  /** Listado mejorado con filtros por ciudad, modalidad y proximos */
  async listar(
    usuarioId: string,
    pagina = 1,
    limite = 20,
    filtros: FiltrosEventos = {},
  ): Promise<RespuestaPaginada<EventoVista>> {
    try {
      const { categoria, fecha, desde, buscar, ciudad, modalidad, proximos = true } = filtros

      let q = this.db.collection(COLECCIONES.eventos).where('activo', '==', true)

      // Filtro por ciudad
      if (ciudad) {
        q = q.where('ciudad', '==', ciudad)
      }

      // Filtro por modalidad
      if (modalidad) {
        q = q.where('modalidad', '==', modalidad)
      }

      const snap = await q.get()
      let eventos = snap.docs.map(d => aDocumento<EventoDoc>(d))

      // Filtrar por fecha exacta
      if (fecha) {
        const dia = fecha.slice(0, 10)
        eventos = eventos.filter(e => (e.fechaInicio ?? '').slice(0, 10) === dia)
      } else {
        // Filtrar por fecha mínima
        const desde = instante(filtros.desde) || Date.now()
        eventos = eventos.filter(e => instante(e.fechaInicio) >= desde)
      }

      // Filtrar por búsqueda de texto
      if (buscar) {
        const termino = buscar.toLowerCase()
        eventos = eventos.filter(e =>
          (e.titulo ?? '').toLowerCase().includes(termino) ||
          (e.descripcion ?? '').toLowerCase().includes(termino),
        )
      }

      // Filtrar por modalidad si no ya fue filtrado por where
      if (modalidad && !eventos.some(e => e.modalidad === modalidad)) {
        // Already filtered at DB level, skip
      }

      // Filtrar por proximos (fecha >= hoy).
      // Con `fecha` (día exacto) o `desde` explícito se omite: permiten ver historial.
      if (proximos && !fecha && !filtros.desde) {
        const ahora = Date.now()
        eventos = eventos.filter(e => instante(e.fechaInicio) >= ahora)
      }

      // Filtrar por categoría
      if (categoria) {
        eventos = eventos.filter(e => e.categoria === categoria)
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

  /** Alterna la asistencia a un evento (confirmar / cancelar) con ID
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
      ciudad: dto.ciudad ?? null,
      modalidad: dto.modalidad ?? null,
      latitud: dto.latitud ?? null,
      longitud: dto.longitud ?? null,
      cupoMaximo: dto.cupoMaximo ?? 0,
      cantidadAsistentes: 0,
      totalInscritos: 0,
      activo: true,
      fechaCreacion: new Date().toISOString(),
    }
    await ref.set(datos)

    // "Evento cercano": avisa en segundo plano a los usuarios activos de la ciudad.
    void this.notificarEventoCercano({ id: ref.id, titulo: datos.titulo, ciudad: datos.ciudad ?? null, creadorId: user.id })
      .catch((e: unknown) => this.logger.warn(`Error al notificar evento cercano: ${(e as Error).message}`))

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
    } as EventoVista
  }

  /**
   * Elimina un evento con **borrado lógico** (soft delete): el evento deja de
   * aparecer en todos los listados (que filtran `activo === true`) pero el
   * documento y su histórico (asistencias) se conservan para auditoría.
   *
   * Solo el creador (`creadorId`) o un usuario con rol `admin` pueden
   * eliminarlo. `NotFoundException` si no existe.
   */
  async eliminarEvento(eventoId: string, usuarioId: string, rolUsuario?: string): Promise<{ eliminado: boolean }> {
    const refEvento = this.db.collection(COLECCIONES.eventos).doc(eventoId)
    const doc = await refEvento.get()
    if (!doc.exists) throw new NotFoundException('Evento no encontrado')

    const evento = doc.data() as EventoDoc | undefined
    if (evento?.creadorId !== usuarioId && rolUsuario !== 'admin') {
      throw new ForbiddenException('No tienes permiso para eliminar este evento')
    }

    await refEvento.update({
      activo: false,
      eliminadoEn: new Date().toISOString(),
      eliminadoPor: usuarioId,
    })

    return { eliminado: true }
  }
}