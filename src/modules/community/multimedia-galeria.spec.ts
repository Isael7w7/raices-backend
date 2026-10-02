import {
  extensionDeUrl,
  tipoDeRecurso,
  cuentaParaGaleria,
  recursosVisuales,
  tieneMultimediaGaleria,
  construirItemGaleria,
} from './multimedia-galeria'

/**
 * Filtro estricto del feed "Galería Conectemos": solo publicaciones con
 * adjuntos visuales reales (sin texto puro, arreglos vacíos ni documentos).
 */
describe('multimedia-galeria (filtro del feed)', () => {
  describe('extensionDeUrl', () => {
    it('ignora query string y hash', () => {
      expect(extensionDeUrl('https://storage/foto.JPG?alt=media&token=abc')).toBe('jpg')
      expect(extensionDeUrl('https://storage/video.mp4#t=10')).toBe('mp4')
    })

    it('retorna cadena vacía cuando no hay extensión', () => {
      expect(extensionDeUrl('https://storage/ruta/sin-extension')).toBe('')
      expect(extensionDeUrl('')).toBe('')
    })
  })

  describe('tipoDeRecurso', () => {
    it('clasifica imágenes y videos', () => {
      expect(tipoDeRecurso('https://x/a.png')).toBe('imagen')
      expect(tipoDeRecurso('https://x/a.webm')).toBe('video')
    })

    it('retorna null para documentos o valores inválidos', () => {
      expect(tipoDeRecurso('https://x/nota.pdf')).toBeNull()
      expect(tipoDeRecurso(null)).toBeNull()
      expect(tipoDeRecurso('')).toBeNull()
      expect(tipoDeRecurso(undefined)).toBeNull()
    })
  })

  describe('cuentaParaGaleria', () => {
    it('acepta imágenes y videos', () => {
      expect(cuentaParaGaleria('https://x/dibujo.jpeg')).toBe(true)
      expect(cuentaParaGaleria('https://x/banner.webp')).toBe(true)
      expect(cuentaParaGaleria('https://x/clase.mp4')).toBe(true)
    })

    it('rechaza documentos y audio', () => {
      expect(cuentaParaGaleria('https://x/convocatoria.pdf')).toBe(false)
      expect(cuentaParaGaleria('https://x/notas.txt')).toBe(false)
      expect(cuentaParaGaleria('https://x/audio.mp3')).toBe(false)
    })

    it('acepta URLs sin extensión (recursos servidos sin nombre legible)', () => {
      expect(cuentaParaGaleria('https://firebasestorage/o/recurso')).toBe(true)
    })
  })

  describe('recursosVisuales', () => {
    it('incluye mediaUrl, imagenes y multimedia, sin duplicados', () => {
      const recursos = recursosVisuales({
        mediaUrl: 'https://x/una.jpg',
        imagenes: ['https://x/una.jpg', 'https://x/dos.png'],
        multimedia: ['https://x/video.mp4'],
      })
      expect(recursos).toEqual(['https://x/una.jpg', 'https://x/dos.png', 'https://x/video.mp4'])
    })

    it('ignora arreglos vacíos', () => {
      expect(recursosVisuales({ imagenes: [], multimedia: [], archivos: [] })).toEqual([])
      expect(recursosVisuales({ mediaUrl: null, imagenes: [] })).toEqual([])
    })

    it('ignora adjuntos solo documentales en archivos', () => {
      expect(recursosVisuales({ archivos: ['https://x/acta.pdf', 'https://x/notas.txt'] })).toEqual([])
    })

    it('incluye los archivos que sí son gráficos', () => {
      expect(recursosVisuales({ archivos: ['https://x/acta.pdf', 'https://x/banner.png'] }))
        .toEqual(['https://x/banner.png'])
    })

    it('acepta adjuntos como objeto { url }', () => {
      expect(recursosVisuales({ imagenes: [{ url: 'https://x/arte.webp' }] }))
        .toEqual(['https://x/arte.webp'])
    })

    it('descarta strings vacíos y nulos dentro de los arreglos', () => {
      expect(recursosVisuales({ imagenes: ['', '   ', null, undefined] })).toEqual([])
    })
  })

  describe('tieneMultimediaGaleria', () => {
    it('excluye publicaciones de solo texto', () => {
      expect(tieneMultimediaGaleria({ mediaUrl: null })).toBe(false)
      expect(tieneMultimediaGaleria({})).toBe(false)
      expect(tieneMultimediaGaleria({ mediaUrl: '', imagenes: [] })).toBe(false)
    })

    it('excluye arreglos vacíos aunque los campos existan', () => {
      expect(tieneMultimediaGaleria({ imagenes: [], multimedia: [], archivos: [] })).toBe(false)
    })

    it('incluye publicaciones con imagen o video', () => {
      expect(tieneMultimediaGaleria({ mediaUrl: 'https://x/foto.jpg' })).toBe(true)
      expect(tieneMultimediaGaleria({ imagenes: ['https://x/foto.jpg'] })).toBe(true)
      expect(tieneMultimediaGaleria({ multimedia: ['https://x/foto.png'] })).toBe(true)
    })

    it('excluye publicaciones cuyo único adjunto es un documento', () => {
      expect(tieneMultimediaGaleria({ mediaUrl: 'https://x/documento.pdf' })).toBe(false)
      expect(tieneMultimediaGaleria({ archivos: ['https://x/documento.pdf'] })).toBe(false)
    })
  })

  describe('construirItemGaleria', () => {
    it('garantiza mediaUrl, recursosVisuales y urlThumbnail para la cuadrícula', () => {
      const item = construirItemGaleria({
        id: 'p1',
        mediaUrl: null,
        imagenes: ['https://x/arte.jpg'],
      })

      expect(item.mediaUrl).toBe('https://x/arte.jpg')
      expect(item.recursosVisuales).toEqual(['https://x/arte.jpg'])
      expect(item.urlThumbnail).toBe('https://x/arte.jpg')
      expect(item.tipoMedia).toBe('imagen')
    })

    it('prefiere la miniatura dedicada si existe', () => {
      const item = construirItemGaleria({
        mediaUrl: 'https://x/video.mp4',
        urlThumbnail: 'https://x/video-thumb.jpg',
      })

      expect(item.urlThumbnail).toBe('https://x/video-thumb.jpg')
      expect(item.tipoMedia).toBe('video')
    })

    it('no expone documentos no gráficos como mediaUrl de galería', () => {
      const item = construirItemGaleria({ mediaUrl: 'https://x/doc.pdf' })
      expect(item.mediaUrl).toBeNull()
      expect(item.urlThumbnail).toBeNull()
      expect(item.tipoMedia).toBeNull()
      expect(item.recursosVisuales).toEqual([])
    })

    it('conserva el resto de campos de la publicación', () => {
      const item = construirItemGaleria({
        id: 'p1',
        autorId: 'u1',
        contenido: 'Mi dibujo',
        categoriaCreativa: 'dibujo',
        mediaUrl: 'https://x/dibujo.png',
      })

      expect(item.id).toBe('p1')
      expect(item.categoriaCreativa).toBe('dibujo')
      expect(item.contenido).toBe('Mi dibujo')
    })
  })
})
