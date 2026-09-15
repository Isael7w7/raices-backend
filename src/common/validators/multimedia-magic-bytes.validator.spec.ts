import { MultimediaMagicBytesValidator } from './multimedia-magic-bytes.validator'

function archivo(mimetype: string, contenido: Buffer | string) {
  return { mimetype, buffer: typeof contenido === 'string' ? Buffer.from(contenido) : contenido } as Express.Multer.File
}

describe('MultimediaMagicBytesValidator', () => {
  const validador = new MultimediaMagicBytesValidator()

  it('acepta una imagen real (JPEG declarado + firma JPEG)', () => {
    expect(validador.isValid(archivo('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])))).toBe(true)
  })

  it('acepta un video MP4 real', () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftyp'), Buffer.from('isom')])
    expect(validador.isValid(archivo('video/mp4', mp4))).toBe(true)
  })

  it('acepta video/quicktime con firma MP4 (misma familia, mismo contenedor ftyp)', () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftyp'), Buffer.from('qt  ')])
    expect(validador.isValid(archivo('video/quicktime', mp4))).toBe(true)
  })

  it('acepta una foto HEIC real (image/heic + brand heic)', () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftyp'), Buffer.from('heic')])
    expect(validador.isValid(archivo('image/heic', heic))).toBe(true)
    expect(validador.isValid(archivo('image/heif', heic))).toBe(true)
  })

  it('rechaza HEIC declarado como video (familia distinta: brand heic no es mp4)', () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftyp'), Buffer.from('heic')])
    expect(validador.isValid(archivo('video/mp4', heic))).toBe(false)
  })

  it('rechaza contenido arbitrario con mimetype falseado (HTML declarado como image/jpeg)', () => {
    expect(validador.isValid(archivo('image/jpeg', '<html><script>alert(1)</script></html>'))).toBe(false)
  })

  it('rechaza un ejecutable falseado como image/png', () => {
    expect(validador.isValid(archivo('image/png', 'MZ....'))).toBe(false)
  })

  it('rechaza imagen real declarada como video (familia distinta)', () => {
    expect(validador.isValid(archivo('video/mp4', Buffer.from([0xff, 0xd8, 0xff, 0xe0])))).toBe(false)
  })

  it('rechaza mimetype fuera de la lista permitida aunque las bytes sean válidas', () => {
    expect(validador.isValid(archivo('application/pdf', '%PDF-1.4'))).toBe(false)
  })

  it('rechaza archivo sin contenido', () => {
    expect(validador.isValid(undefined)).toBe(false)
  })

  it('construye un mensaje de error legible', () => {
    expect(validador.buildErrorMessage()).toContain('imagen o video válido')
  })
})
