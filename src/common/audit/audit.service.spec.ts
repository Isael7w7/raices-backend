import { Test, TestingModule } from '@nestjs/testing'
import { AuditService } from './audit.service'
import { FIRESTORE } from '../../database/firebase.provider'
import { AuditLog } from '../interfaces/audit-log.interface'
import { PaginacionDto } from '../dto/paginacion.dto'

/** Mock tipado del snapshot de Firestore (sin `any`) */
interface SnapshotMock {
  docs: { id: string; data: () => AuditLog }[]
}

/** Mock tipado de la cadena de consulta encadenable de Firestore (sin `any`) */
interface ColeccionMock {
  orderBy: jest.Mock
  limit: jest.Mock
  get: jest.Mock
  /** Ausente a propósito: si el servicio volviera a usar `where`, el mock fallaría en runtime */
  where?: never
}

/** Crea un registro de auditoría válido con sobrescrituras opcionales */
function log(overrides: Partial<AuditLog>): AuditLog {
  return {
    id: 'doc-1',
    timestamp: '2026-09-01T10:00:00.000Z',
    usuarioId: 'admin-1',
    usuarioEmail: 'admin@raices.mx',
    accion: 'aprobar_institucion',
    descripcion: 'Institución aprobada',
    recurso: 'institucion',
    resultado: 'exito',
    ...overrides,
  }
}

