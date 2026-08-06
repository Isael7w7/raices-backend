import { Test, TestingModule } from '@nestjs/testing'
import { JobsController } from './jobs.controller'
import { JobsService } from './jobs.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { FeatureGuard } from '../../common/guards/feature.guard'

describe('JobsController', () => {
  let controller: JobsController
  const mockSvc = {
    createForUser: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    apply: jest.fn(),
    getAppliedJobIds: jest.fn(),
    myApplications: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  }

  beforeEach(async () => {
    jest.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [{ provide: JobsService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .overrideGuard(FeatureGuard).useValue({ canActivate: () => true })
      .compile()

    controller = module.get<JobsController>(JobsController)
  })

  it('should let an institution user create a vacancy (endpoint @Roles(institucion, admin) permite el paso)', async () => {
    mockSvc.createForUser.mockResolvedValue({ id: 'v1', titulo: 'Terapeuta' })

    const user = {
      id: 'inst-user',
      email: 'centro@test.com',
      rol: 'institucion',
      nombreCompleto: 'Centro Test',
      verificado: false,
      tutorId: null as string | null,
      features: {},
    }
    const dto = { titulo: 'Terapeuta', descripcion: 'Atención integral' }

    const result = await controller.create(dto as any, user as any)

    expect(mockSvc.createForUser).toHaveBeenCalledWith(user, dto)
    expect(result).toEqual({ id: 'v1', titulo: 'Terapeuta' })
  })

  it('delegates to the service regardless of role: la restricción por rol vive en RolesGuard (probado en roles.guard.spec.ts)', async () => {
    mockSvc.createForUser.mockResolvedValue({ id: 'v1' })

    const user = { id: 'pcd-1', email: 'x@test.com', rol: 'pcd', nombreCompleto: 'P', verificado: false, tutorId: null as string | null, features: {} }
    const dto = { titulo: 'T' }

    // Con guards simulados como permitidos, el controlador delega siempre;
    // la restricción por rol (403) la aplica RolesGuard antes del controlador.
    await controller.create(dto as any, user as any)
    expect(mockSvc.createForUser).toHaveBeenCalledWith(user, dto)
  })
})
