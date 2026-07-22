// ─── Perfil de usuario (perfiles) ──────────────────────────────────────
export interface PerfilUsuario {
  id: string
  email: string
  nombreCompleto: string
  rol: string
  ciudad: string
  estado: string
  urlAvatar: string | null
  activo: boolean
  verificado: boolean
  fechaCreacion: string
}

// ─── Perfil extendido de necesidades (perfilesExtendidos) ──────────────
export interface PerfilNecesidades {
  id: string
  usuarioId: string
  tiposDiscapacidad: string[]
  severidadDiscapacidad: string | null
  modosComunicacion: string[]
  necesidadesMovilidad: string[]
  accesoTecnologia: string[]
  zonasPreferidas: string[]
  necesidades: string[]
  metasActuales: string[]
  areasApoyo: string[]
  historialEducacion: string[]
  historialTerapia: string[]
  etapaVida: string | null
  preocupacionesActuales: string | null
  nivelApoyo: string | null
}

// ─── DTOs ────────────────────────────────────────────────────────────
export interface CrearPerfilDatos {
  id: string
  email: string
  nombreCompleto: string
  rol: string
  ciudad?: string
  estado?: string
}

export interface ActualizarPerfilDatos {
  nombreCompleto?: string
  ciudad?: string
  estado?: string
  urlAvatar?: string | null
}

export interface ActualizarPerfilNecesidadesDatos {
  tiposDiscapacidad?: string[]
  severidadDiscapacidad?: string
  modosComunicacion?: string[]
  necesidadesMovilidad?: string[]
  accesoTecnologia?: string[]
  zonasPreferidas?: string[]
  necesidades?: string[]
  metasActuales?: string[]
  areasApoyo?: string[]
  historialEducacion?: string[]
  historialTerapia?: string[]
  etapaVida?: string
  preocupacionesActuales?: string
  nivelApoyo?: string
}

// ─── Token de inyección ──────────────────────────────────────────────
export const REPOSITORIO_PERFIL = 'REPOSITORIO_PERFIL'

// ─── Interfaz del repositorio ────────────────────────────────────────
export interface IRepositorioPerfil {
  // ── Perfiles de usuario (perfiles) ──
  buscarPorId(id: string): Promise<PerfilUsuario | null>
  buscarPorEmail(email: string): Promise<PerfilUsuario | null>
  crear(datos: CrearPerfilDatos): Promise<PerfilUsuario>
  actualizar(id: string, datos: ActualizarPerfilDatos): Promise<void>
  actualizarCampos(id: string, campos: Record<string, any>): Promise<void>
  eliminarSuave(id: string): Promise<void>
  existePorEmail(email: string): Promise<boolean>
  listarTodos(campoOrden?: string): Promise<PerfilUsuario[]>
  contarActivos(): Promise<number>
  contarTodos(): Promise<number>
  listarPorRol(rol: string): Promise<PerfilUsuario[]>

  // ── Perfiles extendidos de necesidades (perfilesExtendidos) ──
  buscarPerfilNecesidadesPorUsuario(usuarioId: string): Promise<PerfilNecesidades | null>
  guardarPerfilNecesidades(usuarioId: string, datos: ActualizarPerfilNecesidadesDatos): Promise<PerfilNecesidades>
  contarPerfilesNecesidades(): Promise<number>
  listarTodosPerfilesNecesidades(): Promise<PerfilNecesidades[]>
}
