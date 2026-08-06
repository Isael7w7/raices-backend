/**
 * Setup de pruebas E2E.
 *
 * Mockea los módulos de firebase-admin (app, firestore, auth, storage) y axios
 * para poder levantar la aplicación NestJS real (pipes, guards, controladores)
 * sin credenciales ni emuladores. Los servicios usan un Firestore en memoria
 * que implementa el subconjunto de la API usado por los módulos bajo prueba:
 * collection/doc, where/orderBy/limit, batch y FieldValue.increment/serverTimestamp.
 *
 * La instancia se expone en globalThis.__E2E__ para que los specs puedan sembrar
 * datos y verificar el estado de la "base de datos".
 */

/* eslint-disable */

// ─── FieldValue / FieldPath (sentinels) ──────────────────────────────────────
const mockFieldValue = {
  increment: (n: number) => ({ __op: 'increment', n }),
  serverTimestamp: () => ({ __op: 'serverTimestamp' }),
}
const mockDocIdField = '__docId__'

// ─── Almacén en memoria ──────────────────────────────────────────────────────
const almacen = new Map<string, Map<string, any>>()
let contadorId = 0

function colMap(nombre: string): Map<string, any> {
  if (!almacen.has(nombre)) almacen.set(nombre, new Map())
  return almacen.get(nombre)!
}

/** Aplica una escritura (merge o reemplazo) resolviendo los sentinels de FieldValue. */
function aplicarEscritura(existente: any, nuevos: any, esMerge: boolean): any {
  const base: any = esMerge ? { ...(existente ?? {}) } : {}
  for (const [k, v] of Object.entries(nuevos)) {
    if (v && typeof v === 'object' && v.__op === 'increment') {
      const actual = typeof base[k] === 'number' ? base[k] : 0
      base[k] = actual + v.n
    } else if (v && typeof v === 'object' && v.__op === 'serverTimestamp') {
      base[k] = new Date().toISOString()
    } else {
      base[k] = v === undefined ? null : JSON.parse(JSON.stringify(v))
    }
  }
  return base
}

// ─── Referencias y snapshots ─────────────────────────────────────────────────
function crearRef(coleccion: string, id?: string) {
  const docId = id ?? `${coleccion}-${++contadorId}`
  return {
    id: docId,
    get ref() { return this },
    async get() {
      const datos = colMap(coleccion).get(docId)
      return crearSnapshot(coleccion, docId, datos)
    },
    async set(data: any, opts?: any) {
      const previo = colMap(coleccion).get(docId)
      colMap(coleccion).set(docId, aplicarEscritura(previo, data, opts?.merge === true))
      return { id: docId }
    },
    async update(data: any) {
      const previo = colMap(coleccion).get(docId)
      colMap(coleccion).set(docId, aplicarEscritura(previo, data, true))
      return { id: docId }
    },
    async delete() {
      colMap(coleccion).delete(docId)
      return {}
    },
  }
}

function crearSnapshot(coleccion: string, id: string, datos: any) {
  const ref = crearRef(coleccion, id)
  return {
    id,
    exists: datos !== undefined,
    data: () => (datos === undefined ? undefined : JSON.parse(JSON.stringify(datos))),
    get ref() { return ref },
  }
}

