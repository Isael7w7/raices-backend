import { Injectable, Inject, Logger } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { AuditLog } from '../interfaces/audit-log.interface'
import { PaginacionDto, paginar, ordenar, RespuestaPaginada } from '../dto/paginacion.dto'

// Valores por defecto para paginación
const DEFAULT_PAGINA = 1
const DEFAULT_LIMITE = 20

/**
 * Servicio de auditoría — registra acciones críticas de administración
 * en la colección `_auditoria` de Firestore para trazabilidad completa.
 *
 * @example
 * ```ts
 * // Uso directo en un service:
 * await this.audit.registrar({
 *   usuarioId: admin.id,
 *   usuarioEmail: admin.email,
 *   accion: AUDIT_ACCIONES.APROBAR_INSTITUCION,
 *   descripcion: 'Institución aprobada exitosamente',
 *   recurso: 'institucion',
 *   recursoId: institucionId,
 *   recursoNombre: 'Fundación ABC',
 *   resultado: 'exito',
 * })
 * ```
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('AuditService')

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private col() {
    return this.db.collection(COLECCIONES.auditoria)
  }

  /**
   * Registra una acción de auditoría en Firestore.
   * Los errores se loguean pero NO propagan para no bloquear la operación original.
   */
  async registrar(entry: Omit<AuditLog, 'id' | 'timestamp'> & { timestamp?: string }): Promise<void> {
    try {
      const doc: AuditLog = {
        timestamp: entry.timestamp ?? new Date().toISOString(),
        usuarioId: entry.usuarioId,
        usuarioEmail: entry.usuarioEmail,
        usuarioRol: entry.usuarioRol,
        accion: entry.accion,
        descripcion: entry.descripcion,
        recurso: entry.recurso,
        recursoId: entry.recursoId,
        recursoNombre: entry.recursoNombre,
        resultado: entry.resultado,
        metadatos: entry.metadatos,
        ip: entry.ip,
        userAgent: entry.userAgent,
      }

      await this.col().add(doc)
      this.logger.debug(`Auditoría registrada: ${entry.accion} → ${entry.recurso}`)
    } catch (err: any) {
      // La auditoría NUNCA debe bloquear la operación original
      this.logger.error(`Error al registrar auditoría: ${err.message}`)
    }
  }

  /**
   * Consulta logs de auditoría con paginación y filtros opcionales.
   */
  async consultar(paginacion: PaginacionDto, filtros?: {
    usuarioId?: string
    accion?: string
    recurso?: string
    fechaDesde?: string
    fechaHasta?: string
  }): Promise<RespuestaPaginada<AuditLog>> {
    let query: FirebaseFirestore.Query = this.col().orderBy('timestamp', 'desc')

    if (filtros?.usuarioId) {
      query = query.where('usuarioId', '==', filtros.usuarioId)
    }
    if (filtros?.accion) {
      query = query.where('accion', '==', filtros.accion)
    }
    if (filtros?.recurso) {
      query = query.where('recurso', '==', filtros.recurso)
    }

    // Firestore no soporta rangos de fechas con where compuesto sin índice,
    // así que filtramos en memoria para fechaDesde/fechaHasta
    const snap = await query.limit(500).get()
    let registros = snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog))

    if (filtros?.fechaDesde) {
      registros = registros.filter(r => r.timestamp >= filtros.fechaDesde!)
    }
    if (filtros?.fechaHasta) {
      registros = registros.filter(r => r.timestamp <= filtros.fechaHasta!)
    }

    const total = registros.length
    registros = ordenar(registros, 'timestamp', 'desc')

    const pagina = paginacion.pagina ?? DEFAULT_PAGINA
    const limite = paginacion.limite ?? DEFAULT_LIMITE
    const inicio = (pagina - 1) * limite
    return paginar(registros.slice(inicio, inicio + limite), total, pagina, limite)
  }

  /**
   * Obtiene estadísticas rápidas de auditoría.
   */
  async estadisticas() {
    const snap = await this.col().limit(1000).get()
    const registros = snap.docs.map(d => d.data() as AuditLog)

    const ahora = new Date()
    const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const hace7d = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const ultimas24h = registros.filter(r => r.timestamp >= hace24h).length
    const ultimos7d = registros.filter(r => r.timestamp >= hace7d).length

    // Acciones más frecuentes
    const porAccion: Record<string, number> = {}
    for (const r of registros) {
      porAccion[r.accion] = (porAccion[r.accion] ?? 0) + 1
    }
    const accionesFrecuentes = Object.entries(porAccion)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([accion, cantidad]) => ({ accion, cantidad }))

    // Usuarios más activos
    const porUsuario: Record<string, number> = {}
    for (const r of registros) {
      const key = r.usuarioEmail ?? r.usuarioId
      porUsuario[key] = (porUsuario[key] ?? 0) + 1
    }
    const usuariosActivos = Object.entries(porUsuario)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([usuario, cantidad]) => ({ usuario, cantidad }))

    // Errores recientes
    const erroresRecientes = registros
      .filter(r => r.resultado === 'error' && r.timestamp >= hace7d)
      .slice(0, 5)
      .map(r => ({ timestamp: r.timestamp, accion: r.accion, descripcion: r.descripcion }))

    return {
      totalRegistros: snap.size,
      ultimas24h,
      ultimos7d,
      accionesFrecuentes,
      usuariosActivos,
      erroresRecientes,
    }
  }
}
