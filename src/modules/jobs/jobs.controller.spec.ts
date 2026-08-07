import { Test, TestingModule } from '@nestjs/testing'
import { JobsController } from './jobs.controller'
import { JobsService } from './jobs.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { FeatureGuard } from '../../common/guards/feature.guard'
import { RequestMethod } from '@nestjs/common'
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants'

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
    postulantesDeMiInstitucion: jest.fn(),
    actualizarEstadoPostulacion: jest.fn(),
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

  it('registra GET postulantes-institucion con guards y roles correctos, ANTES de la ruta paramétrica :id', () => {
    const handler = (JobsController.prototype as any).institutionApplicants
    const findOne = (JobsController.prototype as any).findOne

    // Ruta y método HTTP
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('postulantes-institucion')
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET)

    // Guards aplicados
    const guards = Reflect.getMetadata('__guards__', handler) ?? []
    expect(guards).toContain(JwtAuthGuard)
    expect(guards).toContain(RolesGuard)

    // Roles exigidos (SetMetadata('roles', ...) del decorador Roles)
    expect(Reflect.getMetadata('roles', handler)).toEqual(['institucion', 'admin'])

    // Orden de declaración: la ruta estática debe declararse antes de @Get(':id')
    const metodos = Object.getOwnPropertyNames(JobsController.prototype)
    expect(metodos.indexOf('institutionApplicants')).toBeGreaterThan(-1)
    expect(metodos.indexOf('institutionApplicants')).toBeLessThan(metodos.indexOf('findOne'))
  })

  it('delega en el servicio al consultar postulantes de la institución', async () => {
    mockSvc.postulantesDeMiInstitucion.mockResolvedValue({ datos: [], total: 0, pagina: 1, limite: 20, totalPaginas: 0 })

    const user = { id: 'inst-user', email: 'c@test.com', rol: 'institucion', nombreCompleto: 'C', verificado: false, tutorId: null as string | null, features: {} }
    const paginacion = { pagina: 1, limite: 20 }

    const result = await controller.institutionApplicants(user as any, paginacion as any, undefined, 'pendiente')

    expect(mockSvc.postulantesDeMiInstitucion).toHaveBeenCalledWith(user, expect.objectContaining({
      institucionId: undefined,
      estado: 'pendiente',
      pagina: 1,
      limite: 20,
    }))
    expect(result.total).toBe(0)
  })

  it('registra PATCH postulaciones/:id/estado con guards y roles correctos', () => {
    const handler = (JobsController.prototype as any).cambiarEstadoPostulacion

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('postulaciones/:id/estado')
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.PATCH)

    const guards = Reflect.getMetadata('__guards__', handler) ?? []
    expect(guards).toContain(JwtAuthGuard)
    expect(guards).toContain(RolesGuard)

    expect(Reflect.getMetadata('roles', handler)).toEqual(['institucion', 'admin'])
  })

  it('delega en el servicio al cambiar el estado de una postulación', async () => {
    mockSvc.actualizarEstadoPostulacion.mockResolvedValue({ id: 'p1', estado: 'aceptada', fechaActualizacion: '2024-01-01' })

    const user = { id: 'inst-user', email: 'c@test.com', rol: 'institucion', nombreCompleto: 'C', verificado: false, tutorId: null as string | null, features: {} }
    const dto = { estado: 'aceptada' }

    const result = await controller.cambiarEstadoPostulacion('p1', dto as any, user as any)

    expect(mockSvc.actualizarEstadoPostulacion).toHaveBeenCalledWith('p1', user, dto)
    expect(result.estado).toBe('aceptada')
  })
})
