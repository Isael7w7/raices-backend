import { DiccionarioConsultasService } from './diccionario-consultas.service'

describe('DiccionarioConsultasService', () => {
  let svc: DiccionarioConsultasService

  beforeEach(() => {
    svc = new DiccionarioConsultasService()
  })

  describe('preprocesarConsulta', () => {
    it('no expande consultas sin lenguaje coloquial relacionado', () => {
      const r = svc.preprocesarConsulta('hola, ¿cómo estás? cuéntame del clima')
      expect(r.expansiones).toHaveLength(0)
      expect(r.textoExpansion).toBe('')
    })

    it('devuelve resultado vacío para consulta vacía o no string', () => {
      expect(svc.preprocesarConsulta('').expansiones).toHaveLength(0)
      expect(svc.preprocesarConsulta(undefined as unknown as string).textoExpansion).toBe('')
    })

    it('expande una expresión coloquial a su término clínico, legal y de trámite', () => {
      const r = svc.preprocesarConsulta('me cortaron el pie arriba de la rodilla por la diabetes')
      expect(r.expansiones.length).toBeGreaterThan(0)

      const amputacion = r.expansiones.find(e =>
        /Amputación de miembro inferior/i.test(e.termino_tecnico_clinico),
      )
      expect(amputacion).toBeDefined()
      expect(amputacion?.termino_legal_educativo).toBeTruthy()
      expect(amputacion?.tramite_o_institucion_asociada).toMatch(/CEDis|Certificado/i)
      expect(r.textoExpansion).toContain('CLÍNICO:')
      expect(r.textoExpansion).toContain('TRÁMITE/INSTITUCIÓN:')
    })

    it('coincide por palabras clave RAG aunque no aparezca la frase completa', () => {
      const r = svc.preprocesarConsulta('¿puedo pedir prótesis después de la amputación?')
      expect(r.expansiones.some(e => /amputación|prótesis/i.test(e.expresion_coloquial + e.termino_tecnico_clinico))).toBe(true)
    })

    it('ignora acentos y mayúsculas en la consulta', () => {
      const a = svc.preprocesarConsulta('TENGO AUTISMO, ¿ME DAN EL CERTIFICADO?')
      const b = svc.preprocesarConsulta('tengo autismo, ¿me dan el certificado?')
      expect(a.consultaNormalizada).toBe(b.consultaNormalizada)
      expect(a.expansiones.length).toBe(b.expansiones.length)
      expect(a.expansiones.length).toBeGreaterThan(0)
    })

    it('empata singular y plural (raíz)', () => {
      const r = svc.preprocesarConsulta('necesito apoyos para silla de ruedas')
      expect(r.expansiones.some(e => /silla de ruedas/i.test(e.expresion_coloquial))).toBe(true)
    })

    it('los términos técnicos entregados son los oficiales del diccionario', () => {
      const r = svc.preprocesarConsulta('mi hijo tiene síndrome de Lennox Gastaut')
      expect(r.expansiones.length).toBeGreaterThan(0)
      expect(r.expansiones[0].termino_tecnico_clinico).toBeTruthy()
      expect(r.expansiones[0].termino_legal_educativo).toBeTruthy()
      expect(r.expansiones[0].tramite_o_institucion_asociada).toBeTruthy()
    })

    it('limita el número de expansiones para no ensuciar el embedding', () => {
      const consulta = [
        'soy sordo y uso lengua de señas',
        'tengo autismo y también silla de ruedas',
        'me cortaron el pie por diabetes',
        'discapacidad visual al 100% con paraplejia',
        'quiero empleo digno y certificado de discapacidad',
      ].join('. ')
      const r = svc.preprocesarConsulta(consulta)
      expect(r.expansiones.length).toBeGreaterThan(0)
      expect(r.expansiones.length).toBeLessThanOrEqual(5)
    })

    it('no produce coincidencias por subcadenas dentro de otras palabras', () => {
      // "ine" está en el diccionario como palabra clave, pero no debe coincidir
      // dentro de palabras como "linea"/"siguiente".
      const r = svc.preprocesarConsulta('la linea de atención es larga y sigue siendo la misma')
      expect(r.expansiones.some(e => e.coincidencias.includes('ine'))).toBe(false)
    })
  })
})
