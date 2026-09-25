import type { Firestore } from 'firebase-admin/firestore'
import { migrarEmpresas, construirDocumentoEmpresa } from './migrar-empresas'

// ─── Fake de Firestore mínimo para la cadena de llamadas de la migración ──

interface EstadoFake {
  perfiles: Record<string, Record<string, any>>
  instituciones: Record<string, Record<string, any>>
  /** uid cuyo get del documento de instituciones lanza error (para test de errores). */
  getInstitucionFallido?: string
}

function crearDbFake(estado: EstadoFake) {
  let batchesCreados = 0

  const ref = (coleccion: string, id: string) => ({
    id,
    get: async () => {
      if (coleccion === 'instituciones') {
        if (estado.getInstitucionFallido === id) throw new Error('Firestore no disponible')
        return { exists: id in estado.instituciones, data: () => estado.instituciones[id] }
      }
      return { exists: id in estado.perfiles, data: () => estado.perfiles[id] }
    },
  })

  const db = {
    collection: (nombre: string) => {
      if (nombre === 'perfiles') {
        return {
          where: (campo: string, _op: string, valor: unknown) => ({
            get: async () => {
              const docs = Object.entries(estado.perfiles)
                .filter(([, p]) => p[campo] === valor)
                .map(([id, p]) => ({ id, data: () => p, ref: ref('perfiles', id) }))
              return { size: docs.length, docs }
            },
          }),
          doc: (id: string) => ref('perfiles', id),
        }
      }
      if (nombre === 'instituciones') {
        return {
          doc: (id: string) => ref('instituciones', id),
          where: (campo: string, _op: string, valor: unknown) => ({
            limit: () => ({
              get: async () => {
                const docs = Object.entries(estado.instituciones)
                  .filter(([, i]) => i[campo] === valor)
                  .map(([id, i]) => ({ id, data: () => i, ref: ref('instituciones', id) }))
                return { empty: docs.length === 0, docs }
              },
            }),
          }),
        }
      }
      throw new Error(`Colección no soportada en el fake: ${nombre}`)
    },
    batch: () => {
      batchesCreados++
      const sets: Array<{ id: string; data: Record<string, any> }> = []
      const updates: Array<{ id: string; data: Record<string, any> }> = []
      return {
        set: (r: { id: string }, data: Record<string, any>) => { sets.push({ id: r.id, data }) },
        update: (r: { id: string }, data: Record<string, any>) => { updates.push({ id: r.id, data }) },
        commit: async () => {
          for (const s of sets) estado.instituciones[s.id] = { ...estado.instituciones[s.id], ...s.data }
          for (const u of updates) estado.perfiles[u.id] = { ...estado.perfiles[u.id], ...u.data }
        },
      }
    },
  }

  return { db: db as unknown as Firestore, estado, batches: () => batchesCreados }
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('migrarEmpresas', () => {
  it('crea el documento canónico tipo empresa y vincula el perfil', async () => {
    const { db, estado } = crearDbFake({
      perfiles: {
        'uid-1': {
          rol: 'empresa',
          nombreCompleto: 'Empresa X',
          email: 'e@x.com',
          fechaCreacion: '2026-01-15T00:00:00.000Z',
        },
      },
      instituciones: {},
    })

    const res = await migrarEmpresas(db)

    expect(res).toMatchObject({
      dryRun: false,
      encontradas: 1,
      documentosCreados: 1,
      perfilesVinculados: 1,
      omitidas: 0,
      errores: [],
    })
    // Misma forma que crea AuthService.register para empresas nuevas
    expect(estado.instituciones['uid-1']).toMatchObject({
      id: 'uid-1',
      nombre: 'Empresa X',
      tipo: 'empresa',
      emailContacto: 'e@x.com',
      creadoPor: 'uid-1',
      usuarioId: 'uid-1',
      activa: true,
      verificada: false,
      categoria: null,
      calificacionPromedio: 0,
      fechaCreacion: '2026-01-15T00:00:00.000Z',
    })
    expect(estado.perfiles['uid-1'].institucionId).toBe('uid-1')
  })

  it('no sobrescribe un documento existente; solo agrega el vínculo', async () => {
    const { db, estado } = crearDbFake({
      perfiles: { 'uid-1': { rol: 'empresa', nombreCompleto: 'Empresa X' } },
      instituciones: { 'uid-1': { id: 'uid-1', nombre: 'Ya Existía', verificada: true } },
    })

    const res = await migrarEmpresas(db)

    expect(res).toMatchObject({ documentosCreados: 0, perfilesVinculados: 1, errores: [] })
    // El documento no se pisa
    expect(estado.instituciones['uid-1']).toMatchObject({ nombre: 'Ya Existía', verificada: true })
    expect(estado.perfiles['uid-1'].institucionId).toBe('uid-1')
  })

  it('usa un documento legado por creadoPor en lugar de duplicar', async () => {
    const { db, estado } = crearDbFake({
      perfiles: { 'uid-2': { rol: 'empresa', nombreCompleto: 'Empresa Legacy' } },
      instituciones: { 'legacy-9': { id: 'legacy-9', creadoPor: 'uid-2', nombre: 'Legacy' } },
    })

    const res = await migrarEmpresas(db)

    expect(res).toMatchObject({ documentosCreados: 0, perfilesVinculados: 1, omitidas: 0 })
    expect(Object.keys(estado.instituciones)).toEqual(['legacy-9'])
    expect(estado.perfiles['uid-2'].institucionId).toBe('legacy-9')
  })

  it('omite cuentas ya migradas sin escribir nada', async () => {
    const { db, estado, batches } = crearDbFake({
      perfiles: { 'uid-3': { rol: 'empresa', institucionId: 'uid-3' } },
      instituciones: { 'uid-3': { id: 'uid-3', tipo: 'empresa' } },
    })

    const res = await migrarEmpresas(db)

    expect(res).toMatchObject({ encontradas: 1, documentosCreados: 0, perfilesVinculados: 0, omitidas: 1 })
    expect(batches()).toBe(0)
    expect(estado.instituciones['uid-3']).toMatchObject({ tipo: 'empresa' })
  })

  it('dry-run reporta lo que haría pero no escribe', async () => {
    const { db, estado, batches } = crearDbFake({
      perfiles: { 'uid-1': { rol: 'empresa', nombreCompleto: 'Empresa X' } },
      instituciones: {},
    })

    const res = await migrarEmpresas(db, { dryRun: true })

    expect(res).toMatchObject({ dryRun: true, documentosCreados: 1, perfilesVinculados: 1 })
    expect(batches()).toBe(0)
    expect(estado.instituciones).toEqual({})
    expect(estado.perfiles['uid-1'].institucionId).toBeUndefined()
  })

  it('un error en una cuenta no detiene el resto', async () => {
    const { db, estado } = crearDbFake({
      perfiles: {
        'uid-bad': { rol: 'empresa', nombreCompleto: 'Rota' },
        'uid-ok': { rol: 'empresa', nombreCompleto: 'OK' },
      },
      instituciones: {},
      getInstitucionFallido: 'uid-bad',
    })

    const res = await migrarEmpresas(db)

    expect(res.errores).toHaveLength(1)
    expect(res.errores[0].uid).toBe('uid-bad')
    expect(res.documentosCreados).toBe(1)
    expect(estado.instituciones['uid-ok']).toMatchObject({ tipo: 'empresa' })
    expect(estado.instituciones['uid-bad']).toBeUndefined()
  })
})

describe('construirDocumentoEmpresa', () => {
  it('usa la fecha de la migración cuando el perfil no tiene fechaCreacion', () => {
    const doc = construirDocumentoEmpresa('uid', {}, '2026-09-25T00:00:00.000Z')
    expect(doc.fechaCreacion).toBe('2026-09-25T00:00:00.000Z')
    expect(doc.tipo).toBe('empresa')
    expect(doc.verificada).toBe(false)
  })

  it('usa nombre de respaldo cuando el perfil no trae nombre ni email', () => {
    const doc = construirDocumentoEmpresa('uid', {}, '2026-09-25T00:00:00.000Z')
    expect(doc.nombre).toBe('Empresa')
  })
})
