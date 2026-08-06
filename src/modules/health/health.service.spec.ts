import { Test, TestingModule } from '@nestjs/testing'
import { HealthService } from './health.service'
import { FIRESTORE } from '../../database/firebase.provider'

describe('HealthService', () => {
  let service: HealthService
  let firestoreGet: jest.Mock

  beforeEach(async () => {
    firestoreGet = jest.fn()

    const dbMock = {
      collection: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnThis(),
        get: firestoreGet,
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: FIRESTORE, useValue: dbMock },
      ],
    }).compile()

    service = module.get<HealthService>(HealthService)
  })

  // ── check ────────────────────────────────────────────────────────────

  describe('check', () => {
    it('should return status ok when process and Firestore are healthy', async () => {
      firestoreGet.mockResolvedValue({ empty: true })

      const result = await service.check()

      expect(result.status).toBe('ok')
      expect(result.checks.firestore.estado).toBe('ok')
      expect(result.checks.proceso.estado).toBe('ok')
    })

    it('should return degraded when Firestore read fails', async () => {
      firestoreGet.mockRejectedValue(new Error('Firestore unavailable'))

      const result = await service.check()

      expect(result.status).toBe('degraded')
      expect(result.checks.firestore.estado).toBe('error')
      expect(result.checks.firestore.detalle).toBe('Firestore unavailable')
    })

    it('should return degraded when the Firestore check times out', async () => {
      jest.useFakeTimers()
      try {
        // La lectura nunca resuelve: solo el timeout puede desbloquear el check
        firestoreGet.mockReturnValue(new Promise(() => {}))

        const promesa = service.check()
        await jest.advanceTimersByTimeAsync(2500)
        const result = await promesa

        expect(result.status).toBe('degraded')
        expect(result.checks.firestore.estado).toBe('error')
        expect(result.checks.firestore.detalle).toContain('Timeout')
      } finally {
        jest.useRealTimers()
      }
    })

    it('should expose process metrics in the response', async () => {
      firestoreGet.mockResolvedValue({ empty: true })

      const result = await service.check()

      expect(result.checks.proceso.uptimeSegundos).toBeGreaterThanOrEqual(0)
      expect(result.checks.proceso.memoriaMb).toBeGreaterThanOrEqual(0)
      expect(result.checks.proceso.versionNode).toMatch(/^v\d+\./)
      expect(result.checks.proceso.timestamp).toBeDefined()
    })

    it('should report the elapsed time in milliseconds', async () => {
      firestoreGet.mockResolvedValue({ empty: true })

      const result = await service.check()

      expect(result.tiempoMs).toBeGreaterThanOrEqual(0)
      expect(typeof result.tiempoMs).toBe('number')
    })
  })
})
