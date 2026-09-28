import { Test, TestingModule } from '@nestjs/testing'
import { OnboardingController } from './onboarding.controller'
import { OnboardingService } from './onboarding.service'
import { EtapaGuard } from './etapa.guard'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RequestMethod } from '@nestjs/common'
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants'

describe('OnboardingController', () => {
  let controller: OnboardingController
  const mockSvc = {
    obtenerEstado: jest.fn(),
    saveDraft: jest.fn(),
    etapaCompletada: jest.fn(),
  }

  const user = {
    id: 'u1',
    email: 'test@correo.mx',
    rol: 'pcd',
    nombreCompleto: 'Ana',
    verificado: true,
    tutorId: null as string | null,
    features: {},
  }

  beforeEach(async () => {
    jest.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnboardingController],
      providers: [{ provide: OnboardingService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .compile()

    controller = module.get<OnboardingController>(OnboardingController)
  })

  it('delega GET /onboarding/estado en el servicio con el id del usuario', async () => {
    mockSvc.obtenerEstado.mockResolvedValue({ onboardingCompleto: false, porcentajeProgreso: 45 })

    const resultado = await controller.estado(user as any)

    expect(mockSvc.obtenerEstado).toHaveBeenCalledWith('u1')
    expect(resultado.porcentajeProgreso).toBe(45)
  })

  it('delega POST /onboarding/borrador en saveDraft con payload parcial', async () => {
    mockSvc.saveDraft.mockResolvedValue({ borrador: { curp: 'X' }, porcentajeProgreso: 20 })

    const resultado = await controller.guardarBorrador(user as any, { curp: 'X' } as any)

    expect(mockSvc.saveDraft).toHaveBeenCalledWith('u1', { curp: 'X' })
    expect(resultado.porcentajeProgreso).toBe(20)
  })

  it('registra GET estado y POST borrador con los decoradores correctos', () => {
    const estado = (OnboardingController.prototype as any).estado
    const borrador = (OnboardingController.prototype as any).guardarBorrador

    expect(Reflect.getMetadata(PATH_METADATA, estado)).toBe('estado')
    expect(Reflect.getMetadata(METHOD_METADATA, estado)).toBe(RequestMethod.GET)
    expect(Reflect.getMetadata(PATH_METADATA, borrador)).toBe('borrador')
    expect(Reflect.getMetadata(METHOD_METADATA, borrador)).toBe(RequestMethod.POST)

    // Ambos protegidos por JwtAuthGuard a nivel de clase
    const guards = Reflect.getMetadata('__guards__', OnboardingController) ?? []
    expect(guards).toContain(JwtAuthGuard)

    // El controlador NO aplica EtapaGuard: los endpoints de onboarding
    // (Diapositiva 1) son la puerta de entrada de la Etapa 1 y deben
    // seguir siendo accesibles sin completar ninguna etapa.
    expect(guards).not.toContain(EtapaGuard)
  })
})
