// ─── Vacante (dominio) ────────────────────────────────────────────────
export interface Vacante {
  id: string
  institucionId: string
  titulo: string
  descripcion: string
  requisitos: string
  modalidad: string
  horario: string
  rangoSalario: string
  ciudad: string
  estado: string
  inclusivaDiscapacidad: boolean
  tiposDiscapacidad: string[]
  activa: boolean
  fechaCreacion: string
}

// ─── Postulación (dominio) ────────────────────────────────────────────
export interface Postulacion {
  id: string
  vacanteId: string
  usuarioId: string
  cartaPresentacion: string
  estado: string
  fechaCreacion: string
}

// ─── Filtros de búsqueda ──────────────────────────────────────────────
export interface FiltrosVacante {
  ciudad?: string
  modalidad?: string
  tipoDiscapacidad?: string
}

// ─── DTOs de creación ─────────────────────────────────────────────────
export interface CrearVacanteDatos {
  institucionId: string
  titulo: string
  descripcion?: string
  requisitos?: string
  modalidad?: string
  horario?: string
  rangoSalario?: string
  ciudad?: string
  estado?: string
  inclusivaDiscapacidad?: boolean
  tiposDiscapacidad?: string[]
}

export interface CrearPostulacionDatos {
  vacanteId: string
  usuarioId: string
  cartaPresentacion: string
}

// ─── Tokens de inyección ──────────────────────────────────────────────
export const REPOSITORIO_VACANTE = 'REPOSITORIO_VACANTE'

// ─── Interfaz del repositorio ────────────────────────────────────────
export interface IRepositorioVacante {
  listar(filtros?: FiltrosVacante): Promise<Vacante[]>
  buscarPorId(id: string): Promise<Vacante | null>
  buscarPorIds(ids: string[]): Promise<Vacante[]>
  crear(datos: CrearVacanteDatos): Promise<Vacante>
  actualizar(id: string, datos: Partial<Vacante>): Promise<void>
  eliminarSuave(id: string): Promise<void>
  contarActivas(): Promise<number>

  // ── Postulaciones ──
  crearPostulacion(datos: CrearPostulacionDatos): Promise<Postulacion>
  listarPostulacionesPorUsuario(usuarioId: string): Promise<Postulacion[]>
  buscarPostulacionPorUsuarioYVacante(usuarioId: string, vacanteId: string): Promise<Postulacion | null>
  obtenerIdsVacantesPostuladas(usuarioId: string): Promise<string[]>
}