function crearQuerySnapshot(docs: any[]) {
  return {
    docs,
    get empty() { return docs.length === 0 },
    get size() { return docs.length },
    forEach(cb: any) { docs.forEach(cb) },
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────────
function crearQuery(coleccion: string, filtros: any[] = [], orden: any[] = [], limite?: number) {
  return {
    where(campo: string, op: string, valor: any) {
      return crearQuery(coleccion, [...filtros, { campo, op, valor }], orden, limite)
    },
    orderBy(campo: string, dir: string = 'asc') {
      return crearQuery(coleccion, filtros, [...orden, { campo, dir }], limite)
    },
    limit(n: number) {
      return crearQuery(coleccion, filtros, orden, n)
    },
    async get() {
      let docs = [...colMap(coleccion).entries()].map(([id, datos]) => crearSnapshot(coleccion, id, datos))

      for (const f of filtros) {
        const campo = f.campo === mockDocIdField || f.campo === '__name__' ? mockDocIdField : f.campo
        docs = docs.filter(snap => {
          const val = campo === mockDocIdField ? snap.id : snap.data()[campo]
          switch (f.op) {
            case '==': return val === f.valor
            case '!=': return val !== f.valor
            case '>': return val > f.valor
            case '>=': return val >= f.valor
            case '<': return val < f.valor
            case '<=': return val <= f.valor
            case 'in': return Array.isArray(f.valor) && f.valor.includes(val)
            case 'not-in': return Array.isArray(f.valor) && !f.valor.includes(val)
            case 'array-contains': return Array.isArray(val) && val.includes(f.valor)
            default: return true
          }
        })
      }

      for (const o of orden) {
        const campo = o.campo === mockDocIdField || o.campo === '__name__' ? mockDocIdField : o.campo
        docs.sort((a, b) => {
          const av = campo === mockDocIdField ? a.id : (a.data()[campo] ?? null)
          const bv = campo === mockDocIdField ? b.id : (b.data()[campo] ?? null)
          if (av === bv) return 0
          if (av == null) return 1
          if (bv == null) return -1
          const cmp = av < bv ? -1 : av > bv ? 1 : 0
          return o.dir === 'desc' ? -cmp : cmp
        })
      }

      if (limite !== undefined) docs = docs.slice(0, limite)
      return crearQuerySnapshot(docs)
    },
  }
}

// ─── Colección, batch y db ───────────────────────────────────────────────────
function crearColeccion(nombre: string) {
  return {
    doc: (id?: string) => crearRef(nombre, id),
    where: (campo: string, op: string, valor: any) => crearQuery(nombre, [{ campo, op, valor }]),
    orderBy: (campo: string, dir?: string) => crearQuery(nombre, [], [{ campo, dir: dir ?? 'asc' }]),
    limit: (n: number) => crearQuery(nombre, [], [], n),
    get: () => crearQuery(nombre).get(),
    async add(data: any) {
      const ref = crearRef(nombre)
      await ref.set(data)
      return ref
    },
  }
}

function crearBatch() {
  const ops: any[] = []
  return {
    set(ref: any, data: any, opts?: any) { ops.push({ tipo: 'set', ref, data, opts }) },
    update(ref: any, data: any) { ops.push({ tipo: 'update', ref, data }) },
    delete(ref: any) { ops.push({ tipo: 'delete', ref }) },
    async commit() {
      for (const op of ops) {
        if (op.tipo === 'set') await op.ref.set(op.data, op.opts)
        else if (op.tipo === 'update') await op.ref.update(op.data)
        else await op.ref.delete()
      }
    },
  }
}

const mockDbInstance: any = {
  collection: (nombre: string) => crearColeccion(nombre),
  batch: () => crearBatch(),
  // Transacción: lecturas en vivo y escrituras acumuladas que se aplican al
  // final si el callback no lanza (aproximación suficiente para tests E2E).
  // Respeta la regla real de Firestore: no se permiten lecturas después de
  // una escritura dentro de la transacción.
  async runTransaction(cb: any) {
    const ops: any[] = []
    let escritura = false
    const tx = {
      get: async (target: any) => {
        if (escritura) throw new Error('Firestore: lectura después de escritura en transacción')
        return target.get()
      },
      set: (ref: any, data: any, opts?: any) => {
        escritura = true
        ops.push({ tipo: 'set', ref, data, opts })
      },
      update: (ref: any, data: any) => {
        escritura = true
        ops.push({ tipo: 'update', ref, data })
      },
      delete: (ref: any) => {
        escritura = true
        ops.push({ tipo: 'delete', ref })
      },
    }
    const resultado = await cb(tx)
    for (const op of ops) {
      if (op.tipo === 'set') await op.ref.set(op.data, op.opts)
      else if (op.tipo === 'update') await op.ref.update(op.data)
      else await op.ref.delete()
    }
    return resultado
  },
}

// ─── Firebase Auth mock ──────────────────────────────────────────────────────
const mockAuth = {
  // createUser devuelve un uid determinista para que el flujo registro → login → /yo
  // funcione de extremo a extremo (el token ES el uid del documento de perfil).
  createUser: jest.fn(async (datos: any) => ({ uid: `uid-${datos?.email}` })),
  verifyIdToken: jest.fn(async (token: string) => {
    const uid = typeof token === 'string' ? token : String(token)
    return { uid, email: uid.includes('@') ? uid : `${uid}@e2e.test` }
  }),
  deleteUser: jest.fn(async () => {}),
}

// ─── axios mock (usado por AuthService: signInWithPassword y securetoken) ───
jest.mock('axios', () => ({
  post: jest.fn(async (url: string, body: any) => {
    if (url.includes('signInWithPassword')) {
      if (body?.email === 'incorrecto@test.com') {
        const err: any = new Error('Request failed with status code 400')
        err.response = { status: 400, data: { error: { message: 'EMAIL_NOT_FOUND' } } }
        throw err
      }
      const uid = `uid-${body?.email}`
      return { data: { idToken: uid, refreshToken: `refresh-${body?.email}`, expiresIn: '3600' } }
    }
    if (url.includes('/token')) {
      return { data: { id_token: 'nuevo-id-token', refresh_token: 'nuevo-refresh', user_id: 'uid-demo@test.com' } }
    }
    throw new Error(`axios.post sin mock para: ${url}`)
  }),
}))

// ─── firebase-admin mocks ────────────────────────────────────────────────────
jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(() => ({ name: '[DEFAULT]' })),
  getApps: jest.fn(() => [{ name: '[DEFAULT]' }]),
  cert: jest.fn(() => ({})),
}))

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => mockAuth),
}))

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => mockDbInstance),
  FieldValue: mockFieldValue,
  FieldPath: { documentId: jest.fn(() => mockDocIdField) },
  // Stubs para imports en posición de valor que swc no pueda eliminar
  Timestamp: class Timestamp {
    constructor(readonly seconds: number, readonly nanoseconds: number) {}
    toDate() { return new Date(this.seconds * 1000) }
    toMillis() { return this.seconds * 1000 }
  },
  Firestore: class Firestore {},
  DocumentSnapshot: class DocumentSnapshot {},
  DocumentData: class DocumentData {},
  Query: class Query {},
  QuerySnapshot: class QuerySnapshot {},
  DocumentReference: class DocumentReference {},
  FieldPath: { documentId: jest.fn(() => mockDocIdField) },
}))

jest.mock('firebase-admin/storage', () => ({
  getStorage: jest.fn(() => ({
    bucket: jest.fn(() => ({
      file: jest.fn(() => ({
        save: jest.fn(async () => {}),
        delete: jest.fn(async () => {}),
      })),
    })),
  })),
}))

// ─── Acceso desde los specs ──────────────────────────────────────────────────
;(globalThis as any).__E2E__ = {
  db: mockDbInstance,
  auth: mockAuth,
  limpiar: () => {
    almacen.clear()
    contadorId = 0
  },
}
