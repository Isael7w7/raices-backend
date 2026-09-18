import { Injectable, Inject, Logger } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { parsearTiposDiscapacidad } from '../../common/utils/firestore-helpers'

/** Métricas agregadas de una ruta */
export interface MetricaRuta {
  rutaId: string
  nombre: string
  discapacidad: string
  totalPasos: number
  pasosCompletados: number
  porcentajeProgreso: number
  tiempoDiasActiva: number
  estado: string
}

/** Resumen global de analytics */
export interface ResumenAnalytics {
  totalRutas: number
  rutasCompletadas: number
  tasaCompletado: number
  progresoPromedio: number
  porDiscapacidad: Record<string, { total: number; completadas: number; tasa: number }>
  pasosMasSaltados: { titulo: string; vecesOmitido: number }[]
  tiempoPromedioDias: number
}

@Injectable()
export class RoutesAnalyticsService {
  private readonly logger = new Logger('RoutesAnalyticsService')

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private col(nombre: string) { return this.db.collection(nombre) }

  /**
   * Registra un evento de analytics cuando se completa un paso.
   * Guarda en la colección `_analytics` para no afectar las colecciones principales.
   */
  async registrarCompletadoPaso(usuarioId: string, rutaId: string, pasoId: string, pasoTitulo: string) {
    try {
      const ref = this.col('_analytics').doc()
      await ref.set({
        tipo: 'paso_completado',
        usuarioId,
        rutaId,
        pasoId,
        pasoTitulo,
        fechaEvento: new Date().toISOString(),
      })
    } catch (err: unknown) {
      this.logger.warn(`registrarCompletadoPaso falló: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /**
   * Registra cuando un usuario genera una ruta personalizada.
   */
  async registrarGeneracionRuta(usuarioId: string, rutaId: string, origen: string, discapacidad: string) {
    try {
      const ref = this.col('_analytics').doc()
      await ref.set({
        tipo: 'ruta_generada',
        usuarioId,
        rutaId,
        origen,
        discapacidad,
        fechaEvento: new Date().toISOString(),
      })
    } catch (err: unknown) {
      this.logger.warn(`registrarGeneracionRuta falló: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /**
   * Obtiene el resumen global de analytics de rutas.
   */
  async obtenerResumen(): Promise<ResumenAnalytics> {
    try {
      // Cargar todas las rutas
      const rutasSnap = await this.col(COLECCIONES.rutasDesarrollo).get()
      const rutas = rutasSnap.docs.map(d => ({ id: d.id, ...d.data() } as Record<string, unknown>))

      const totalRutas = rutas.length
      const completadas = rutas.filter(r => r.estado === 'completada').length
      const tasaCompletado = totalRutas > 0 ? Math.round((completadas / totalRutas) * 100) : 0
      const progresoPromedio = totalRutas > 0
        ? Math.round(rutas.reduce((sum, r) => sum + Number(r.porcentajeProgreso ?? 0), 0) / totalRutas)
        : 0

      // Por discapacidad
      const porDiscapacidad: Record<string, { total: number; completadas: number; tasa: number }> = {}
      for (const ruta of rutas) {
        const disc = String(ruta.discapacidad ?? ruta.origen ?? 'desconocida')
        if (!porDiscapacidad[disc]) porDiscapacidad[disc] = { total: 0, completadas: 0, tasa: 0 }
        porDiscapacidad[disc].total++
        if (ruta.estado === 'completada') porDiscapacidad[disc].completadas++
      }
      for (const key of Object.keys(porDiscapacidad)) {
        const d = porDiscapacidad[key]
        d.tasa = d.total > 0 ? Math.round((d.completadas / d.total) * 100) : 0
      }

      // Tiempo promedio
      const ahora = new Date()
      let sumaDias = 0
      let countConTiempo = 0
      for (const ruta of rutas) {
        if (typeof ruta.fechaCreacion === 'string') {
          const creacion = new Date(ruta.fechaCreacion)
          const dias = Math.floor((ahora.getTime() - creacion.getTime()) / (1000 * 60 * 60 * 24))
          sumaDias += dias
          countConTiempo++
        }
      }
      const tiempoPromedioDias = countConTiempo > 0 ? Math.round(sumaDias / countConTiempo) : 0

      // Pasos más completados (de analytics)
      const eventosSnap = await this.col('_analytics')
        .where('tipo', '==', 'paso_completado')
        .get()

      const conteoPasos = new Map<string, number>()
      for (const evento of eventosSnap.docs) {
        const titulo = String(evento.data().pasoTitulo ?? '')
        if (titulo) conteoPasos.set(titulo, (conteoPasos.get(titulo) ?? 0) + 1)
      }

      const pasosMasCompletados = [...conteoPasos.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([titulo, veces]) => ({ titulo, vecesOmitido: veces }))

      return {
        totalRutas,
        rutasCompletadas: completadas,
        tasaCompletado,
        progresoPromedio,
        porDiscapacidad,
        pasosMasSaltados: pasosMasCompletados,
        tiempoPromedioDias,
      }
    } catch (err: unknown) {
      this.logger.error(`obtenerResumen falló: ${err instanceof Error ? err.message : String(err)}`)
      return {
        totalRutas: 0,
        rutasCompletadas: 0,
        tasaCompletado: 0,
        progresoPromedio: 0,
        porDiscapacidad: {},
        pasosMasSaltados: [],
        tiempoPromedioDias: 0,
      }
    }
  }
}
