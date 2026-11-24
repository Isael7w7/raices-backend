/// <reference types="jest" />
import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

/**
 * E2E del endpoint público `GET /api/eventos` (EventosApiController) y de las
 * rutas por ID (`GET /api/eventos/:id`, `POST /api/eventos/:id/asistir`).
 *
 * Cubre las regresiones reportadas:
 *  1. 400 en `?pagina=1&limite=12&proximos=true` (query params como cadena).
 *  2. 404 "Cannot POST /api/eventos/:id/asistir" cuando la ruta no está
 *     registrada: la ruta SIEMPRE debe responder JSON (404 real del servicio)
 *     y nunca el HTML por defecto de Express.
 *  3. Cabeceras CSP del backend: no bloquean la vista previa de PDF.
 */
describe('API Eventos (pública): query params, rutas por ID y cabeceras', () => {
  let app: INestApplication
  let http: any

  const evento = {
    titulo: 'Taller de arte inclusivo',
    categoria: 'taller',
    fechaInicio: '2099-03-10T10:00:00.000Z',
  }

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
    await sembrarPerfil({ id: 'uid-pcd', email: 'pcd@test.com', rol: 'pcd', activo: true, nombreCompleto: 'Ana PCD' })
    await sembrarPerfil({ id: 'uid-tutor', email: 'tutor@test.com', rol: 'padre_tutor', activo: true, nombreCompleto: 'Carlos Tutor' })
    await sembrarPerfil({ id: 'uid-inst', email: 'inst@test.com', rol: 'institucion', activo: true, nombreCompleto: 'Centro Raíces' })
    await sembrarPerfil({ id: 'uid-empresa', email: 'empresa@test.com', rol: 'empresa', activo: true, nombreCompleto: 'Empresa Inclusiva SA' })
    await sembrarPerfil({ id: 'uid-admin', email: 'admin@test.com', rol: 'admin', activo: true, nombreCompleto: 'Admin' })
  })

  async function crear(uid = 'uid-inst') {
    return request(http)
      .post('/api/comunidad/eventos')
      .send(evento)
      .set('Authorization', token(uid))
  }

  // ═══════════════════════════════════════════════════════════════════
  // Publicación de eventos: solo instituciones, empresas y admins
  // ═══════════════════════════════════════════════════════════════════

  describe('POST /api/eventos y POST /api/comunidad/eventos — rol requerido', () => {
    const publicar = (ruta: string, uid: string) =>
      request(http).post(ruta).send(evento).set('Authorization', token(uid))

    it('201: institucion, empresa y admin pueden publicar por ambas rutas', async () => {
      for (const ruta of ['/api/eventos', '/api/comunidad/eventos']) {
        for (const uid of ['uid-inst', 'uid-empresa', 'uid-admin']) {
          const res = await publicar(ruta, uid)
          expect(res.status).toBe(201)
        }
      }
    })

    it('403: cuenta personal (pcd) con Comunidad habilitada', async () => {
      for (const ruta of ['/api/eventos', '/api/comunidad/eventos']) {
        const res = await publicar(ruta, 'uid-pcd')
        expect(res.status).toBe(403)
      }
    })

    it('403: cuenta de tutor con Comunidad habilitada', async () => {
      for (const ruta of ['/api/eventos', '/api/comunidad/eventos']) {
        const res = await publicar(ruta, 'uid-tutor')
        expect(res.status).toBe(403)
      }
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // FALLA 1 — GET /api/eventos con query params como cadenas HTTP
  // ═══════════════════════════════════════════════════════════════════

  describe('GET /api/eventos?pagina=1&limite=12&proximos=true', () => {
    it('200: convierte pagina/limite a número y proximos a booleano', async () => {
      await crear()

      const res = await request(http)
        .get('/api/eventos?pagina=1&limite=12&proximos=true')
        .set('Authorization', token('uid-pcd'))

      expect(res.status).toBe(200)
      expect(res.body.pagina).toBe(1)
      expect(res.body.limite).toBe(12)
      expect(res.body.datos).toHaveLength(1)
    })

    it('200: acepta proximos=false, funciona sin token y con token inválido', async () => {
      await crear()

      const sinProximos = await request(http).get('/api/eventos?pagina=1&limite=12&proximos=false')
      const anonimo = await request(http).get('/api/eventos?pagina=1&limite=12')
      const tokenFalso = await request(http)
        .get('/api/eventos?pagina=1&limite=12&proximos=true')
        .set('Authorization', 'Bearer token-falso')

      expect(sinProximos.status).toBe(200)
      expect(anonimo.status).toBe(200)
      expect(tokenFalso.status).toBe(200)
    })

    it('400: sigue rechazando valores inválidos de paginación', async () => {
      const res = await request(http).get('/api/eventos?pagina=abc&limite=12')

      expect(res.status).toBe(400)
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // FALLA 2 — rutas por ID dinámico (no hay IDs hardcodeados en el backend)
  // ═══════════════════════════════════════════════════════════════════

  describe('GET /api/eventos/:id', () => {
    it('200: retorna el evento cuyo ID real devolvió la API', async () => {
      const id = (await crear()).body.id
      expect(id).toBeTruthy()

      const res = await request(http)
        .get(`/api/eventos/${id}`)
        .set('Authorization', token('uid-pcd'))

      expect(res.status).toBe(200)
      expect(res.body.id).toBe(id)
      expect(res.body.titulo).toBe('Taller de arte inclusivo')
    })

    it('404: ID inexistente (p. ej. sample-1) responde JSON del servicio', async () => {
      const res = await request(http).get('/api/eventos/sample-1')

      expect(res.status).toBe(404)
      expect(res.headers['content-type']).toContain('application/json')
      expect(res.body.message).toBe('Evento no encontrado')
    })
  })

  describe('POST /api/eventos/:id/asistir', () => {
    it('la ruta está registrada: responde JSON, nunca "Cannot POST"', async () => {
      const sinToken = await request(http).post('/api/eventos/sample-1/asistir')

      // Si la ruta no existiera, Express devolvería 404 HTML con
      // "Cannot POST /api/eventos/sample-1/asistir".
      expect(sinToken.status).toBe(401)
      expect(sinToken.headers['content-type']).toContain('application/json')
      expect(JSON.stringify(sinToken.body)).not.toContain('Cannot POST')
    })

    it('404: ID inexistente responde JSON del servicio (evento no encontrado)', async () => {
      const res = await request(http)
        .post('/api/eventos/sample-1/asistir')
        .set('Authorization', token('uid-pcd'))

      expect(res.status).toBe(404)
      expect(res.headers['content-type']).toContain('application/json')
      expect(res.body.message).toBe('Evento no encontrado')
    })

    it('200: alterna la asistencia con el ID real y lo refleja en el listado', async () => {
      const id = (await crear()).body.id

      const confirma = await request(http)
        .post(`/api/eventos/${id}/asistir`)
        .set('Authorization', token('uid-pcd'))
      expect(confirma.status).toBe(200)
      expect(confirma.body).toEqual({ asistiendo: true, cantidadAsistentes: 1 })

      const lista = await request(http)
        .get('/api/eventos?pagina=1&limite=12&proximos=true')
        .set('Authorization', token('uid-pcd'))
      expect(lista.status).toBe(200)
      expect(lista.body.datos[0].id).toBe(id)
      expect(lista.body.datos[0].asisto).toBe(true)

      const cancela = await request(http)
        .post(`/api/eventos/${id}/asistir`)
        .set('Authorization', token('uid-pcd'))
      expect(cancela.status).toBe(200)
      expect(cancela.body).toEqual({ asistiendo: false, cantidadAsistentes: 0 })
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // FALLA 3 — cabeceras CSP: el backend no bloquea la vista previa de PDF
  // ═══════════════════════════════════════════════════════════════════

  describe('cabeceras de seguridad', () => {
    it('permite incrustar PDF desde blob:, Firebase Storage y Google Cloud Storage', async () => {
      const res = await request(http).get('/api/eventos?pagina=1&limite=12&proximos=true')

      expect(res.status).toBe(200)
      const csp = res.headers['content-security-policy'] ?? ''
      expect(csp).toContain("frame-src 'self' blob: https://firebasestorage.googleapis.com https://storage.googleapis.com")
      expect(csp).toContain("object-src 'self' blob: https://firebasestorage.googleapis.com https://storage.googleapis.com")
      expect(csp).toContain("script-src-attr 'unsafe-inline'")
      // No restringir el embebido cross-origin desde el frontend.
      expect(csp).not.toContain('frame-ancestors')
      expect(res.headers['x-frame-options']).toBeUndefined()
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
    })
  })
})
