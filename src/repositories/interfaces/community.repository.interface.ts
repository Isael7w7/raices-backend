// ─── Grupos de comunidad (grupos) ──────────────────────────────────────
export interface GrupoComunidad {
  id: string
  nombre: string
  descripcion: string
  esPublico: boolean
  cantidadMiembros: number
  fechaCreacion: string
  [key: string]: any
}

// ─── Publicaciones (publicaciones) ─────────────────────────────────────
export interface Publicacion {
  id: string
  autorId: string
  contenido: string
  grupoId: string | null
  cantidadMeGustas: number
  fechaCreacion: string
}

// ─── Comentarios (comentarios) ────────────────────────────────────────
export interface Comentario {
  id: string
  publicacionId: string
  autorId: string
  contenido: string
  fechaCreacion: string
}

// ─── Likes (meGustas) ────────────────────────────────────────────────
export interface MeGusta {
  id?: string
  usuarioId: string
  publicacionId: string
}

// ─── DTOs ────────────────────────────────────────────────────────────
export interface CrearPublicacionDatos {
  autorId: string
  contenido: string
  grupoId?: string | null
}

export interface CrearComentarioDatos {
  publicacionId: string
  autorId: string
  contenido: string
}

// ─── Token de inyección ──────────────────────────────────────────────
export const REPOSITORIO_COMUNIDAD = 'REPOSITORIO_COMUNIDAD'

// ─── Interfaz del repositorio ────────────────────────────────────────
export interface IRepositorioComunidad {
  listarGruposPublicos(): Promise<GrupoComunidad[]>

  listarPublicaciones(grupoId?: string, limite?: number): Promise<Publicacion[]>
  buscarPublicacionPorId(id: string): Promise<Publicacion | null>
  crearPublicacion(datos: CrearPublicacionDatos): Promise<Publicacion>
  incrementarMeGustas(publicacionId: string): Promise<void>
  decrementarMeGustas(publicacionId: string): Promise<void>
  contarTodasPublicaciones(): Promise<number>

  listarComentariosPorPublicacion(publicacionId: string): Promise<Comentario[]>
  crearComentario(datos: CrearComentarioDatos): Promise<Comentario>

  listarMeGustasPorUsuario(usuarioId: string): Promise<MeGusta[]>
  buscarMeGustaPorUsuarioYPublicacion(usuarioId: string, publicacionId: string): Promise<MeGusta | null>
  crearMeGusta(usuarioId: string, publicacionId: string): Promise<void>
  eliminarMeGustaPorId(meGustaId: string): Promise<void>
}
