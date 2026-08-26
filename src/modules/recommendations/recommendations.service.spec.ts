import { Test, TestingModule } from '@nestjs/testing'
import { RecommendationsService } from './recommendations.service'
import { FIRESTORE } from '../../database/firebase.provider'

/** Fecha ISO de hace N días respecto a ahora (para simular ventana de 30 días) */
function haceDias(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()
}

describe('RecommendationsService', () => {
  let service: RecommendationsService
  let firestoreMock: Record<string, any>

  beforeEach(async () => {
    firestoreMock = { collection: jest.fn() }
    const module: TestingModule = await Test.createTestingModule({
      providers: [RecommendationsService, { provide: FIRESTORE, useValue: firestoreMock }],
    }).compile()
    service = module.get<RecommendationsService>(RecommendationsService)
  })

  // ── registrar ───────────────────────────────────────────────────────

  describe('registrar', () => {
    it('debe guardar el documento en interacciones con usuarioId, tipo, categoria y createdAt', async () => {
      const setMock = jest.fn().mockResolvedValue(undefined)
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ id: 'inter-1', set: setMock }),
      })

      const resultado = await service.registrar('u1', {
        institucionId: 'inst-1',
        tipo: 'guardar',
        categoria: 'laboral',
      } as any)

      expect(setMock).toHaveBeenCalledWith(expect.objectContaining({
        id: 'inter-1',
        usuarioId: 'u1',
        institucionId: 'inst-1',
        tipo: 'guardar',
        categoria: 'laboral',
        createdAt: expect.any(String),
      }))
      expect(resultado).toEqual({ exito: true, id: 'inter-1', mensaje: 'Interacción registrada' })
    })

    it('debe guardar categoria en null cuando no se envía', async () => {
      const setMock = jest.fn().mockResolvedValue(undefined)
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ id: 'inter-2', set: setMock }),
      })

      await service.registrar('u1', { institucionId: 'inst-1', tipo: 'click_card' } as any)

      expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ categoria: null }))
    })
  })

  // ── pesos ───────────────────────────────────────────────────────────

  describe('pesos', () => {
    it('debe agrupar los puntos por categoría (guardar=10, ver_detalle=5, click_card=2)', async () => {
      const interacciones = [
        { categoria: 'funcional', tipo: 'guardar' },       // 10
        { categoria: 'funcional', tipo: 'click_card' },    // +2 → 12
        { categoria: 'laboral', tipo: 'ver_detalle' },     // 5
      ]
      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: interacciones.map(d => ({ data: () => d })) }),
      })

      const pesos = await service.pesos('u1')

      expect(pesos).toEqual({ funcional: 12, laboral: 5 })
    })

    it('debe ignorar las interacciones fuera de la ventana de 30 días', async () => {
      const clausulas: any[][] = []
      firestoreMock.collection.mockReturnValue({
        where: (...args: any[]) => {
          clausulas.push(args)
          return {
            where: (...mas: any[]) => { clausulas.push(mas); return { get: jest.fn().mockResolvedValue({ docs: [] }) } },
            get: jest.fn().mockResolvedValue({ docs: [] }),
          }
        },
      })

      await service.pesos('u1')

      // Primera cláusula filtra por usuario; segunda, por la ventana de createdAt
      expect(clausulas[0][0]).toBe('usuarioId')
      expect(clausulas[1][0]).toBe('createdAt')
      expect(clausulas[1][1]).toBe('>=')
      const limite = new Date(clausulas[1][2]).getTime()
      // El límite debe ser "ahora - 30 días" (con tolerancia de 5s por el tiempo de ejecución)
      const esperado = Date.now() - 30 * 24 * 60 * 60 * 1000
      expect(Math.abs(limite - esperado)).toBeLessThan(5000)
    })

    it('debe retornar objeto vacío si no hay interacciones o sin categoria', async () => {
      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [{ data: () => ({ tipo: 'guardar' }) }] }),
      })

      const pesos = await service.pesos('u1')

      expect(pesos).toEqual({})
    })
  })

  // ── recomendaciones ─────────────────────────────────────────────────

  function mockearFuentes(perfil: any, instituciones: any[], interacciones: any[] = []) {
    firestoreMock.collection.mockImplementation((nombre: string) => {
      if (nombre === 'perfilesExtendidos') {
        return {
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ empty: !perfil, docs: perfil ? [{ data: () => perfil }] : [] }),
        }
      }
      if (nombre === 'interacciones') {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: interacciones.map(d => ({ data: () => d })) }),
        }
      }
      // instituciones
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: instituciones.map(i => ({ id: i.id, data: () => i })) }),
      }
    })
  }

  it('debe calcular final_score = intereses*0.6 + comportamiento*0.4 y ordenar descendente', async () => {
    mockearFuentes(
      { metasActuales: '["empleo"]', areasInteres: '["tecnologia"]' },
      [
        // Coincide 'empleo' (1/2 tokens) + peso máximo laboral → final alto
        { id: 'inst-laboral', nombre: 'Centro de empleo', categoria: 'laboral', activa: true, descripcion: '' },
        // No coincide nada, sin peso → final 0
        { id: 'inst-social', nombre: 'Centro social', categoria: 'social', activa: true, descripcion: '' },
      ],
      [
        { categoria: 'laboral', tipo: 'guardar', createdAt: haceDias(1) }, // 10
        { categoria: 'social', tipo: 'ver_detalle', createdAt: haceDias(2) }, // 5
      ],
    )

    const resultado: any = await service.recomendaciones('u1')

    expect(resultado.datos).toHaveLength(2)
    const [primera, segunda] = resultado.datos
    expect(primera.id).toBe('inst-laboral')
    expect(segunda.id).toBe('inst-social')

    // inst-laboral: intereses 1/2=0.5, comportamiento 10/10=1 → 0.5*0.6+1*0.4=0.7
    expect(primera.score_intereses).toBeCloseTo(0.5)
    expect(primera.score_comportamiento).toBe(1)
    expect(primera.final_score).toBeCloseTo(0.7)

    // inst-social: intereses 0, comportamiento 5/10=0.5 → 0.4*0.5=0.2
    expect(segunda.final_score).toBeCloseTo(0.2)

    expect(resultado.paginacion).toEqual({ total: 2, pagina: 1, limite: 20, totalPaginas: 1 })
  })

  it('debe retornar score_intereses en 0 cuando el perfil no tiene metas ni áreas de interés', async () => {
    mockearFuentes({}, [{ id: 'inst-1', nombre: 'X', categoria: 'social', activa: true }])

    const resultado: any = await service.recomendaciones('u1')

    expect(resultado.datos[0].score_intereses).toBe(0)
    expect(resultado.datos[0].final_score).toBe(0)
  })

  it('no debe fallar sin perfil extendido y solo ponderar comportamiento', async () => {
    mockearFuentes(
      null,
      [{ id: 'inst-1', nombre: 'X', categoria: 'educativo', activa: true }],
      [{ categoria: 'educativo', tipo: 'guardar', createdAt: haceDias(3) }], // único peso → normalizado a 1
    )

    const resultado: any = await service.recomendaciones('u1')

    expect(resultado.datos[0].score_comportamiento).toBe(1)
    expect(resultado.datos[0].final_score).toBeCloseTo(0.4)
  })

  it('debe paginar los resultados', async () => {
    mockearFuentes(
      null,
      Array.from({ length: 25 }, (_, i) => ({ id: `inst-${i}`, nombre: `C${i}`, categoria: 'social', activa: true })),
    )

    const pagina2: any = await service.recomendaciones('u1', 2, 20)

    expect(pagina2.datos).toHaveLength(5)
    expect(pagina2.paginacion).toEqual({ total: 25, pagina: 2, limite: 20, totalPaginas: 2 })
  })
})
