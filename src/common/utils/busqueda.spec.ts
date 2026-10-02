import { normalizarBusqueda, coincideBusqueda } from './busqueda'

describe('normalizarBusqueda', () => {
  it('convierte a minúsculas', () => {
    expect(normalizarBusqueda('María García')).toBe('maria garcia')
  })

  it('elimina acentos y diéresis', () => {
    expect(normalizarBusqueda('José')).toBe('jose')
    expect(normalizarBusqueda('pingüino')).toBe('pinguino')
    expect(normalizarBusqueda('niño')).toBe('nino')
  })

  it('recorta espacios sobrantes', () => {
    expect(normalizarBusqueda('  Ana  ')).toBe('ana')
  })

  it('retorna cadena vacía para valores no-string', () => {
    expect(normalizarBusqueda(undefined)).toBe('')
    expect(normalizarBusqueda(null)).toBe('')
    expect(normalizarBusqueda(42)).toBe('')
  })
})

describe('coincideBusqueda', () => {
  it('coincide parcial sin importar mayúsculas', () => {
    expect(coincideBusqueda('MAR', 'María García')).toBe(true)
    expect(coincideBusqueda('mar', 'María García')).toBe(true)
    expect(coincideBusqueda('garc', 'María García')).toBe(true)
  })

  it('coincide sin importar acentos en ambos lados', () => {
    expect(coincideBusqueda('jose', 'José Pérez')).toBe(true)
    expect(coincideBusqueda('josé', 'Jose Perez')).toBe(true)
    expect(coincideBusqueda('JOSE', 'josé')).toBe(true)
  })

  it('coincide contra cualquiera de los campos', () => {
    expect(coincideBusqueda('ana@', 'María García', 'ana@correo.com')).toBe(true)
    expect(coincideBusqueda('inexistente', 'María García', 'ana@correo.com')).toBe(false)
  })

  it('acepta campos null/undefined sin fallar', () => {
    expect(coincideBusqueda('x', null, undefined)).toBe(false)
    expect(coincideBusqueda('', null, undefined)).toBe(true)
  })

  it('término vacío no filtra', () => {
    expect(coincideBusqueda('   ', 'cualquier cosa')).toBe(true)
  })
})
