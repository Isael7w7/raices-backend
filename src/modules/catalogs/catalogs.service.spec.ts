import { Test, TestingModule } from '@nestjs/testing'
import { CatalogsService } from './catalogs.service'

describe('CatalogsService', () => {
  let service: CatalogsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CatalogsService],
    }).compile()

    service = module.get<CatalogsService>(CatalogsService)
  })

  // ── getParentescos ──────────────────────────────────────────────────

  describe('getParentescos', () => {
    it('should return an array of 7 parentesco strings', () => {
      const result = service.getParentescos()

      expect(result).toBeInstanceOf(Array)
      expect(result).toHaveLength(7)
      expect(result).toEqual([
        'Hijo/a',
        'Hermano/a',
        'Nieto/a',
        'Sobrino/a',
        'Cónyuge',
        'Tutor legal',
        'Otro familiar',
      ])
    })

    it('should contain only non-empty strings', () => {
      const result = service.getParentescos()
      result.forEach(item => {
        expect(typeof item).toBe('string')
        expect(item.length).toBeGreaterThan(0)
      })
    })
  })

  // ── getDiscapacidades ───────────────────────────────────────────────

  describe('getDiscapacidades', () => {
    it('should return an array of 10 discapacidad strings', () => {
      const result = service.getDiscapacidades()

      expect(result).toBeInstanceOf(Array)
      expect(result).toHaveLength(10)
      expect(result).toEqual([
        'Motriz',
        'Visual',
        'Auditiva',
        'Intelectual',
        'Psicosocial',
        'TEA / Autismo',
        'Síndrome de Down',
        'Lenguaje',
        'Múltiple',
        'Otra',
      ])
    })

    it('should contain only non-empty strings', () => {
      const result = service.getDiscapacidades()
      result.forEach(item => {
        expect(typeof item).toBe('string')
        expect(item.length).toBeGreaterThan(0)
      })
    })
  })

  // ── getEtapasVida ───────────────────────────────────────────────────

  describe('getEtapasVida', () => {
    it('should return 5 etapas with id, label in Spanish and camelCase IDs', () => {
      const result = service.getEtapasVida()

      expect(result).toHaveLength(5)

      // Each etapa must have id (camelCase) and label (Spanish)
      result.forEach(etapa => {
        expect(etapa).toHaveProperty('id')
        expect(etapa).toHaveProperty('label')
        expect(typeof etapa.id).toBe('string')
        expect(typeof etapa.label).toBe('string')
        expect(etapa.label.length).toBeGreaterThan(0)
      })

      // Verify exact structure
      expect(result[0]).toEqual({ id: 'infancia', label: 'Infancia (0-12)' })
      expect(result[1]).toEqual({ id: 'adolescencia', label: 'Adolescencia (13-17)' })
      expect(result[2]).toEqual({ id: 'adultoJoven', label: 'Adulto joven (18-29)' })
      expect(result[3]).toEqual({ id: 'adulto', label: 'Adulto (30-59)' })
      expect(result[4]).toEqual({ id: 'mayor', label: 'Adulto mayor (60+)' })
    })

    it('should use camelCase for all IDs (no snake_case)', () => {
      const result = service.getEtapasVida()
      result.forEach(etapa => {
        expect(etapa.id).not.toContain('_')
      })
    })
  })

  // ── getFeatures ─────────────────────────────────────────────────────

  describe('getFeatures', () => {
    it('should return 7 features with id, label, description in Spanish', () => {
      const result = service.getFeatures()

      expect(result).toHaveLength(7)

      result.forEach(f => {
        expect(f).toHaveProperty('id')
        expect(f).toHaveProperty('label')
        expect(f).toHaveProperty('description')
        expect(typeof f.id).toBe('string')
        expect(typeof f.label).toBe('string')
        expect(typeof f.description).toBe('string')
      })

      // Verify specific feature IDs are in camelCase
      expect(result.map(f => f.id)).toEqual([
        'instituciones',
        'empleo',
        'comunidad',
        'mensajes',
        'favoritos',
        'asistenteIa',
        'notificaciones',
      ])
    })

    it('should have the asistenteIa feature with correct label', () => {
      const result = service.getFeatures()
      const asistente = result.find(f => f.id === 'asistenteIa')
      expect(asistente).toBeDefined()
      expect(asistente!.label).toBe('Asistente IA')
      expect(asistente!.description).toBe('Usar el asistente de inteligencia artificial')
    })
  })

  // ── getCategorias ───────────────────────────────────────────────────

  describe('getCategorias', () => {
    it('should return 4 categories with id, label, color', () => {
      const result = service.getCategorias()

      expect(result).toHaveLength(4)

      result.forEach(c => {
        expect(c).toHaveProperty('id')
        expect(c).toHaveProperty('label')
        expect(c).toHaveProperty('color')
        expect(typeof c.id).toBe('string')
        expect(typeof c.label).toBe('string')
        expect(typeof c.color).toBe('string')
      })

      expect(result[0]).toEqual({ id: 'funcional', label: 'Funcional', color: '#01ADFF' })
      expect(result[1]).toEqual({ id: 'educativo', label: 'Educativo', color: '#8B6BAE' })
      expect(result[2]).toEqual({ id: 'laboral', label: 'Laboral', color: '#D4944C' })
      expect(result[3]).toEqual({ id: 'social', label: 'Social', color: '#4BA3A3' })
    })

    it('should return valid hex color codes', () => {
      const result = service.getCategorias()
      result.forEach(c => {
        expect(c.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
      })
    })
  })
})
