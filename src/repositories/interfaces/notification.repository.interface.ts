// ─── Notificación (notificaciones) ──────────────────────────────────────
export interface Notificacion {
  id: string
  usuarioId: string
  tipo: string
  titulo: string
  cuerpo: string
  referenciaId: string | null
  leida: boolean
  fechaCreacion: string
}

// ─── DTOs ────────────────────────────────────────────────────────────
export interface CrearNotificacionDatos {
  usuarioId: string
  tipo: string
  titulo: string
  cuerpo: string
  referenciaId?: string | null
}

// ─── Token de inyección ──────────────────────────────────────────────
export const REPOSITORIO_NOTIFICACION = 'REPOSITORIO_NOTIFICACION'

// ─── Interfaz del repositorio ────────────────────────────────────────
export interface IRepositorioNotificacion {
  crear(datos: CrearNotificacionDatos): Promise<Notificacion>
  listarPorUsuario(usuarioId: string): Promise<Notificacion[]>
  contarNoLeidas(usuarioId: string): Promise<number>
  marcarComoLeida(usuarioId: string, notificacionId: string): Promise<void>
  marcarTodasComoLeidas(usuarioId: string): Promise<void>
  eliminar(notificacionId: string): Promise<void>
}
