// ─── Institución (dominio) ────────────────────────────────────────────
export interface Institucion {
  id: string
  nombre: string
  descripcion: string
  categoria: string
  ciudad: string
  estado: string
  telefono: string
  email: string
  sitioWeb: string
  tiposDiscapacidad: string[]
  edadMinima: number | null
  edadMaxima: number | null
  calificacionPromedio: number
  cantidadCalificaciones: number
  activa: boolean
  verificada: boolean
  creadoPor: string
  fechaCreacion: string
  emailContacto?: string
}

// ─── Filtros de búsqueda ──────────────────────────────────────────────
export interface FiltrosInstitucion {
  categoria?: string
  ciudad?: string
  busqueda?: string
  tipoDiscapacidad?: string
  edad?: number
}

// ─── DTO de creación ──────────────────────────────────────────────────
export interface CrearInstitucionDatos {
  nombre: string
  descripcion?: string
  categoria: string
  ciudad?: string
  estado?: string
  telefono?: string
  email?: string
  sitioWeb?: string
  tiposDiscapacidad?: string[]
  edadMinima?: number
  edadMaxima?: number
  emailContacto?: string
}

// ─── Token de inyección ──────────────────────────────────────────────
export const REPOSITORIO_INSTITUCION = 'REPOSITORIO_INSTITUCION'

// ─── Interfaz del repositorio ────────────────────────────────────────
export interface IRepositorioInstitucion {
  listar(filtros?: FiltrosInstitucion): Promise<Institucion[]>
  buscarPorId(id: string): Promise<Institucion | null>
  buscarPorIds(ids: string[]): Promise<Institucion[]>
  crear(datos: CrearInstitucionDatos, usuarioId: string): Promise<Institucion>
  actualizar(id: string, datos: Partial<Institucion>): Promise<void>
  eliminarSuave(id: string): Promise<void>
  contarActivas(): Promise<number>
}
