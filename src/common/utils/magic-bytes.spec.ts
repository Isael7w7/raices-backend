import { detectarTipoMultimediaPorBytes, REGEX_TIPOS_MULTIMEDIA } from './magic-bytes'

describe('detectarTipoMultimediaPorBytes', () => {
  it('detecta JPEG (FF D8 FF)', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
    expect(detectarTipoMultimediaPorBytes(buf)).toBe('image/jpeg')
  })

  it('detecta PNG (89 50 4E 47 0D 0A 1A 0A)', () => {
    const buf = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('datos')])
    expect(detectarTipoMultimediaPorBytes(buf)).toBe('image/png')
  })

  it('detecta GIF (GIF87a y GIF89a)', () => {
    expect(detectarTipoMultimediaPorBytes(Buffer.from('GIF87a-datos'))).toBe('image/gif')
    expect(detectarTipoMultimediaPorBytes(Buffer.from('GIF89a-datos'))).toBe('image/gif')
  })

  it('detecta WebP (RIFF....WEBP)', () => {
    const buf = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')])
    expect(detectarTipoMultimediaPorBytes(buf)).toBe('image/webp')
  })

  it('detecta AVI (RIFF....AVI )', () => {
    const buf = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('AVI ')])
    expect(detectarTipoMultimediaPorBytes(buf)).toBe('video/x-msvideo')
  })

  it('detecta MP4 / QuickTime (caja ftyp con brand isom/qt en offset 4)', () => {
    const buf = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftyp'), Buffer.from('isom')])
    expect(detectarTipoMultimediaPorBytes(buf)).toBe('video/mp4')
    const qt = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftyp'), Buffer.from('qt  ')])
    expect(detectarTipoMultimediaPorBytes(qt)).toBe('video/mp4')
  })

  it('detecta HEIC / HEIF (ftyp con brand heic/mif1)', () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftyp'), Buffer.from('heic')])
    expect(detectarTipoMultimediaPorBytes(heic)).toBe('image/heic')
    const mif1 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftyp'), Buffer.from('mif1')])
    expect(detectarTipoMultimediaPorBytes(mif1)).toBe('image/heic')
    const hevx = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftyp'), Buffer.from('hevx')])
    expect(detectarTipoMultimediaPorBytes(hevx)).toBe('image/heic')
  })

  it('detecta HEIF de secuencia (brands heim/hevs usados por Live Photos)', () => {
    const hevs = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftyp'), Buffer.from('hevs')])
    expect(detectarTipoMultimediaPorBytes(hevs)).toBe('image/heic')
    const heim = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftyp'), Buffer.from('heim')])
    expect(detectarTipoMultimediaPorBytes(heim)).toBe('image/heic')
  })

  it('detecta WebM (EBML 1A 45 DF A3)', () => {
    const buf = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00])
    expect(detectarTipoMultimediaPorBytes(buf)).toBe('video/webm')
  })

  it('retorna null para contenido arbitrario (HTML, ejecutables, texto)', () => {
    expect(detectarTipoMultimediaPorBytes(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull()
    expect(detectarTipoMultimediaPorBytes(Buffer.from('MZ....'))).toBeNull()
    expect(detectarTipoMultimediaPorBytes(Buffer.from(''))).toBeNull()
    expect(detectarTipoMultimediaPorBytes(null)).toBeNull()
    expect(detectarTipoMultimediaPorBytes(undefined)).toBeNull()
  })

  it('retorna null para un contenedor RIFF con tipo no reconocido', () => {
    expect(detectarTipoMultimediaPorBytes(Buffer.from('RIFF0000XXXX'))).toBeNull()
  })
})

describe('REGEX_TIPOS_MULTIMEDIA', () => {
  it('acepta los mimetypes permitidos', () => {
    expect(REGEX_TIPOS_MULTIMEDIA.test('image/jpeg')).toBe(true)
    expect(REGEX_TIPOS_MULTIMEDIA.test('image/png')).toBe(true)
    expect(REGEX_TIPOS_MULTIMEDIA.test('image/webp')).toBe(true)
    expect(REGEX_TIPOS_MULTIMEDIA.test('image/gif')).toBe(true)
    expect(REGEX_TIPOS_MULTIMEDIA.test('image/heic')).toBe(true)
    expect(REGEX_TIPOS_MULTIMEDIA.test('image/heif')).toBe(true)
    expect(REGEX_TIPOS_MULTIMEDIA.test('video/mp4')).toBe(true)
    expect(REGEX_TIPOS_MULTIMEDIA.test('video/webm')).toBe(true)
    expect(REGEX_TIPOS_MULTIMEDIA.test('video/quicktime')).toBe(true)
    expect(REGEX_TIPOS_MULTIMEDIA.test('video/x-msvideo')).toBe(true)
  })

  it('rechaza mimetypes fuera de la lista', () => {
    expect(REGEX_TIPOS_MULTIMEDIA.test('application/pdf')).toBe(false)
    expect(REGEX_TIPOS_MULTIMEDIA.test('text/html')).toBe(false)
    expect(REGEX_TIPOS_MULTIMEDIA.test('application/octet-stream')).toBe(false)
  })
})
