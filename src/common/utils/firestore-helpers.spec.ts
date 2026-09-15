import { obtenerDocumentosPorCampo, registrarDependienteVinculado } from './firestore-helpers'

function mockDoc(data: Record<string, any> | null, exists = true, id = 'mock-id') {
  return {
    exists,
    id,
    data: () => data,
    ref: { update: jest.fn().mockResolvedValue(undefined), delete: jest.fn().mockResolvedValue(undefined) },
  }
}

describe('obtenerDocumentosPorCampo', () => {
  it('should return empty map when no values are provided', async () => {
    const db = { collection: jest.fn() } as any

    const resultado = await obtenerDocumentosPorCampo(db, 'perfilesExtendidos', 'usuarioId', [])

    expect(resultado.size).toBe(0)
    expect(db.collection).not.toHaveBeenCalled()
  })

  it('should batch lookups by field in chunks of 30 and key the map by field value', async () => {
    const ids = Array.from({ length: 35 }, (_, i) => `id-${i}`)
    const db = {
      collection: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          docs: ids.slice(0, 30).map((uid, i) => mockDoc({ usuarioId: uid, severidadDiscapacidad: `s${i}` }, true, `doc-${i}`)),
        }),
      }),
    } as any

    const mapa = await obtenerDocumentosPorCampo(db, 'perfilesExtendidos', 'usuarioId', ids)

    // 35 ids → 2 consultas en lote (30 + 5)
    expect(db.collection).toHaveBeenCalledTimes(2)
    expect(mapa.get('id-0')?.severidadDiscapacidad).toBe('s0')
    expect(mapa.size).toBe(30)
  })
})

describe('registrarDependienteVinculado', () => {
  it('should create a new canonical record when nothing exists', async () => {
    const setMock = jest.fn().mockResolvedValue(undefined)
    const col = {
      doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)), set: setMock }),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
    }
    const db = { collection: jest.fn().mockReturnValue(col) } as any

    const resultado = await registrarDependienteVinculado(db, 'dependientes', 'tutor1', 'pcd1', 'Ana')

    expect(resultado).toBe('creado')
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'pcd1',
      tutorId: 'tutor1',
      pcdUserId: 'pcd1',
      esCuentaVinculada: true,
    }))
  })

  it('should update the canonical record if it already exists (idempotency)', async () => {
    const canonico = mockDoc({ id: 'pcd1', tutorId: 'tutor1' }, true, 'pcd1')
    const col = {
      doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(canonico), set: jest.fn() }),
      where: jest.fn(),
      limit: jest.fn(),
      get: jest.fn(),
    }
    const db = { collection: jest.fn().mockReturnValue(col) } as any

    const resultado = await registrarDependienteVinculado(db, 'dependientes', 'tutor1', 'pcd1', 'Ana')

    expect(resultado).toBe('ya_vinculado')
    expect(canonico.ref.update).toHaveBeenCalledWith(expect.objectContaining({
      pcdUserId: 'pcd1',
      esCuentaVinculada: true,
      rol: 'pcd',
    }))
  })

  it('should promote an existing flat dependiente instead of creating a duplicate', async () => {
    const promoteUpdate = jest.fn().mockResolvedValue(undefined)
    const setMock = jest.fn().mockResolvedValue(undefined)
    const col = {
      doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)), set: setMock }),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({
        empty: false,
        docs: [{ id: 'flat-1', ref: { update: promoteUpdate }, data: () => ({ id: 'flat-1', tutorId: 'tutor1' }) }],
      }),
    }
    const db = { collection: jest.fn().mockReturnValue(col) } as any

    const resultado = await registrarDependienteVinculado(db, 'dependientes', 'tutor1', 'pcd1', 'Ana')

    expect(resultado).toBe('promovido')
    expect(promoteUpdate).toHaveBeenCalledWith(expect.objectContaining({
      pcdUserId: 'pcd1',
      esCuentaVinculada: true,
      rol: 'pcd',
    }))
    expect(setMock).not.toHaveBeenCalled()
  })
})