describe('AuditService — consultar', () => {
  let service: AuditService
  let firestoreMock: { collection: jest.Mock }

  beforeEach(async () => {
    firestoreMock = { collection: jest.fn() }
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: FIRESTORE, useValue: firestoreMock }],
    }).compile()
    service = module.get<AuditService>(AuditService)
  })

  /** Configura la colección mockeada para devolver los registros dados */
  function mockColeccion(registros: AuditLog[]): ColeccionMock {
    const snapshot: SnapshotMock = {
      docs: registros.map(r => ({ id: r.id ?? 'doc', data: () => r })),
    }
    const col: ColeccionMock = {
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(snapshot),
    }
    firestoreMock.collection.mockReturnValue(col)
    return col
  }

  const paginacionPorDefecto: PaginacionDto = { pagina: 1, limite: 20 }

  // ── Consulta base (sin filtros) ─────────────────────────────────────

  it('debe consultar con orderBy(timestamp, desc) + limit y SIN cláusulas where (sin índice compuesto)', async () => {
    const col = mockColeccion([log({})])

    const respuesta = await service.consultar(paginacionPorDefecto)

    expect(col.orderBy).toHaveBeenCalledWith('timestamp', 'desc')
    expect(col.limit).toHaveBeenCalledWith(500)
    // La consulta NO debe usar `where`: era la causa del 500 por índice compuesto faltante
    // (si el servicio volviera a encadenar `where`, `col.where(...)` lanzaría TypeError)
    expect(col.where).toBeUndefined()
    expect(respuesta.total).toBe(1)
    expect(respuesta.datos).toHaveLength(1)
  })

  it('debe paginar correctamente (página 2 de 3 registros con límite 2)', async () => {
    const registros = [
      log({ id: 'a', timestamp: '2026-09-03T10:00:00.000Z' }),
      log({ id: 'b', timestamp: '2026-09-02T10:00:00.000Z' }),
      log({ id: 'c', timestamp: '2026-09-01T10:00:00.000Z' }),
    ]
    mockColeccion(registros)

    const respuesta = await service.consultar({ pagina: 2, limite: 2 })

    expect(respuesta.total).toBe(3)
    expect(respuesta.pagina).toBe(2)
    expect(respuesta.totalPaginas).toBe(2)
    expect(respuesta.datos.map(d => d.id)).toEqual(['c'])
  })

  // ── Filtro por usuarioId (exacto) ───────────────────────────────────

  it('debe filtrar por usuarioId exacto en memoria', async () => {
    mockColeccion([
      log({ id: '1', usuarioId: 'admin-1' }),
      log({ id: '2', usuarioId: 'admin-2' }),
    ])

    const respuesta = await service.consultar(paginacionPorDefecto, { usuarioId: 'admin-2' })

    expect(respuesta.total).toBe(1)
    expect(respuesta.datos[0]?.id).toBe('2')
  })

  // ── Filtro por accion (prefijo, insensible a mayúsculas) ────────────

  it('debe matchear accion por prefijo en minúsculas ("actualizar" → "actualizar_configuracion")', async () => {
    mockColeccion([
      log({ id: '1', accion: 'actualizar_configuracion' }),
      log({ id: '2', accion: 'aprobar_institucion' }),
      log({ id: '3', accion: 'aprobar_documento_identidad' }),
    ])

    const respuesta = await service.consultar(paginacionPorDefecto, { accion: 'actualizar' })

    expect(respuesta.total).toBe(1)
    expect(respuesta.datos[0]?.id).toBe('1')
  })

  it('debe ignorar mayúsculas y espacios en el filtro de accion', async () => {
    mockColeccion([log({ id: '1', accion: 'aprobar_institucion' })])

    const respuesta = await service.consultar(paginacionPorDefecto, { accion: '  APROBAR  ' })

    expect(respuesta.total).toBe(1)
  })

  it('debe devolver 0 resultados cuando ninguna accion coincide con el prefijo', async () => {
    mockColeccion([log({ id: '1', accion: 'aprobar_institucion' })])

    const respuesta = await service.consultar(paginacionPorDefecto, { accion: 'eliminar' })

    expect(respuesta.total).toBe(0)
    expect(respuesta.datos).toEqual([])
  })

  // ── Filtro por recurso (prefijo) ────────────────────────────────────

  it('debe matchear recurso por prefijo ("doc" → "documento_identidad")', async () => {
    mockColeccion([
      log({ id: '1', recurso: 'documento_identidad' }),
      log({ id: '2', recurso: 'institucion' }),
    ])

    const respuesta = await service.consultar(paginacionPorDefecto, { recurso: 'doc' })

    expect(respuesta.total).toBe(1)
    expect(respuesta.datos[0]?.id).toBe('1')
  })

  // ── Filtros de fecha ────────────────────────────────────────────────

  it('debe filtrar por rango de fechas (fechaDesde y fechaHasta)', async () => {
    mockColeccion([
      log({ id: 'antes', timestamp: '2026-08-01T00:00:00.000Z' }),
      log({ id: 'dentro', timestamp: '2026-09-01T00:00:00.000Z' }),
      log({ id: 'despues', timestamp: '2026-09-08T00:00:00.000Z' }),
    ])

    const respuesta = await service.consultar(paginacionPorDefecto, {
      fechaDesde: '2026-08-15T00:00:00.000Z',
      fechaHasta: '2026-09-05T00:00:00.000Z',
    })

    expect(respuesta.total).toBe(1)
    expect(respuesta.datos[0]?.id).toBe('dentro')
  })

  // ── Combinación de filtros ──────────────────────────────────────────

  it('debe combinar varios filtros a la vez (usuarioId + accion + fechas)', async () => {
    mockColeccion([
      log({ id: 'match', usuarioId: 'a1', accion: 'actualizar_configuracion', timestamp: '2026-09-02T00:00:00.000Z' }),
      log({ id: 'otro-usuario', usuarioId: 'a2', accion: 'actualizar_configuracion', timestamp: '2026-09-02T00:00:00.000Z' }),
      log({ id: 'otra-accion', usuarioId: 'a1', accion: 'aprobar_institucion', timestamp: '2026-09-02T00:00:00.000Z' }),
      log({ id: 'fuera-rango', usuarioId: 'a1', accion: 'actualizar_configuracion', timestamp: '2026-08-01T00:00:00.000Z' }),
    ])

    const respuesta = await service.consultar(paginacionPorDefecto, {
      usuarioId: 'a1',
      accion: 'actualizar',
      fechaDesde: '2026-09-01T00:00:00.000Z',
    })

    expect(respuesta.total).toBe(1)
    expect(respuesta.datos[0]?.id).toBe('match')
  })
})
