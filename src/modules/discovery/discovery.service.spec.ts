import { Test, TestingModule } from '@nestjs/testing'
import { DiscoveryService } from './discovery.service'
import { FIRESTORE } from '../../database/firebase.provider'

describe('DiscoveryService', () => {
  let service: DiscoveryService
  let firestoreMock: Record<string, any>

  beforeEach(async () => {
    firestoreMock = { collection: jest.fn() }
    const module: TestingModule = await Test.createTestingModule({
      providers: [DiscoveryService, { provide: FIRESTORE, useValue: firestoreMock }],
    }).compile()
    service = module.get<DiscoveryService>(DiscoveryService)
  })

  describe('discover', () => {
    it('should return institutions with coincidePerfil flag', async () => {
      const perfilData = { tiposDiscapacidad: '["tea"]' }
      const instituciones = [
        { id: 'inst1', nombre: 'Centro A', activa: true, calificacionPromedio: 4.5, tiposDiscapacidad: '["tea","motriz"]' },
        { id: 'inst2', nombre: 'Centro B', activa: true, calificacionPromedio: 3.0, tiposDiscapacidad: '["motriz"]' },
      ]

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [{ data: () => perfilData }], empty: false }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: instituciones.map(i => ({ id: i.id, data: () => i })) }) })

      const result = await service.discover('u1')
      expect(result).toHaveLength(2)
      // inst1 has 'tea' which matches user profile, should be first
      expect(result[0].coincidePerfil).toBe(true)
      expect(result[1].coincidePerfil).toBe(false)
    })

    it('should filter by ciudad', async () => {
      const instituciones = [
        { id: 'inst1', nombre: 'A', activa: true, ciudad: 'Mérida', tiposDiscapacidad: '[]' },
        { id: 'inst2', nombre: 'B', activa: true, ciudad: 'Cancún', tiposDiscapacidad: '[]' },
      ]

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [], empty: true }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: instituciones.map(i => ({ id: i.id, data: () => i })) }) })

      const result = await service.discover('u1', { ciudad: 'Mérida' })
      expect(result).toHaveLength(1)
      expect(result[0].ciudad).toBe('Mérida')
    })

    it('should filter by busqueda', async () => {
      const instituciones = [
        { id: 'inst1', nombre: 'Centro Rehabilitación', activa: true, tiposDiscapacidad: '[]' },
        { id: 'inst2', nombre: 'Escuela Especial', activa: true, tiposDiscapacidad: '[]' },
      ]

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [], empty: true }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: instituciones.map(i => ({ id: i.id, data: () => i })) }) })

      const result = await service.discover('u1', { busqueda: 'rehabilitación' })
      expect(result).toHaveLength(1)
      expect(result[0].nombre).toContain('Rehabilitación')
    })

    it('should handle user with no profile', async () => {
      const instituciones = [
        { id: 'inst1', nombre: 'A', activa: true, tiposDiscapacidad: '[]' },
      ]

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [], empty: true }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: instituciones.map(i => ({ id: i.id, data: () => i })) }) })

      const result = await service.discover('u1')
      expect(result).toHaveLength(1)
      expect(result[0].coincidePerfil).toBe(false)
    })

    it('should limit to 50 institutions', async () => {
      const instituciones = Array.from({ length: 60 }, (_, i) => ({
        id: `inst${i}`, nombre: `Centro ${i}`, activa: true, calificacionPromedio: i, tiposDiscapacidad: '[]',
      }))

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [], empty: true }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: instituciones.map(i => ({ id: i.id, data: () => i })) }) })

      const result = await service.discover('u1')
      expect(result).toHaveLength(50)
    })
  })
})
