import { Test, TestingModule } from '@nestjs/testing'
import { RequestMethod } from '@nestjs/common'
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants'
import { TutoresController } from './tutores.controller'
import { UsersService } from './users.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RolesGuard } from '../../common/guards/roles.guard'

describe('TutoresController', () => {
  let controller: TutoresController
  const mockSvc = {
    getDependentPermissions: jest.fn(),
    actualizarPermisosDependiente: jest.fn(),
  }

  const user = { id: 'tutor-1', email: 't@test.com', rol: 'padre_tutor', nombreCompleto: 'T', verificado: false, tutorId: null as string | null, features: {} }

  beforeEach(async () => {
    jest.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TutoresController],
      providers: [{ provide: UsersService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile()

    controller = module.get<TutoresController>(TutoresController)
  })

  it('aplica JwtAuthGuard a nivel de clase', () => {
    const guards = Reflect.getMetadata('__guards__', TutoresController) ?? []
    expect(guards).toContain(JwtAuthGuard)
  })

  it('registra GET tutores/dependientes/:dependienteId/permisos con roles tutor/admin', () => {
    const handler = (TutoresController.prototype as any).getPermisos

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('dependientes/:dependienteId/permisos')
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET)

    const guards = Reflect.getMetadata('__guards__', handler) ?? []
    expect(guards).toContain(RolesGuard)
    expect(Reflect.getMetadata('roles', handler)).toEqual(['padre_tutor', 'tutor', 'admin'])
  })

  it('registra PUT y PATCH tutores/dependientes/:dependienteId/permisos con roles tutor', () => {
    const put = (TutoresController.prototype as any).guardarPermisosPut
    const patch = (TutoresController.prototype as any).guardarPermisosPatch

    expect(Reflect.getMetadata(PATH_METADATA, put)).toBe('dependientes/:dependienteId/permisos')
    expect(Reflect.getMetadata(METHOD_METADATA, put)).toBe(RequestMethod.PUT)
    expect(Reflect.getMetadata('roles', put)).toEqual(['padre_tutor', 'tutor'])

    expect(Reflect.getMetadata(PATH_METADATA, patch)).toBe('dependientes/:dependienteId/permisos')
    expect(Reflect.getMetadata(METHOD_METADATA, patch)).toBe(RequestMethod.PATCH)
    expect(Reflect.getMetadata('roles', patch)).toEqual(['padre_tutor', 'tutor'])
  })

  it('delega GET en UsersService con el usuario y rol autenticados', async () => {
    mockSvc.getDependentPermissions.mockResolvedValue({
      dependienteId: 'dep1', nombre: 'María', esCuentaVinculada: false, pcdUserId: null, features: {}, permisos: {},
    })

    const result = await controller.getPermisos(user as any, 'dep1')

    expect(mockSvc.getDependentPermissions).toHaveBeenCalledWith('tutor-1', 'dep1', 'padre_tutor')
    expect(result.dependienteId).toBe('dep1')
  })

  it('delega PUT y PATCH en actualizarPermisosDependiente', async () => {
    mockSvc.actualizarPermisosDependiente.mockResolvedValue({ dependienteId: 'dep1', features: { chat: false }, permisos: { accesoChat: false } })
    const dto = { accesoChat: false, puedeComentar: false }

    const putResult = await controller.guardarPermisosPut(user as any, 'dep1', dto as any)
    expect(mockSvc.actualizarPermisosDependiente).toHaveBeenCalledWith('tutor-1', 'dep1', dto)
    expect(putResult.permisos.accesoChat).toBe(false)

    await controller.guardarPermisosPatch(user as any, 'dep1', dto as any)
    expect(mockSvc.actualizarPermisosDependiente).toHaveBeenLastCalledWith('tutor-1', 'dep1', dto)
  })
})
