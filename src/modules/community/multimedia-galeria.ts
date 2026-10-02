/**
 * Utilidades del feed "Galería Conectemos".
 *
 * La galería es un feed EXCLUSIVAMENTE visual: solo deben aparecer
 * publicaciones que tengan al menos un adjunto gráfico real (imagen de arte,
 * dibujo, banner, video...). Se excluyen:
 *
 *  - publicaciones de solo texto;
 *  - arreglos vacíos (`imagenes: []`, `multimedia: []`, `archivos: []`);
 *  - adjuntos únicamente documentales (PDF, DOC, TXT, audio...), que no son
 *    renderizables en una cuadrícula visual.
 */

/** Tipos de recurso renderizables en la cuadrícula de la galería. */
export type TipoMedia = 'imagen' | 'video'

const EXTENSIONES_IMAGEN = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico', 'heic', 'heif', 'jfif',
])
const EXTENSIONES_VIDEO = new Set([
  'mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv', '3gp', 'ogv',
])

/** Adjuntos que la galería debe ignorar siempre (no son gráficos). */
export interface AdjuntosGaleria {
  mediaUrl?: unknown
  imagenes?: unknown
  multimedia?: unknown
  archivos?: unknown
  urlThumbnail?: unknown
  thumbnailUrl?: unknown
  [key: string]: unknown
}

/**
 * Extensión en minúsculas de una URL, ignorando query string y hash
 * (`.../foto.JPG?alt=media&token=x` → `jpg`). Cadena vacía si no tiene.
 */
export function extensionDeUrl(url: string): string {
  const sinQuery = url.split(/[?#]/)[0]
  const nombre = sinQuery.split('/').pop() ?? ''
  const punto = nombre.lastIndexOf('.')
  return punto > 0 ? nombre.slice(punto + 1).toLowerCase() : ''
}

/** Clasifica una URL: `imagen`, `video` o `null` si no es gráfica/desconocida. */
export function tipoDeRecurso(url: unknown): TipoMedia | null {
  if (typeof url !== 'string' || !url.trim()) return null
  const ext = extensionDeUrl(url)
  if (EXTENSIONES_IMAGEN.has(ext)) return 'imagen'
  if (EXTENSIONES_VIDEO.has(ext)) return 'video'
  return null
}

/**
 * ¿Esta URL cuenta para la galería?
 *  - extensión gráfica (imagen/video) → sí;
 *  - sin extensión (URL de blob/storage servida sin nombre legible) → sí;
 *  - extensión documental/de audio → no.
 */
export function cuentaParaGaleria(url: string): boolean {
  const ext = extensionDeUrl(url)
  if (ext === '') return true
  return EXTENSIONES_IMAGEN.has(ext) || EXTENSIONES_VIDEO.has(ext)
}

/** Normaliza un adjunto (string u objeto `{ url }`) a URL limpia, o `null`. */
function urlDeAdjunto(valor: unknown): string | null {
  if (typeof valor === 'string') {
    const texto = valor.trim()
    return texto || null
  }
  if (valor && typeof valor === 'object') {
    const obj = valor as { url?: unknown; src?: unknown }
    for (const candidato of [obj.url, obj.src]) {
      if (typeof candidato === 'string' && candidato.trim()) return candidato.trim()
    }
  }
  return null
}

function urlDeCampo(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null
}

/**
 * Lista las URLs de los recursos visuales de una publicación, en orden y sin
 * duplicados: `mediaUrl`, `imagenes[]`, `multimedia[]` y los `archivos[]` que
 * sean gráficos. Los arreglos vacíos y los documentos no gráficos se ignoran.
 */
export function recursosVisuales(publicacion: AdjuntosGaleria): string[] {
  const urls: string[] = []
  const agregar = (url: string | null) => {
    if (url && cuentaParaGaleria(url) && !urls.includes(url)) urls.push(url)
  }

  agregar(urlDeCampo(publicacion.mediaUrl))

  for (const campo of ['imagenes', 'multimedia'] as const) {
    const adjuntos = publicacion[campo]
    if (Array.isArray(adjuntos)) {
      for (const adjunto of adjuntos) agregar(urlDeAdjunto(adjunto))
    }
  }

  const archivos = publicacion.archivos
  if (Array.isArray(archivos)) {
    for (const archivo of archivos) agregar(urlDeAdjunto(archivo))
  }

  return urls
}

/**
 * Filtro estricto del feed: `true` solo si la publicación tiene al menos un
 * recurso visual renderizable (nunca texto puro ni adjuntos vacíos).
 */
export function tieneMultimediaGaleria(publicacion: AdjuntosGaleria): boolean {
  return recursosVisuales(publicacion).length > 0
}

/** Item de galería listo para el front: URLs visuales + miniatura + tipo. */
export interface ItemGaleria {
  /** Primera URL visual (garantiza un `mediaUrl` renderizable en la cuadrícula). */
  mediaUrl: string | null
  /** Todas las URLs visuales de la publicación (para el lightbox). */
  recursosVisuales: string[]
  /** Miniatura para la cuadrícula: `urlThumbnail` dedicada o el recurso original. */
  urlThumbnail: string | null
  /** `imagen` o `video` según el primer recurso (overlay del feed). */
  tipoMedia: TipoMedia | null
}

/**
 * Normaliza una publicación para la galería. El item siempre incluye las URLs
 * de los recursos visuales y la miniatura necesarias para renderizar el feed.
 */
export function construirItemGaleria<T extends AdjuntosGaleria>(publicacion: T): T & ItemGaleria {
  const recursos = recursosVisuales(publicacion)
  const principal = recursos[0] ?? null

  const thumbnailDedicado = urlDeCampo(publicacion.urlThumbnail) ?? urlDeCampo(publicacion.thumbnailUrl)

  return {
    ...publicacion,
    mediaUrl: principal,
    recursosVisuales: recursos,
    urlThumbnail: thumbnailDedicado ?? principal,
    tipoMedia: principal ? (tipoDeRecurso(principal) ?? 'imagen') : null,
  }
}
