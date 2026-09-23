import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, leerDoc, dbE2E, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * VALIDACIÓN AUTOMÁTICA DE USUARIOS POR IA — E2E Tests
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Estos tests corren contra Gemini REAL vía ADC cuando está disponible
 * (fuente: 'gemini', tipo de registro: 'automatica') y contra el fallback
 * `validarPorReglas` (fuente: 'reglas', tipo: 'fallback') cuando la IA no lo
 * está. Como la confianza que devuelve el modelo varía entre llamadas, los
 * tests validan el CONTRATO determinista del backend — fuente coherente con
 * el tipo de registro y decisión (aprobado / revisión manual / rechazo)
 * calculada con `decisionEsperada` a partir de la confianza y los criterios —
 * en vez de valores exactos de confianza. Se verifican:
 *  1. POST /api/ia/validar-usuario/:id  (validación manual, solo admin)
 *  2. PATCH /api/ia/validar-usuario/:id/override (decisión del admin)
 *  3. GET /api/ia/validar-usuario/:id/historial
 *  4. Validación automática en background (registro y subida de documentos)
 *  5. Bandera de configuración validacionIAHabilitada
 * ══════════════════════════════════════════════════════════════════════════════
 */

const CURP_VALIDA = 'GAPL800101HMCYRL09'

function crearPdfFake(): Buffer {
  return Buffer.from('%PDF-1.4 fake content for testing')
}

/** Espera (con reintentos) a que el flujo en background termine. */
async function esperarHasta(cond: () => Promise<boolean>, intentos = 40, esperaMs = 50): Promise<boolean> {
  for (let i = 0; i < intentos; i++) {
    if (await cond()) return true
    await new Promise(r => setTimeout(r, esperaMs))
  }
  return cond()
}

async function contarValidaciones(usuarioId: string): Promise<number> {
  const snap = await dbE2E().collection('validacionesIA').where('usuarioId', '==', usuarioId).get()
  return snap.size
}

/**
 * Replica las reglas de decisión deterministas de ValidationService.decidir():
 * el modelo propone confianza y criterios, pero el backend decide.
 *  - confianza >= 80 y criterios clave → aprobado, sin revisión manual
 *  - confianza 50-79 → requiere revisión manual
 *  - confianza < 50 → rechazado sin revisión
 * Si el perfil no tiene CURP, el criterio curpCoherente no es clave.
 */
function decisionEsperada(
  confianza: number,
  detalles: { nombreCoherente: boolean; emailCoherente: boolean; rolCoherente: boolean; curpCoherente: boolean },
  tieneCurp: boolean,
): { aprobado: boolean; requiereRevisionManual: boolean } {
  const criteriosClave = detalles.nombreCoherente
    && detalles.emailCoherente
    && detalles.rolCoherente
    && (!tieneCurp || detalles.curpCoherente)
  if (confianza >= 80 && criteriosClave) return { aprobado: true, requiereRevisionManual: false }
  if (confianza >= 50) return { aprobado: false, requiereRevisionManual: true }
  return { aprobado: false, requiereRevisionManual: false }
}

