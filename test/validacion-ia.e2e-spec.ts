import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, leerDoc, dbE2E, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * VALIDACIÓN AUTOMÁTICA DE USUARIOS POR IA — E2E Tests
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * El entorno E2E no tiene Vertex AI configurado, así que la validación corre
 * por el mecanismo de fallback `validarPorReglas` (fuente: 'reglas'). Se
 * verifican:
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

    it('200: perfil coherente con CURP válida y documento → aprobado (fuente reglas)', async () => {
      // Documento CURP pendiente subido previamente (+15 pts de confianza)
      await dbE2E().collection('documentosIdentidad').doc('doc-curp-1').set({
        id: 'doc-curp-1', usuarioId: 'uid-usuario', tipo: 'curp', estado: 'pendiente',
      })

      const res = await request(http)
        .post('/api/ia/validar-usuario/uid-usuario')
        .set('Authorization', token('uid-admin'))

      expect(res.status).toBe(200)
      // En E2E no hay Vertex AI → mecanismo de fallback por reglas
      expect(res.body.fuente).toBe('reglas')
      expect(res.body.confianza).toBeGreaterThanOrEqual(80)
      expect(res.body.aprobado).toBe(true)
      expect(res.body.requiereRevisionManual).toBe(false)
      expect(res.body.detalles.nombreCoherente).toBe(true)
      expect(res.body.detalles.emailCoherente).toBe(true)
      expect(res.body.detalles.curpCoherente).toBe(true)
      expect(res.body.detalles.documentosPresentes).toContain('curp')

      // validarUsuario solo evalúa: NO aplica el resultado al perfil
      const perfil = await leerDoc('perfiles', 'uid-usuario')
      expect(perfil.verificado).toBe(false)
    })

    it('200: perfil sin documentos ni CURP → requiereRevisionManual (revisión humana como último recurso)', async () => {
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
      expect(res.body.confianza).toBeGreaterThanOrEqual(50)
      expect(res.body.confianza).toBeLessThan(80)
      expect(res.body.aprobado).toBe(false)
      expect(res.body.requiereRevisionManual).toBe(true)
    })

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
    it('registro: valida en background y deja la cuenta en revisión manual (sin documentos)', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({ email: 'nuevo@test.com', password: 'Secreta123', nombreCompleto: 'Nueva Persona', rol: 'pcd' })

      expect(res.status).toBe(201)
      const uid = res.body.usuario.id
      expect(uid).toBe('uid-nuevo@test.com')

      // La validación corre en background: esperar a que el registro aparezca
      const ok = await esperarHasta(async () => (await contarValidaciones(uid)) > 0)
      expect(ok).toBe(true)

      // Sin documentos ni CURP no se auto-verifica: revisión manual del admin
      const perfil = await leerDoc('perfiles', uid)
      expect(perfil.verificado).toBe(false)

      const snap = await dbE2E().collection('validacionesIA').where('usuarioId', '==', uid).get()
      const registro = snap.docs[0].data()
      expect(registro.tipo).toBe('fallback')
      expect(registro.fuente).toBe('reglas')
      expect(registro.requiereRevisionManual).toBe(true)
    })

    it('subida de documento: re-evalúa y verifica la cuenta automáticamente', async () => {
      const res = await request(http)
        .post('/api/usuarios/documento-identidad')
        .set('Authorization', token('uid-usuario'))
        .field('tipo', 'curp')
        .field('numeroCurp', CURP_VALIDA)
        .attach('documento', crearPdfFake(), { filename: 'curp.pdf', contentType: 'application/pdf' })
      expect(res.status).toBe(201)

      // Re-evaluación en background: nombre, email, CURP válida y documento → aprobado
      const ok = await esperarHasta(async () => (await leerDoc('perfiles', 'uid-usuario'))?.verificado === true)
      expect(ok).toBe(true)

      const perfil = await leerDoc('perfiles', 'uid-usuario')
      expect(perfil.metodoVerificacion).toBe('ia')
      expect(perfil.estadoValidacionIdentidad).toBe('aprobado')

      // El documento CURP queda aprobado por la IA (sin intervención del admin)
      const docsSnap = await dbE2E().collection('documentosIdentidad')
        .where('usuarioId', '==', 'uid-usuario').get()
      expect(docsSnap.docs[0].data().estado).toBe('aprobado')
      expect(docsSnap.docs[0].data().revisadoPor).toBe('ia')

      // Quedó registro en el historial
      expect(await contarValidaciones('uid-usuario')).toBe(1)
    })

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
