import { Test, TestingModule } from '@nestjs/testing'
import { ServiceUnavailableException } from '@nestjs/common'
import { HealthController } from './health.controller'
import { HealthService } from './health.service'

describe('HealthController', () => {
  let controller: HealthController
  const healthServiceMock = { check: jest.fn() }

  beforeEach(async () => {
    healthServiceMock.check.mockReset()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthServiceMock }],
    }).compile()

    controller = module.get<HealthController>(HealthController)
  })

  // ── check ────────────────────────────────────────────────────────────

  describe('check', () => {
    it('should return the health result when the service is healthy', async () => {
      const resultado = {
        status: 'ok' as const,
        checks: {
          proceso: { estado: 'ok' as const, uptimeSegundos: 10, memoriaMb: 50, versionNode: 'v22.0.0', timestamp: '2026-08-06T00:00:00.000Z' },
          firestore: { estado: 'ok' as const },
        },
        tiempoMs: 5,
      }
      healthServiceMock.check.mockResolvedValue(resultado)

      await expect(controller.check()).resolves.toEqual(resultado)
    })

    it('should throw ServiceUnavailableException when the service is degraded', async () => {
      const resultado = {
        status: 'degraded' as const,
        checks: {
          proceso: { estado: 'ok' as const, uptimeSegundos: 10, memoriaMb: 50, versionNode: 'v22.0.0', timestamp: '2026-08-06T00:00:00.000Z' },
          firestore: { estado: 'error' as const, detalle: 'Firestore unavailable' },
        },
        tiempoMs: 300,
      }
      healthServiceMock.check.mockResolvedValue(resultado)

      await expect(controller.check()).rejects.toThrow(ServiceUnavailableException)
    })
  })
})
