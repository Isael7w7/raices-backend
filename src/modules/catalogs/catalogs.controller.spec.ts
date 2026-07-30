import { Test, TestingModule } from '@nestjs/testing'
import { CatalogsController } from './catalogs.controller'
import { CatalogsService } from './catalogs.service'

describe('CatalogsController', () => {
  let controller: CatalogsController
  let service: CatalogsService

  const mockService = {
    getParentescos: jest.fn(),
    getDiscapacidades: jest.fn(),
    getEtapasVida: jest.fn(),
    getFeatures: jest.fn(),
    getCategorias: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatalogsController],
      providers: [{ provide: CatalogsService, useValue: mockService }],
    }).compile()

    controller = module.get<CatalogsController>(CatalogsController)
    service = module.get<CatalogsService>(CatalogsService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // ── parentescos ─────────────────────────────────────────────────────

  describe('GET /catalogos/parentescos', () => {
    it('should return parentescos from service', () => {
      const expected = ['Hijo/a', 'Hermano/a', 'Nieto/a']
      mockService.getParentescos.mockReturnValue(expected)

      const result = controller.parentescos()

      expect(mockService.getParentescos).toHaveBeenCalledTimes(1)
      expect(result).toEqual(expected)
    })
  })

  // ── discapacidades ──────────────────────────────────────────────────

  describe('GET /catalogos/discapacidades', () => {
    it('should return discapacidades from service', () => {
      const expected = ['Motriz', 'Visual', 'Auditiva']
      mockService.getDiscapacidades.mockReturnValue(expected)

      const result = controller.discapacidades()

      expect(mockService.getDiscapacidades).toHaveBeenCalledTimes(1)
      expect(result).toEqual(expected)
    })
  })

  // ── etapas-vida ─────────────────────────────────────────────────────

  describe('GET /catalogos/etapas-vida', () => {
    it('should return etapas de vida from service', () => {
      const expected = [
        { id: 'infancia', label: 'Infancia (0-12)' },
        { id: 'adultoJoven', label: 'Adulto joven (18-29)' },
      ]
      mockService.getEtapasVida.mockReturnValue(expected)

      const result = controller.etapasVida()

      expect(mockService.getEtapasVida).toHaveBeenCalledTimes(1)
      expect(result).toEqual(expected)
    })
  })

  // ── features ────────────────────────────────────────────────────────

  describe('GET /catalogos/features', () => {
    it('should return features from service', () => {
      const expected = [
        { id: 'instituciones', label: 'Instituciones', description: 'Explorar instituciones' },
      ]
      mockService.getFeatures.mockReturnValue(expected)

      const result = controller.features()

      expect(mockService.getFeatures).toHaveBeenCalledTimes(1)
      expect(result).toEqual(expected)
    })
  })

  // ── categorias ──────────────────────────────────────────────────────

  describe('GET /catalogos/categorias', () => {
    it('should return categorias from service', () => {
      const expected = [
        { id: 'funcional', label: 'Funcional', color: '#01ADFF' },
      ]
      mockService.getCategorias.mockReturnValue(expected)

      const result = controller.categorias()

      expect(mockService.getCategorias).toHaveBeenCalledTimes(1)
      expect(result).toEqual(expected)
    })
  })
})
