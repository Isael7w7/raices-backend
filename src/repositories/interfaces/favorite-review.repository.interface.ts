// ─── Reseña (resenas) ──────────────────────────────────────────────────
export interface Resena {
  id: string
  usuarioId: string
  institucionId: string
  calificacion: number
  comentario: string
  fechaCreacion: string
}

// ─── Favorito (favoritos) ──────────────────────────────────────────────
export interface Favorito {
  id: string
  usuarioId: string
  institucionId: string
  fechaCreacion: string
}

// ─── DTOs ────────────────────────────────────────────────────────────
export interface CrearResenaDatos {
  usuarioId: string
  institucionId: string
  calificacion: number
  comentario: string
}

// ─── Token de inyección ──────────────────────────────────────────────
export const REPOSITORIO_FAVORITO_RESENA = 'REPOSITORIO_FAVORITO_RESENA'

// ─── Interfaz del repositorio ────────────────────────────────────────
export interface IRepositorioFavoritoResena {
  // ── Favoritos ──
  listarFavoritosPorUsuario(usuarioId: string): Promise<Favorito[]>
  buscarFavoritoPorUsuarioEInstitucion(usuarioId: string, institucionId: string): Promise<Favorito | null>
  crearFavorito(usuarioId: string, institucionId: string): Promise<void>
  eliminarFavorito(favoritoId: string): Promise<void>
  obtenerIdsInstitucionesFavoritas(usuarioId: string): Promise<string[]>

  // ── Reseñas ──
  listarResenasPorInstitucion(institucionId: string): Promise<Resena[]>
  buscarResenaPorUsuarioEInstitucion(usuarioId: string, institucionId: string): Promise<Resena | null>
  buscarResenaPorId(id: string): Promise<Resena | null>
  crearResena(datos: CrearResenaDatos): Promise<Resena>
  actualizarResena(id: string, calificacion: number, comentario: string): Promise<void>
  listarResenasPorUsuario(usuarioId: string): Promise<Resena[]>
  listarTodasResenas(limite?: number): Promise<Resena[]>
  eliminarResena(id: string): Promise<void>
}
