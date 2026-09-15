import { Test, TestingModule } from '@nestjs/testing'
import { RequestMethod } from '@nestjs/common'
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants'
import { StorageController } from './storage.controller'
import { StorageService } from './storage.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { FeatureGuard } from '../../common/guards/feature.guard'

describe('StorageController', () => {
  let controller: StorageController
  const mockStorage = { upload: jest.fn(), delete: jest.fn() }

  beforeEach(async () => {
    jest.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StorageController],
      providers: [{ provide: StorageService, useValue: mockStorage }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(FeatureGuard).useValue({ canActivate: () => true })
      .compile()

    controller = module.get<StorageController>(StorageController)
  })

  it('registra POST /multimedia gateado con @Feature("multimedia")', () => {
    const handler = (StorageController.prototype as any).upload

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('/') // sin sub-ruta: la ruta queda en el prefijo del controlador (/multimedia)
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST)

    const guards = Reflect.getMetadata('__guards__', handler) ?? []
    expect(guards).toContain(JwtAuthGuard)
    expect(guards).toContain(FeatureGuard)

    expect(Reflect.getMetadata('feature', handler)).toBe('multimedia')
  })

  it('delega en StorageService.upload y retorna la URL', async () => {
    mockStorage.upload.mockResolvedValue('https://storage/multimedia/abc.jpg')

    const result = await controller.upload({ buffer: Buffer.from('fake'), originalname: 'foto.jpg' } as any)

    expect(mockStorage.upload).toHaveBeenCalledWith(expect.any(Buffer), 'foto.jpg', 'multimedia')
    expect(result).toEqual({ url: 'https://storage/multimedia/abc.jpg' })
  })
})
