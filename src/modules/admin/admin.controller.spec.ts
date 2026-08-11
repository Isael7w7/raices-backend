import { Test, TestingModule } from '@nestjs/testing'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { FIRESTORE } from '../../database/firebase.provider'
import { NotificationsService } from '../notifications/notifications.service'
import { EmailService } from '../email/email.service'
import { StorageService } from '../storage/storage.service'
import { AuditService } from '../../common/audit/audit.service'

describe('AdminController', () => {
  let controller: AdminController
  let service: AdminService

  const mockService = {
    getStats: jest.fn(),
    getAnalytics: jest.fn(),
    getNeedsIntelligence: jest.fn(),
    getActiveVisitors: jest.fn(),
    getAllInstitutions: jest.fn(),
    getPendingInstitutions: jest.fn(),
    approveInstitution: jest.fn(),
    toggleVerifyInstitution: jest.fn(),
    rejectInstitution: jest.fn(),
    getUsers: jest.fn(),
    toggleUserActive: jest.fn(),
    changeUserRole: jest.fn(),
    deleteUser: jest.fn(),
    getReviews: jest.fn(),
    deleteReview: jest.fn(),
    getAlerts: jest.fn(),
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
  }

  const mockFirestore = { collection: jest.fn() }

  const mockAuditService = {
    registrar: jest.fn(),
    consultar: jest.fn(),
    estadisticas: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: mockService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: FIRESTORE, useValue: mockFirestore },
        { provide: NotificationsService, useValue: {} },
        { provide: EmailService, useValue: {} },
        { provide: StorageService, useValue: {} },
      ],
    }).compile()

    controller = module.get<AdminController>(AdminController)
    service = module.get<AdminService>(AdminService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // ── activeVisitors ──────────────────────────────────────────────────

  describe('GET /administracion/visitantes-activos', () => {
    it('should return active visitors with Spanish camelCase properties', async () => {
      const expected = {
        personasActivas: 3,
        promedioDiario: 5,
        promedioSemanal: 4,
        promedioMensual: 10,
        historialMinutos: [25, 45, 48, 28, 12, 36, 48, 38, 48, 45, 38, 34, 40],
      }
      mockService.getActiveVisitors.mockResolvedValue(expected)

      const result = await controller.activeVisitors()

      expect(mockService.getActiveVisitors).toHaveBeenCalledTimes(1)
      expect(result).toEqual(expected)
      expect(result).toHaveProperty('personasActivas')
      expect(result).toHaveProperty('promedioDiario')
      expect(result).toHaveProperty('promedioSemanal')
      expect(result).toHaveProperty('promedioMensual')
      expect(result).toHaveProperty('historialMinutos')
      expect(Array.isArray(result.historialMinutos)).toBe(true)
      expect(result.historialMinutos).toHaveLength(13)
    })
  })
})
