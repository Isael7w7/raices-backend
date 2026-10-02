import { Test, TestingModule } from '@nestjs/testing'
import { CommunityController } from './community.controller'
import { CommunityService } from './community.service'
import { EventosService } from './eventos.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { FeatureGuard } from '../../common/guards/feature.guard'

/**
 * Tests unitarios del controlador de Comunidad enfocados en la sección de
 * Eventos (listar, detalle, crear, asistir) y en el feed multimedia de la
 * Galería Conectemos (parsing de query + delegación al servicio).
 */
describe('CommunityController', () => {
  let controller: CommunityController

  const svcMock = {
    getConectemosPosts: jest.fn(),
    getPosts: jest.fn(),
  }

  const eventosMock = {
    listar: jest.fn(),
    obtenerDetalle: jest.fn(),
    crearEvento: jest.fn(),
    toggleAsistencia: jest.fn(),
  }

  const usuario = { id: 'u1', rol: 'pcd', nombreCompleto: 'Ana' } as any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommunityController],
      providers: [
        { provide: CommunityService, useValue: svcMock },
        { provide: EventosService, useValue: eventosMock },
      ],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(FeatureGuard).useValue({ canActivate: () => true })
      .compile()

    controller = module.get<CommunityController>(CommunityController)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /comunidad/eventos', () => {
    it('delega el listado con el usuario autenticado y los filtros', async () => {
      const esperado = { datos: [], total: 0, pagina: 1, limite: 20, totalPaginas: 0 }
      eventosMock.listar.mockResolvedValue(esperado)

      const result = await controller.listarEventos(
        { pagina: 2, limite: 10, categoria: 'taller', fecha: '2026-10-15', desde: '2026-10-01T00:00:00.000Z', buscar: 'arte' } as any,
        usuario,
      )

      expect(eventosMock.listar).toHaveBeenCalledWith('u1', 2, 10, {
        categoria: 'taller',
        fecha: '2026-10-15',
        desde: '2026-10-01T00:00:00.000Z',
        buscar: 'arte',
      })
      expect(result).toBe(esperado)
    })

    it('delega sin filtros cuando la query viene vacía', async () => {
      eventosMock.listar.mockResolvedValue({ datos: [], total: 0, pagina: 1, limite: 20, totalPaginas: 0 })

      await controller.listarEventos({} as any, usuario)

      expect(eventosMock.listar).toHaveBeenCalledWith('u1', undefined, undefined, {
        categoria: undefined,
        fecha: undefined,
        desde: undefined,
        buscar: undefined,
      })
    })
  })

  describe('GET /comunidad/eventos/:id', () => {
    it('delega el detalle con eventoId y usuario', async () => {
      eventosMock.obtenerDetalle.mockResolvedValue({ id: 'e1', asisto: true })

      const result = await controller.obtenerEvento('e1', usuario)

      expect(eventosMock.obtenerDetalle).toHaveBeenCalledWith('e1', 'u1')
      expect(result).toEqual({ id: 'e1', asisto: true })
    })
  })

  describe('POST /comunidad/eventos', () => {
    it('delega la creación con el payload y el usuario', async () => {
      const dto = { titulo: 'Taller', categoria: 'taller', fechaInicio: '2099-01-01T10:00:00.000Z' } as any
      eventosMock.crearEvento.mockResolvedValue({ id: 'e1', titulo: 'Taller' })

      const result = await controller.crearEvento(dto, usuario)

      expect(eventosMock.crearEvento).toHaveBeenCalledWith(usuario, dto)
      expect(result).toEqual({ id: 'e1', titulo: 'Taller' })
    })
  })

  describe('POST /comunidad/eventos/:id/asistir', () => {
    it('delega el toggle de asistencia con eventoId y usuario', async () => {
      eventosMock.toggleAsistencia.mockResolvedValue({ asistiendo: true, cantidadAsistentes: 3 })

      const result = await controller.asistirAEvento('e1', usuario)

      expect(eventosMock.toggleAsistencia).toHaveBeenCalledWith('e1', 'u1')
      expect(result).toEqual({ asistiendo: true, cantidadAsistentes: 3 })
    })
  })

  describe('GET /comunidad/galeria (y /conectemos/publicaciones)', () => {
    it('parsea la query numérica y delega el feed de galería', async () => {
      const esperado = { datos: [{ id: 'p1', recursosVisuales: ['https://x/a.jpg'] }], total: 1, pagina: 1, limite: 20, totalPaginas: 1 }
      svcMock.getConectemosPosts.mockResolvedValue(esperado)

      const result = await controller.getGaleria({ pagina: '2', limite: '5', categoriaCreativa: 'arte', buscar: 'dibujo' })

      expect(svcMock.getConectemosPosts).toHaveBeenCalledWith(2, 5, 'arte', 'dibujo')
      expect(result).toBe(esperado)
    })

    it('usa valores por defecto cuando la query no trae pagina/limite', async () => {
      svcMock.getConectemosPosts.mockResolvedValue({ datos: [], total: 0, pagina: 1, limite: 20, totalPaginas: 0 })

      await controller.getConectemosPosts({})

      expect(svcMock.getConectemosPosts).toHaveBeenCalledWith(1, 20, undefined, undefined)
    })

    it('el alias /galeria responde con el mismo formato que /conectemos/publicaciones', async () => {
      svcMock.getConectemosPosts.mockResolvedValue({ datos: [], total: 0, pagina: 1, limite: 20, totalPaginas: 0 })

      await controller.getGaleria({})
      await controller.getConectemosPosts({})

      expect(svcMock.getConectemosPosts).toHaveBeenCalledTimes(2)
      expect(svcMock.getConectemosPosts).toHaveBeenNthCalledWith(1, 1, 20, undefined, undefined)
      expect(svcMock.getConectemosPosts).toHaveBeenNthCalledWith(2, 1, 20, undefined, undefined)
    })
  })
})
