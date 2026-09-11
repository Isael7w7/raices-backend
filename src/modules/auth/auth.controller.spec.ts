import { Test, TestingModule } from '@nestjs/testing'
import { RequestMethod } from '@nestjs/common'
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { ConfigService } from '@nestjs/config'
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard'

describe('AuthController', () => {
  let controller: AuthController
  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    me: jest.fn(),
    cerrarSesionGlobal: jest.fn(),
  }
  const mockConfigService = {
    get: jest.fn().mockReturnValue(undefined),
  }

  beforeEach(async () => {
    jest.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    })
      .overrideGuard(FirebaseAuthGuard).useValue({ canActivate: () => true })
      .compile()

    controller = module.get<AuthController>(AuthController)
  })

  it('registra POST cerrar-sesion-global con FirebaseAuthGuard y limpia cookies', async () => {
    const handler = (AuthController.prototype as any).cerrarSesionGlobal

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('cerrar-sesion-global')
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST)

    const guards = Reflect.getMetadata('__guards__', handler) ?? []
    expect(guards).toContain(FirebaseAuthGuard)

    const user = { id: 'u-1', email: 'u@test.com', rol: 'pcd', nombreCompleto: 'U', verificado: true, tutorId: null, features: {} }
    const resMock = { clearCookie: jest.fn() }

    mockAuthService.cerrarSesionGlobal.mockResolvedValue(undefined)

    const response = await controller.cerrarSesionGlobal(user as any, resMock as any)

    expect(mockAuthService.cerrarSesionGlobal).toHaveBeenCalledWith('u-1')
    expect(resMock.clearCookie).toHaveBeenCalledTimes(2)
    expect(response).toEqual({ mensaje: 'Sesión cerrada en todos los dispositivos exitosamente' })
  })
})
