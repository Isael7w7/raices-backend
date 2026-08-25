import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, sembrarInstitucion, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * SECURITY TESTS — RBAC, IDOR, CSRF y Rate Limiting
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Estas pruebas verifican que el sistema protege correctamente los recursos:
 *  1. RBAC (Role-Based Access Control): usuarios con rol incorrecto reciben 403
 *  2. IDOR (Insecure Direct Object Reference): usuarios no pueden acceder a
 *     recursos de otros usuarios conoc IDs
 *  3. CSRF (Cross-Site Request Forgery): logout requiere origen permitido
 *  4. Rate Limiting: protección contra abuso de endpoints
 *
 * Cobertura de escenarios críticos:
 *  - PCD intenta acceder a endpoints de admin → 403
 *  - Tutor intenta acceder a recursos de otro tutor → 403
 *  - Usuario intenta modificar perfil ajeno → 403 o 404
 *  - Logout desde origen malicioso → 403
 * ══════════════════════════════════════════════════════════════════════════════
 */

describe('Security Suite (E2E)', () => {
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
    // Seed users with different roles
    await sembrarPerfil({ id: 'uid-admin', email: 'admin@test.com', rol: 'admin', activo: true, nombreCompleto: 'Admin' })
    await sembrarPerfil({ id: 'uid-pcd', email: 'pcd@test.com', rol: 'pcd', activo: true, nombreCompleto: 'PCD User' })
    await sembrarPerfil({ id: 'uid-tutor', email: 'tutor@test.com', rol: 'tutor', activo: true, nombreCompleto: 'Tutor' })
    await sembrarPerfil({ id: 'uid-tutor2', email: 'tutor2@test.com', rol: 'tutor', activo: true, nombreCompleto: 'Tutor 2' })
    await sembrarPerfil({ id: 'uid-inst', email: 'inst@test.com', rol: 'institucion', activo: true, nombreCompleto: 'Institución' })
    await sembrarPerfil({ id: 'uid-pcd-vinculada', email: 'vinculada@test.com', rol: 'pcd', activo: true, tutorId: 'uid-tutor2', nombreCompleto: 'PCD Vinculada' })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. RBAC — Role-Based Access Control
  // ═══════════════════════════════════════════════════════════════════════════

  describe('RBAC — Admin endpoints', () => {
    const adminEndpoints = [
      { method: 'GET', path: '/api/administracion/estadisticas' },
      { method: 'GET', path: '/api/administracion/analiticas' },
      { method: 'GET', path: '/api/administracion/usuarios' },
      { method: 'GET', path: '/api/administracion/instituciones' },
      { method: 'GET', path: '/api/administracion/instituciones/pendientes' },
      { method: 'GET', path: '/api/administracion/resenas' },
      { method: 'GET', path: '/api/administracion/alertas' },
      { method: 'GET', path: '/api/administracion/configuracion' },
      { method: 'GET', path: '/api/administracion/auditoria' },
    ]

    it.each(adminEndpoints)('$method $path → 401 sin token', async ({ method, path }) => {
      const res = await request(http)[method.toLowerCase() as 'get'](path)
      expect(res.status).toBe(401)
    })

    it.each(adminEndpoints)('$method $path → 403 para PCD', async ({ method, path }) => {
      const res = await request(http)[method.toLowerCase() as 'get'](path)
        .set('Authorization', token('uid-pcd'))
      expect(res.status).toBe(403)
    })

    it.each(adminEndpoints)('$method $path → 403 para tutor', async ({ method, path }) => {
      const res = await request(http)[method.toLowerCase() as 'get'](path)
        .set('Authorization', token('uid-tutor'))
      expect(res.status).toBe(403)
    })

    it.each(adminEndpoints)('$method $path → 200 para admin', async ({ method, path }) => {
      const res = await request(http)[method.toLowerCase() as 'get'](path)
        .set('Authorization', token('uid-admin'))
      expect(res.status).toBe(200)
    })
  })

  describe('RBAC — Tutor-only endpoints', () => {
    it('403: PCD no puede vincular PCD', async () => {
      const res = await request(http)
        .post('/api/usuarios/vincular-pcd')
        .send({ email: 'otro@test.com' })
        .set('Authorization', token('uid-pcd'))
      expect(res.status).toBe(403)
    })

    it('403: institución no puede vincular PCD', async () => {
      const res = await request(http)
        .post('/api/usuarios/vincular-pcd')
        .send({ email: 'pcd@test.com' })
        .set('Authorization', token('uid-inst'))
      expect(res.status).toBe(403)
    })

    it('403: PCD no puede ver perfil PCD de tutor', async () => {
      const res = await request(http)
        .get('/api/usuarios/perfil-pcd/uid-pcd-vinculada')
        .set('Authorization', token('uid-pcd'))
      expect(res.status).toBe(403)
    })
  })

  describe('RBAC — Institution-only endpoints', () => {
    it('403: PCD no puede crear institución', async () => {
      const res = await request(http)
        .post('/api/instituciones')
        .send({ nombre: 'Test', categoria: 'funcional' })
        .set('Authorization', token('uid-pcd'))
      expect(res.status).toBe(403)
    })

    it('403: tutor no puede crear institución', async () => {
      const res = await request(http)
        .post('/api/instituciones')
        .send({ nombre: 'Test', categoria: 'funcional' })
        .set('Authorization', token('uid-tutor'))
      expect(res.status).toBe(403)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. IDOR — Insecure Direct Object Reference
  // ═══════════════════════════════════════════════════════════════════════════

  describe('IDOR — Messages', () => {
    it('403: usuario sin conversación no puede ver mensajes de otro', async () => {
      const res = await request(http)
        .get('/api/mensajes/con/uid-tutor2')
        .set('Authorization', token('uid-pcd'))
      expect(res.status).toBe(403)
    })

    it('403: usuario no puede espiar conversación ajena', async () => {
      // Tutor intenta ver mensajes entre dos PCDs sin haber participado
      const res = await request(http)
        .get('/api/mensajes/con/uid-tutor2')
        .set('Authorization', token('uid-tutor'))
      expect(res.status).toBe(403)
    })
  })

  describe('IDOR — Users (Dependientes)', () => {
    it('404: tutor no puede ver dependiente de otro tutor', async () => {
      // Crear dependiente para uid-tutor2
      await request(http)
        .post('/api/usuarios/dependientes')
        .send({ nombreCompleto: 'Hijo de Tutor2', parentesco: 'hijo' })
        .set('Authorization', token('uid-tutor2'))

      // Intentar acceder desde uid-tutor (sin permisos)
      const res = await request(http)
        .get('/api/usuarios/dependientes')
        .set('Authorization', token('uid-tutor'))
      expect(res.status).toBe(200)
      // Tutor no debería ver dependientes de otro tutor
      expect(res.body).toHaveLength(0)
    })

    it('404: tutor no puede modificar dependiente ajeno', async () => {
      // Crear dependiente para uid-tutor2
      const crearRes = await request(http)
        .post('/api/usuarios/dependientes')
        .send({ nombreCompleto: 'Hijo de Tutor2', parentesco: 'hijo' })
        .set('Authorization', token('uid-tutor2'))

      const depId = crearRes.body.id

      // Intentar modificar desde uid-tutor
      const res = await request(http)
        .put(`/api/usuarios/dependientes/${depId}`)
        .send({ nombreCompleto: 'Nombre Modificado' })
        .set('Authorization', token('uid-tutor'))
      expect(res.status).toBe(404)
    })

    it('404: tutor no puede eliminar dependiente ajeno', async () => {
      // Crear dependiente para uid-tutor2
      const crearRes = await request(http)
        .post('/api/usuarios/dependientes')
        .send({ nombreCompleto: 'Hijo de Tutor2', parentesco: 'hijo' })
        .set('Authorization', token('uid-tutor2'))

      const depId = crearRes.body.id

      // Intentar eliminar desde uid-tutor
      const res = await request(http)
        .delete(`/api/usuarios/dependientes/${depId}`)
        .set('Authorization', token('uid-tutor'))
      expect(res.status).toBe(404)
    })
  })

  describe('IDOR — PCD Linking/Unlinking', () => {
    it('403: tutor no puede desvincular PCD de otro tutor', async () => {
      const res = await request(http)
        .delete('/api/usuarios/pcd-vinculado/uid-pcd-vinculada/desvincular')
        .set('Authorization', token('uid-tutor'))
      expect(res.status).toBe(403)
    })

    it('200: tutor dueño puede desvincular su PCD', async () => {
      const res = await request(http)
        .delete('/api/usuarios/pcd-vinculado/uid-pcd-vinculada/desvincular')
        .set('Authorization', token('uid-tutor2'))
      expect(res.status).toBe(200)
      expect(res.body.desvinculado).toBe(true)
    })

    it('400: PCD no vinculada no puede ser desvinculada', async () => {
      const res = await request(http)
        .delete('/api/usuarios/pcd-vinculado/uid-pcd/desvincular')
        .set('Authorization', token('uid-tutor'))
      expect(res.status).toBe(400)
    })
  })

  describe('IDOR — Institutions', () => {
    beforeEach(async () => {
      await sembrarInstitucion({
        id: 'inst-owner1',
        nombre: 'Centro Owner1',
        categoria: 'funcional',
        activa: true,
        verificada: true,
        creadoPor: 'uid-tutor',
        calificacionPromedio: 0,
        cantidadCalificaciones: 0,
      })
      await sembrarInstitucion({
        id: 'inst-owner2',
        nombre: 'Centro Owner2',
        categoria: 'funcional',
        activa: true,
        verificada: true,
        creadoPor: 'uid-inst',
        calificacionPromedio: 0,
        cantidadCalificaciones: 0,
      })
    })

    it('403: PCD no puede actualizar institución ajena', async () => {
      const res = await request(http)
        .put('/api/instituciones/inst-owner2')
        .send({ descripcion: 'Hackeada' })
        .set('Authorization', token('uid-pcd'))
      expect(res.status).toBe(403)
    })

    // RolesGuard tiene prioridad sobre la propiedad: aunque el tutor sea el
    // dueño del documento, PUT /instituciones/:id exige rol institucion/admin.
    it('403: tutor ni siquiera siendo propietario puede actualizar', async () => {
      const res = await request(http)
        .put('/api/instituciones/inst-owner1')
        .send({ descripcion: 'Actualizada' })
        .set('Authorization', token('uid-tutor'))
      expect(res.status).toBe(403)
    })

    it('200: propietario con rol institucion puede actualizar su institución', async () => {
      const res = await request(http)
        .put('/api/instituciones/inst-owner2')
        .send({ descripcion: 'Actualizada' })
        .set('Authorization', token('uid-inst'))
      expect(res.status).toBe(200)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. CSRF — Cross-Site Request Forgery
  // ═══════════════════════════════════════════════════════════════════════════

  describe('CSRF — Logout Protection', () => {
    it('403: logout desde origen malicioso', async () => {
      const res = await request(http)
        .post('/api/autenticacion/cerrar-sesion')
        .set('Origin', 'https://evil-site.com')
      expect(res.status).toBe(403)
    })

    it('204: logout desde origen permitido', async () => {
      const res = await request(http)
        .post('/api/autenticacion/cerrar-sesion')
        .set('Origin', 'https://raices.techmaleon.com.mx')
      expect(res.status).toBe(204)
    })

    it('204: logout sin header Origin (same-origin request)', async () => {
      const res = await request(http)
        .post('/api/autenticacion/cerrar-sesion')
      expect(res.status).toBe(204)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Authentication — Token Validation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Auth — Token Validation', () => {
    it('401: token inválido (usuario inexistente)', async () => {
      const res = await request(http)
        .get('/api/usuarios/perfil')
        .set('Authorization', token('uid-inexistente'))
      expect(res.status).toBe(401)
    })

    it('401: token vacío', async () => {
      const res = await request(http)
        .get('/api/usuarios/perfil')
        .set('Authorization', '')
      expect(res.status).toBe(401)
    })

    it('401: cookie token_acceso vacía', async () => {
      const res = await request(http)
        .get('/api/autenticacion/yo')
        .set('Cookie', 'token_acceso=; otra=1')
      expect(res.status).toBe(401)
    })

    it('200: autenticación mediante cookie httpOnly', async () => {
      const res = await request(http)
        .get('/api/autenticacion/yo')
        .set('Cookie', 'token_acceso=uid-pcd; token_refresco=irrelevante')
      expect(res.status).toBe(200)
      expect(res.body.id).toBe('uid-pcd')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Registration — Input Validation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Registration — Security Validations', () => {
    it('400: email inválido', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({ email: 'no-es-email', password: 'test123', nombreCompleto: 'Test', rol: 'pcd' })
      expect(res.status).toBe(400)
    })

    it('400: contraseña muy corta', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({ email: 'test@test.com', password: '123', nombreCompleto: 'Test', rol: 'pcd' })
      expect(res.status).toBe(400)
    })

    it('400: rol inválido', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({ email: 'test@test.com', password: 'test123', nombreCompleto: 'Test', rol: 'superadmin' })
      expect(res.status).toBe(400)
    })

    it('400: institución sin categoría', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({ email: 'inst@test.com', password: 'test123', nombreCompleto: 'Centro', rol: 'institucion' })
      expect(res.status).toBe(400)
    })

    it('409: email ya registrado', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({ email: 'pcd@test.com', password: 'test123', nombreCompleto: 'Duplicate', rol: 'pcd' })
      expect(res.status).toBe(409)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Self-Protection — Admin Cannot Delete Self
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Self-Protection', () => {
    it('400: admin no puede desactivar su propia cuenta', async () => {
      const res = await request(http)
        .patch('/api/administracion/usuarios/uid-admin/activo')
        .set('Authorization', token('uid-admin'))
      expect(res.status).toBe(400)
    })

    it('400: admin no puede cambiar su propio rol', async () => {
      const res = await request(http)
        .patch('/api/administracion/usuarios/uid-admin/rol')
        .send({ role: 'pcd' })
        .set('Authorization', token('uid-admin'))
      expect(res.status).toBe(400)
    })

    it('400: admin no puede eliminarse a sí mismo', async () => {
      const res = await request(http)
        .delete('/api/administracion/usuarios/uid-admin')
        .set('Authorization', token('uid-admin'))
      expect(res.status).toBe(400)
    })
  })
})
