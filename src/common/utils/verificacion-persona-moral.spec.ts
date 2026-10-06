import {
  MENSAJE_CSF_REQUERIDO,
  esPersonaMoral,
  puedeOperarComoPersonaMoral,
  tieneCsf,
} from './verificacion-persona-moral'

describe('verificacion-persona-moral', () => {
  describe('esPersonaMoral', () => {
    it('reconoce los roles de persona moral (incluye el subtipo empresa)', () => {
      expect(esPersonaMoral('institucion')).toBe(true)
      expect(esPersonaMoral('empresa')).toBe(true)
      expect(esPersonaMoral('institution')).toBe(true) // legacy
    })

    it('no confunde personas físicas ni roles vacíos', () => {
      for (const rol of ['pcd', 'padre_tutor', 'tutor', 'especialista', 'admin', '', undefined, null]) {
        expect(esPersonaMoral(rol)).toBe(false)
      }
    })
  })

  describe('tieneCsf', () => {
    it('acepta solo un documentoCsf con contenido real', () => {
      expect(tieneCsf({ documentoCsf: 'https://storage/csf.pdf' })).toBe(true)
    })

    it('rechaza null, undefined, vacío y solo espacios', () => {
      expect(tieneCsf({ documentoCsf: null })).toBe(false)
      expect(tieneCsf({ documentoCsf: undefined })).toBe(false)
      expect(tieneCsf({ documentoCsf: '' })).toBe(false)
      expect(tieneCsf({ documentoCsf: '  \n ' })).toBe(false)
      expect(tieneCsf({})).toBe(false)
      expect(tieneCsf(null)).toBe(false)
      expect(tieneCsf(undefined)).toBe(false)
    })
  })

  describe('puedeOperarComoPersonaMoral', () => {
    it('permite con CSF cargada aunque no esté aprobada', () => {
      expect(puedeOperarComoPersonaMoral({ verificada: false, documentoCsf: 'https://csf' })).toBe(true)
    })

    it('permite con aprobación de administrador aunque no tenga CSF', () => {
      expect(puedeOperarComoPersonaMoral({ verificada: true })).toBe(true)
    })

    it('bloquea cuando no hay CSF ni aprobación', () => {
      expect(puedeOperarComoPersonaMoral({ verificada: false })).toBe(false)
      expect(puedeOperarComoPersonaMoral({ verificada: false, documentoCsf: null })).toBe(false)
    })

    it('bloquea si la entidad no existe', () => {
      expect(puedeOperarComoPersonaMoral(null)).toBe(false)
      expect(puedeOperarComoPersonaMoral(undefined)).toBe(false)
    })

    it('no confunde truthy con true: "true" como texto no es aprobación', () => {
      expect(puedeOperarComoPersonaMoral({ verificada: 'true' as unknown as boolean })).toBe(false)
    })
  })

  describe('MENSAJE_CSF_REQUERIDO', () => {
    it('es el mensaje único de bloqueo y no menciona CURP', () => {
      expect(MENSAJE_CSF_REQUERIDO).toBe(
        'Tu cuenta requiere cargar la Constancia de Situación Fiscal (CSF) para publicar vacantes.',
      )
      expect(MENSAJE_CSF_REQUERIDO).not.toMatch(/CURP/i)
    })
  })
})