describe('Validación automática de usuarios por IA (E2E)', () => {
  let app: INestApplication
  let http: any

  beforeAll(async () => {
    const ctx = await crearAppE2E()
    app = ctx.app
    http = ctx.http
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    limpiarDb()
    await sembrarPerfil({
      id: 'uid-usuario',
      email: 'usuario@test.com',
      rol: 'pcd',
      activo: true,
      verificado: false,
      nombreCompleto: 'Juan Pérez García',
      curp: CURP_VALIDA,
    })
    await sembrarPerfil({
      id: 'uid-admin',
      email: 'admin@test.com',
      rol: 'admin',
      activo: true,
      nombreCompleto: 'Admin Raíces',
    })
    // limpiarDb deja la validación IA deshabilitada; este spec la habilita
    // explícitamente para probar el flujo completo.
    await dbE2E().collection('configuraciones').doc('validacionIAHabilitada')
      .set({ clave: 'validacionIAHabilitada', valor: 'true' })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // POST /api/ia/validar-usuario/:id — Validación manual por IA
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /api/ia/validar-usuario/:id', () => {
    it('401: sin token', async () => {
      const res = await request(http).post('/api/ia/validar-usuario/uid-usuario')
      expect(res.status).toBe(401)
    })

    it('403: usuario sin rol admin', async () => {
      const res = await request(http)
        .post('/api/ia/validar-usuario/uid-usuario')
        .set('Authorization', token('uid-usuario'))
      expect(res.status).toBe(403)
    })

    it('404: usuario inexistente', async () => {
      const res = await request(http)
        .post('/api/ia/validar-usuario/uid-inexistente')
        .set('Authorization', token('uid-admin'))
      expect(res.status).toBe(404)
    })

    it('200: perfil coherente con CURP válida y documento → decisión determinista (gemini o reglas)', async () => {
      // Documento CURP pendiente subido previamente (+15 pts de confianza)
      await dbE2E().collection('documentosIdentidad').doc('doc-curp-1').set({
        id: 'doc-curp-1', usuarioId: 'uid-usuario', tipo: 'curp', estado: 'pendiente',
      })

      const res = await request(http)
        .post('/api/ia/validar-usuario/uid-usuario')
        .set('Authorization', token('uid-admin'))

      expect(res.status).toBe(200)
      // Con Gemini disponible la fuente es 'gemini'; si la IA cae, 'reglas'
      expect(['gemini', 'reglas']).toContain(res.body.fuente)
      expect(res.body.confianza).toBeGreaterThanOrEqual(0)
      expect(res.body.confianza).toBeLessThanOrEqual(100)

      // Los criterios son la opinión del modelo (con respaldo por reglas): se
      // exige que sean booleanos; los documentos salen del cálculo por reglas.
      expect(typeof res.body.detalles.nombreCoherente).toBe('boolean')
      expect(typeof res.body.detalles.emailCoherente).toBe('boolean')
      expect(typeof res.body.detalles.curpCoherente).toBe('boolean')
      expect(res.body.detalles.documentosPresentes).toContain('curp')

      // El backend decide con reglas deterministas sobre la confianza devuelta
      const esperado = decisionEsperada(res.body.confianza, res.body.detalles, true)
      expect(res.body.aprobado).toBe(esperado.aprobado)
      expect(res.body.requiereRevisionManual).toBe(esperado.requiereRevisionManual)

      // validarUsuario solo evalúa: NO aplica el resultado al perfil
      const perfil = await leerDoc('perfiles', 'uid-usuario')
      expect(perfil.verificado).toBe(false)
    }, 60000)

    it('200: perfil sin documentos ni CURP → nunca se auto-aprueba (confianza < 80)', async () => {
      await sembrarPerfil({
        id: 'uid-usuario',
        email: 'usuario@test.com',
        rol: 'pcd',
        activo: true,
        nombreCompleto: 'Juan Pérez García',
      })

      const res = await request(http)
        .post('/api/ia/validar-usuario/uid-usuario')
        .set('Authorization', token('uid-admin'))

      expect(res.status).toBe(200)
      expect(['gemini', 'reglas']).toContain(res.body.fuente)
      expect(res.body.detalles.documentosPresentes).toEqual([])

      // Regla del prompt: sin CURP ni documentos la confianza no debe llegar
      // a 80 (datos sin verificar) — la cuenta nunca se auto-verifica. Dentro
      // de ese techo, la decisión final (revisión manual o rechazo) depende
      // de la confianza real que devuelva Gemini en cada llamada.
      expect(res.body.confianza).toBeGreaterThanOrEqual(0)
      expect(res.body.confianza).toBeLessThan(80)
      expect(res.body.aprobado).toBe(false)

      const esperado = decisionEsperada(res.body.confianza, res.body.detalles, false)
      expect(res.body.aprobado).toBe(esperado.aprobado)
      expect(res.body.requiereRevisionManual).toBe(esperado.requiereRevisionManual)
    }, 60000)

    it('200: CURP con formato inválido → rechazado sin revisión manual (problema grave)', async () => {
      await sembrarPerfil({
        id: 'uid-usuario',
        email: 'usuario@test.com',
        rol: 'pcd',
        activo: true,
        nombreCompleto: 'Juan Pérez García',
        curp: 'GAPL800101HXXRLAA9', // entidad federativa inválida
      })

      const res = await request(http)
        .post('/api/ia/validar-usuario/uid-usuario')
        .set('Authorization', token('uid-admin'))

      expect(res.status).toBe(200)
      expect(res.body.aprobado).toBe(false)
      expect(res.body.requiereRevisionManual).toBe(false)
      expect(res.body.confianza).toBeLessThan(50)
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // PATCH /api/ia/validar-usuario/:id/override — Override manual del admin
  // ══════════════════════════════════════════════════════════════════════════

  describe('PATCH /api/ia/validar-usuario/:id/override', () => {
    it('401: sin token', async () => {
      const res = await request(http)
        .patch('/api/ia/validar-usuario/uid-usuario/override')
        .send({ aprobado: true })
      expect(res.status).toBe(401)
    })

    it('403: usuario sin rol admin', async () => {
      const res = await request(http)
        .patch('/api/ia/validar-usuario/uid-usuario/override')
        .set('Authorization', token('uid-usuario'))
        .send({ aprobado: true })
      expect(res.status).toBe(403)
    })

    it('400: sin el campo aprobado', async () => {
      const res = await request(http)
        .patch('/api/ia/validar-usuario/uid-usuario/override')
        .set('Authorization', token('uid-admin'))
        .send({ motivo: 'sin decisión' })
      expect(res.status).toBe(400)
    })

    it('404: usuario inexistente', async () => {
      const res = await request(http)
        .patch('/api/ia/validar-usuario/uid-inexistente/override')
        .set('Authorization', token('uid-admin'))
        .send({ aprobado: true })
      expect(res.status).toBe(404)
    })

    it('200: admin aprueba → verificado=true y registro tipo override', async () => {
      const res = await request(http)
        .patch('/api/ia/validar-usuario/uid-usuario/override')
        .set('Authorization', token('uid-admin'))
        .send({ aprobado: true, motivo: 'CURP verificada visualmente' })

      expect(res.status).toBe(200)
      expect(res.body.aprobado).toBe(true)
      expect(res.body.tipo).toBe('override')
      expect(res.body.fuente).toBe('admin')
      expect(res.body.adminId).toBe('uid-admin')
      expect(res.body.razonamiento).toBe('CURP verificada visualmente')

      const perfil = await leerDoc('perfiles', 'uid-usuario')
      expect(perfil.verificado).toBe(true)
      expect(perfil.metodoVerificacion).toBe('admin')
    })

    it('200: admin rechaza → verificado=false', async () => {
      const res = await request(http)
        .patch('/api/ia/validar-usuario/uid-usuario/override')
        .set('Authorization', token('uid-admin'))
        .send({ aprobado: false, motivo: 'Datos inconsistentes' })

      expect(res.status).toBe(200)
      expect(res.body.aprobado).toBe(false)

      const perfil = await leerDoc('perfiles', 'uid-usuario')
      expect(perfil.verificado).toBe(false)
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // GET /api/ia/validar-usuario/:id/historial
  // ══════════════════════════════════════════════════════════════════════════

  describe('GET /api/ia/validar-usuario/:id/historial', () => {
    it('403: usuario sin rol admin', async () => {
      const res = await request(http)
        .get('/api/ia/validar-usuario/uid-usuario/historial')
        .set('Authorization', token('uid-usuario'))
      expect(res.status).toBe(403)
    })

    it('404: usuario inexistente', async () => {
      const res = await request(http)
        .get('/api/ia/validar-usuario/uid-inexistente/historial')
        .set('Authorization', token('uid-admin'))
      expect(res.status).toBe(404)
    })

    it('200: lista las validaciones del más reciente al más antiguo', async () => {
      await request(http)
        .patch('/api/ia/validar-usuario/uid-usuario/override')
        .set('Authorization', token('uid-admin'))
        .send({ aprobado: true, motivo: 'primera revisión' })
      await request(http)
        .patch('/api/ia/validar-usuario/uid-usuario/override')
        .set('Authorization', token('uid-admin'))
        .send({ aprobado: false, motivo: 'segunda revisión' })

      const res = await request(http)
        .get('/api/ia/validar-usuario/uid-usuario/historial')
        .set('Authorization', token('uid-admin'))

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
      expect(res.body[0].razonamiento).toBe('segunda revisión')
      expect(res.body[1].razonamiento).toBe('primera revisión')
      expect(res.body[0].usuarioId).toBe('uid-usuario')
      expect(res.body[0].fechaValidacion).toBeDefined()
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Validación automática en background (registro y subida de documentos)
  // ══════════════════════════════════════════════════════════════════════════

  describe('Validación automática en background', () => {
    it('registro: valida en background y registra una decisión coherente (gemini o fallback)', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({ email: 'nuevo@test.com', password: 'Secreta123', nombreCompleto: 'Nueva Persona', rol: 'pcd' })

      expect(res.status).toBe(201)
      const uid = res.body.usuario.id
      expect(uid).toBe('uid-nuevo@test.com')

      // La validación corre en background: una llamada a Gemini puede tardar
      // varios segundos, así que se espera hasta 20s a que aparezca el registro.
      const ok = await esperarHasta(async () => (await contarValidaciones(uid)) > 0, 100, 200)
      expect(ok).toBe(true)

      const snap = await dbE2E().collection('validacionesIA').where('usuarioId', '==', uid).get()
      expect(snap.size).toBe(1)
      const registro = snap.docs[0].data()

      // Fuente y tipo de registro son coherentes: gemini↔automatica, reglas↔fallback
      expect(['gemini', 'reglas']).toContain(registro.fuente)
      expect(registro.tipo).toBe(registro.fuente === 'gemini' ? 'automatica' : 'fallback')

      // Cuenta registrada sin CURP ni documentos: la decisión se calcula con
      // las reglas deterministas sobre la confianza registrada.
      const esperado = decisionEsperada(registro.confianza, registro.detalles, false)
      expect(registro.aprobado).toBe(esperado.aprobado)
      expect(registro.requiereRevisionManual).toBe(esperado.requiereRevisionManual)

      // El perfil solo queda verificado si la decisión fue aprobada sin revisión
      const perfil = await leerDoc('perfiles', uid)
      expect(perfil.verificado).toBe(registro.aprobado && !registro.requiereRevisionManual)
    }, 60000)

    it('subida de documento: re-evalúa en background y aplica la decisión de forma atómica', async () => {
      const res = await request(http)
        .post('/api/usuarios/documento-identidad')
        .set('Authorization', token('uid-usuario'))
        .field('tipo', 'curp')
        .field('numeroCurp', CURP_VALIDA)
        .attach('documento', crearPdfFake(), { filename: 'curp.pdf', contentType: 'application/pdf' })
      expect(res.status).toBe(201)

      // El registro de auditoría y el perfil se actualizan en el MISMO batch:
      // basta con esperar a que aparezca el registro (la llamada a Gemini en
      // background puede tardar varios segundos → hasta 30s de espera).
      const ok = await esperarHasta(async () => (await contarValidaciones('uid-usuario')) > 0, 150, 200)
      expect(ok).toBe(true)

      const snap = await dbE2E().collection('validacionesIA').where('usuarioId', '==', 'uid-usuario').get()
      expect(snap.size).toBe(1)
      const registro = snap.docs[0].data()
      const perfil = await leerDoc('perfiles', 'uid-usuario')

      // Fuente y tipo coherentes; la decisión sigue las reglas deterministas
      // (el perfil sí tiene CURP válida y documento, así que curp cuenta).
      expect(['gemini', 'reglas']).toContain(registro.fuente)
      expect(registro.tipo).toBe(registro.fuente === 'gemini' ? 'automatica' : 'fallback')
      const esperado = decisionEsperada(registro.confianza, registro.detalles, true)
      expect(registro.aprobado).toBe(esperado.aprobado)
      expect(registro.requiereRevisionManual).toBe(esperado.requiereRevisionManual)

      // El perfil y los documentos quedan consistentes con la decisión aplicada
      expect(perfil.verificado).toBe(registro.aprobado && !registro.requiereRevisionManual)
      expect(perfil.estadoValidacionIdentidad).toBe(registro.aprobado ? 'aprobado' : 'pendiente')

      const docsSnap = await dbE2E().collection('documentosIdentidad')
        .where('usuarioId', '==', 'uid-usuario').get()
      expect(docsSnap.docs.length).toBe(1)
      const doc = docsSnap.docs[0].data()
      if (registro.aprobado) {
        // Aprobación por IA: el documento CURP se aprueba sin intervención del admin
        expect(perfil.metodoVerificacion).toBe('ia')
        expect(doc.estado).toBe('aprobado')
        expect(doc.revisadoPor).toBe('ia')
      } else {
        // Revisión manual o rechazo: el documento queda pendiente del admin
        expect(doc.estado).toBe('pendiente')
      }
    }, 60000)

    it('validacionIAHabilitada=false: el registro no genera validaciones ni verifica', async () => {
      await dbE2E().collection('configuraciones').doc('validacionIAHabilitada')
        .set({ clave: 'validacionIAHabilitada', valor: 'false' })

      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({ email: 'apagado@test.com', password: 'Secreta123', nombreCompleto: 'Persona Apagada', rol: 'pcd' })
      expect(res.status).toBe(201)

      // Dar margen a que (si se hubiera disparado) el flujo en background corra
      await new Promise(r => setTimeout(r, 300))

      expect(await contarValidaciones('uid-apagado@test.com')).toBe(0)
      const perfil = await leerDoc('perfiles', 'uid-apagado@test.com')
      expect(perfil.verificado).toBe(false)
    })
  })
})
