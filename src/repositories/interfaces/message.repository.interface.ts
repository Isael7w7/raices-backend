// ─── Mensaje directo (mensajesDirectos) ─────────────────────────────────
export interface Mensaje {
  id: string
  remitenteId: string
  destinatarioId: string
  contenido: string
  leido: boolean
  fechaCreacion: string
}

// ─── DTOs ────────────────────────────────────────────────────────────
export interface CrearMensajeDatos {
  remitenteId: string
  destinatarioId: string
  contenido: string
}

// ─── Token de inyección ──────────────────────────────────────────────
export const REPOSITORIO_MENSAJE = 'REPOSITORIO_MENSAJE'

// ─── Interfaz del repositorio ────────────────────────────────────────
export interface IRepositorioMensaje {
  listarEnviadosPorUsuario(usuarioId: string): Promise<Mensaje[]>
  listarRecibidosPorUsuario(usuarioId: string): Promise<Mensaje[]>
  listarMensajesEntre(usuarioId: string, parceiroId: string): Promise<Mensaje[]>
  enviar(datos: CrearMensajeDatos): Promise<Mensaje>
  contarNoLeidos(usuarioId: string): Promise<number>
  marcarComoLeidos(remitenteId: string, destinatarioId: string): Promise<void>
  marcarTodosComoLeidos(usuarioId: string): Promise<void>
}
