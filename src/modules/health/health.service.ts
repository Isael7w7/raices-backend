import { Injectable, Inject, Logger } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'

/** Tiempo máximo de espera para la comprobación de Firestore.
 * Debe quedar por debajo del timeout del healthcheck de Docker (3s) para
 * que el endpoint no alcance el límite del probe y marque el contenedor
 * como unhealthy de forma intermitente. */
const TIEMPO_MAXIMO_FIRESTORE_MS = 2000

export interface ResultadoCheckProceso {
  estado: 'ok'
  uptimeSegundos: number
  memoriaMb: number
  versionNode: string
  timestamp: string
}

export interface ResultadoCheckFirestore {
  estado: 'ok' | 'error'
  detalle?: string
}

export interface ResultadoHealth {
  status: 'ok' | 'degraded'
  checks: {
    proceso: ResultadoCheckProceso
    firestore: ResultadoCheckFirestore
  }
  tiempoMs: number
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger('HealthService')

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  /**
   * Comprobación de salud con checks separados:
   * - Proceso: el proceso Node está vivo (uptime, memoria, versión).
   * - Firestore: lectura mínima para validar conectividad y credenciales.
   * El resultado es 'ok' solo si ambos checks lo están; si Firestore falla,
   * se reporta 'degraded' con el detalle del error.
   */
  async check(): Promise<ResultadoHealth> {
    const inicio = Date.now()

    const proceso: ResultadoCheckProceso = {
      estado: 'ok',
      uptimeSegundos: Math.round(process.uptime()),
      memoriaMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      versionNode: process.version,
      timestamp: new Date().toISOString(),
    }

    const firestore = await this.verificarFirestore()

    return {
      status: firestore.estado === 'ok' ? 'ok' : 'degraded',
      checks: { proceso, firestore },
      tiempoMs: Date.now() - inicio,
    }
  }

  private async verificarFirestore(): Promise<ResultadoCheckFirestore> {
    let timeout: NodeJS.Timeout | undefined
    try {
      const conTimeout = new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Timeout al consultar Firestore')),
          TIEMPO_MAXIMO_FIRESTORE_MS,
        )
      })
      // Lectura mínima: una colección inexistente devuelve un snapshot vacío
      // sin error, por lo que esto valida conectividad sin depender de datos.
      await Promise.race([
        this.db.collection(COLECCIONES.configuraciones).limit(1).get(),
        conTimeout,
      ])
      return { estado: 'ok' }
    } catch (e: any) {
      this.logger.error(`Health check: Firestore inaccesible: ${e?.message ?? e}`)
      return { estado: 'error', detalle: e?.message ?? 'Firestore inaccesible' }
    } finally {
      clearTimeout(timeout)
    }
  }
}
