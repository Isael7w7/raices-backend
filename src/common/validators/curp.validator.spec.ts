import { esCurpValida, validarCurp } from './curp.validator'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * CURP Validator — Unit Tests
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Tests unitarios para el validador de CURP mexicana que verifica:
 *
 * 1. Formato regex: 4 letras + 6 dígitos + H/M + 5 letras + 1 alfanumérico + 1 dígito
 * 2. Longitud exacta de 18 caracteres
 * 3. Sexo válido (H o M en posición 11)
 * 4. Entidad federativa válida (posiciones 12-13)
 * 5. Normalización a mayúsculas
 * 6. Mensajes de error descriptivos (validarCurp)
 * ══════════════════════════════════════════════════════════════════════════════
 */

describe('CURP Validator', () => {
  // ══════════════════════════════════════════════════════════════════════════
  // esCurpValida()
  // ══════════════════════════════════════════════════════════════════════════

  describe('esCurpValida()', () => {
    // ── CURPs válidas ────────────────────────────────────────────────────────

    it('debería aceptar una CURP válida de 18 caracteres', () => {
      // GAPL800101HMCYRL09 → GAPL (iniciales) + 800101 (01/ene/1980) + H (hombre) + MC (Michoacán) + YRL (consonantes) + 0 (vocal) + 9 (diferenciador)
      expect(esCurpValida('GAPL800101HMCYRL09')).toBe(true)
    })

    it('debería aceptar CURP con sexo femenino (M)', () => {
      // GAPL + 800101 + M(sexo) + DF(entidad) + RLA(consonantes) + 0(vocal) + 9(diferenciador)
      expect(esCurpValida('GAPL800101MDFRLA09')).toBe(true)
    })

    it('debería aceptar CURP de todas las entidades federativas válidas', () => {
      const entidades = [
        'AS', 'BC', 'BS', 'CC', 'CS', 'CH', 'CL', 'CM', 'DF', 'DG',
        'GT', 'HG', 'JC', 'MC', 'MN', 'MS', 'NT', 'NL', 'OC', 'PL',
        'QT', 'QR', 'SP', 'SL', 'SR', 'TC', 'TS', 'TL', 'VZ', 'YN', 'ZS',
      ]
      for (const entidad of entidades) {
        // GAPL + 800101 + H(sexo) + entidad + RLA(consonantes) + 0(vocal) + 9(diferenciador)
        const curp = `GAPL800101H${entidad}RLA09`
        expect(esCurpValida(curp)).toBe(true)
      }
    })

    it('debería aceptar CURP en minúsculas (se normaliza internamente)', () => {
      expect(esCurpValida('gapl800101hmcyrl09')).toBe(true)
    })

    it('debería aceptar CURP con espacios alrededor', () => {
      expect(esCurpValida('  GAPL800101HMCYRL09  ')).toBe(true)
    })

    // ── Longitud inválida ────────────────────────────────────────────────────

    it('debería rechazar cadena vacía', () => {
      expect(esCurpValida('')).toBe(false)
    })

    it('debería rechazar null/undefined', () => {
      expect(esCurpValida(null as any)).toBe(false)
      expect(esCurpValida(undefined as any)).toBe(false)
    })

    it('debería rechazar CURP con menos de 18 caracteres', () => {
      expect(esCurpValida('GAPL800101HMCYRL0')).toBe(false) // 17 chars
    })

    it('debería rechazar CURP con más de 18 caracteres', () => {
      expect(esCurpValida('GAPL800101HMCYRL090')).toBe(false) // 19 chars
    })

    // ── Formato regex inválido ───────────────────────────────────────────────

    it('debería rechazar CURP con caracteres especiales', () => {
      expect(esCurpValida('GAPL800101HMCYRL#9')).toBe(false)
    })

    it('debería rechazar CURP con letras en la parte de fecha', () => {
      expect(esCurpValida('GAPLABCD01HMCYRL09')).toBe(false) // ABCD en posición 5-8
    })

    it('debería rechazar CURP sin H/M en posición 11', () => {
      expect(esCurpValida('GAPL800101XMCYRL09')).toBe(false) // X no es H ni M
    })

    // ── Sexo inválido ────────────────────────────────────────────────────────

    it('debería rechazar CURP con sexo X (no H ni M)', () => {
      expect(esCurpValida('GAPL800101XMCYRL09')).toBe(false)
    })

    it('debería rechazar CURP con sexo número', () => {
      expect(esCurpValida('GAPL8001011MCYRL09')).toBe(false) // 1 en posición 11
    })

    // ── Entidad federativa inválida ──────────────────────────────────────────

    it('debería rechazar CURP con entidad "XX" (no existe)', () => {
      expect(esCurpValida('GAPL800101HXXRLAA9')).toBe(false)
    })

    it('debería rechazar CURP con entidad "ZZ" (no existe)', () => {
      expect(esCurpValida('GAPL800101HZZRLAA9')).toBe(false)
    })

    it('debería rechazar CURP con entidad "AA" (no existe)', () => {
      expect(esCurpValida('GAPL800101HAARLAA9')).toBe(false)
    })

    // ── No numérico ──────────────────────────────────────────────────────────

    it('debería rechazar una cadena numérica de 18 dígitos', () => {
      expect(esCurpValida('123456789012345678')).toBe(false)
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // validarCurp()
  // ══════════════════════════════════════════════════════════════════════════

  describe('validarCurp()', () => {
    it('debería retornar null para CURP válida', () => {
      expect(validarCurp('GAPL800101HMCYRL09')).toBeNull()
    })

    it('debería retornar null para CURP válida en minúsculas', () => {
      expect(validarCurp('gapl800101hmcyrl09')).toBeNull()
    })

    it('debería retornar mensaje de error para cadena vacía', () => {
      expect(validarCurp('')).toBe('La CURP es requerida')
    })

    it('debería retornar mensaje de error para null/undefined', () => {
      expect(validarCurp(null as any)).toBe('La CURP es requerida')
      expect(validarCurp(undefined as any)).toBe('La CURP es requerida')
    })

    it('debería indicar la longitud actual en error de longitud', () => {
      const resultado = validarCurp('GAPL80')
      expect(resultado).toContain('18 caracteres')
      expect(resultado).toContain('actual: 6')
    })

    it('debería retornar error de formato para CURP con caracteres inválidos', () => {
      expect(validarCurp('GAPL800101HMCYRL#9')).toContain('formato válido')
    })

    it('debería retornar error de entidad para entidad inválida', () => {
      const resultado = validarCurp('GAPL800101HXXRLAA9')
      expect(resultado).toContain('entidad federativa')
      expect(resultado).toContain('XX')
    })

    it('debería retornar error de formato para sexo inválido (X no es H/M)', () => {
      const resultado = validarCurp('GAPL800101XMCYRL09')
      expect(resultado).toContain('formato válido')
    })
  })
})
