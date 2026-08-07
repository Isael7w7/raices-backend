import { Test, TestingModule } from '@nestjs/testing'
import { RequestMethod } from '@nestjs/common'
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { StorageService } from '../storage/storage.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { LimitDependientesGuard } from '../../common/guards/limit-dependientes.guard'

describe('UsersController', () => {
  let controller: UsersController
  const mockSvc = {
    getProfile: jest.fn(),
    getDependentPermissions: jest.fn(),
    updateDependentFeatures: jest.fn(),
  }

  beforeEach(async () => {
    jest.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockSvc },
        { provide: StorageService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .overrideGuard(LimitDependientesGuard).useValue({ canActivate: () => true })
      .compile()

    controller = module.get<UsersController>(UsersController)
  })

  it('aplica JwtAuthGuard a nivel de clase', () => {
    const guards = Reflect.getMetadata('__guards__', UsersController) ?? []
    expect(guards).toContain(JwtAuthGuard)
  })

  it('registra GET dependientes/:dependienteId/permisos con roles tutor/admin y ANTES de la ruta paramétrica :id', () => {
    const handler = (UsersController.prototype as any).getDependentPermissions
    const getDependent = (UsersController.prototype as any).getDependent

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('dependientes/:dependienteId/permisos')
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET)

    const guards = Reflect.getMetadata('__guards__', handler) ?? []
    expect(guards).toContain(RolesGuard)

    expect(Reflect.getMetadata('roles', handler)).toEqual(['tutor', 'admin'])

    // Orden de declaración: la ruta estática debe declararse antes de @Get('dependientes/:id')
    const metodos = Object.getOwnPropertyNames(UsersController.prototype)
    expect(metodos.indexOf('getDependentPermissions')).toBeGreaterThan(-1)
    expect(metodos.indexOf('getDependentPermissions')).toBeLessThan(metodos.indexOf('getDependent'))
  })

  it('registra PATCH dependientes/:dependienteId/permisos con roles tutor', () => {
    const handler = (UsersController.prototype as any).saveDependentPermissions

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('dependientes/:dependienteId/permisos')
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.PATCH)

    const guards = Reflect.getMetadata('__guards__', handler) ?? []
    expect(guards).toContain(RolesGuard)

    expect(Reflect.getMetadata('roles', handler)).toEqual(['tutor'])
  })

  it('delega en el servicio al consultar permisos de un dependiente', async () => {
    mockSvc.getDependentPermissions.mockResolvedValue({
      dependienteId: 'dep1', nombre: 'María', esCuentaVinculada: false, pcdUserId: null, features: {},
    })

    const user = { id: 'tutor-1', email: 't@test.com', rol: 'tutor', nombreCompleto: 'T', verificado: false, tutorId: null as string | null, features: {} }

    const result = await controller.getDependentPermissions(user as any, 'dep1')

    expect(mockSvc.getDependentPermissions).toHaveBeenCalledWith('tutor-1', 'dep1', 'tutor')
    expect(result.dependienteId).toBe('dep1')
  })

  it('delega en el servicio al guardar permisos de un dependiente', async () => {
    mockSvc.updateDependentFeatures.mockResolvedValue({ id: 'dep1', features: { chat: false } })

    const user = { id: 'tutor-1', email: 't@test.com', rol: 'tutor', nombreCompleto: 'T', verificado: false, tutorId: null as string | null, features: {} }
    const dto = { chat: false }

    const result = await controller.saveDependentPermissions(user as any, 'dep1', dto as any)

    expect(mockSvc.updateDependentFeatures).toHaveBeenCalledWith('tutor-1', 'dep1', dto)
    expect(result.features.chat).toBe(false)
  })
})
