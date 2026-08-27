import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, sembrarInstitucion, leerDoc, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

describe('Administración (E2E) — autorización por rol', () => {
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
    await sembrarPerfil({ id: 'uid-admin', email: 'admin@test.com', rol: 'admin', activo: true, nombreCompleto: 'Admin' })
    await sembrarPerfil({ id: 'uid-pcd', email: 'pcd@test.com', rol: 'pcd', activo: true, nombreCompleto: 'PCD' })
    await sembrarPerfil({ id: 'uid-objetivo', email: 'obj@test.com', rol: 'padre_tutor', activo: false, nombreCompleto: 'Objetivo' })
    await sembrarInstitucion({
      id: 'inst-pendiente', nombre: 'Pendiente', categoria: 'funcional',
      activa: true, verificada: false, creadoPor: 'uid-owner', fechaCreacion: '2026-01-02T00:00:00.000Z',
    })
    await sembrarInstitucion({
      id: 'inst-verificada', nombre: 'Verificada', categoria: 'educativo',
      activa: true, verificada: true, creadoPor: 'uid-owner2', fechaCreacion: '2026-01-01T00:00:00.000Z',
    })
  })

  describe('GET /api/administracion/estadisticas', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/administracion/estadisticas')
      expect(res.status).toBe(401)
    })

    it('403: rol PCD no tiene acceso', async () => {
      const res = await request(http).get('/api/administracion/estadisticas').set('Authorization', token('uid-pcd'))
      expect(res.status).toBe(403)
    })

    it('200: admin obtiene estadísticas', async () => {
      const res = await request(http).get('/api/administracion/estadisticas').set('Authorization', token('uid-admin'))
      expect(res.status).toBe(200)
      expect(res.body.totalUsuarios).toBe(3)
      expect(res.body.aprobacionPendiente).toBe(1)
      expect(res.body.institucionesVerificadas).toBe(1)
    })
  })

  describe('Instituciones pendientes y aprobación', () => {
    it('200: admin lista solo las pendientes (activa + no verificada)', async () => {
      const res = await request(http)
        .get('/api/administracion/instituciones/pendientes')
        .set('Authorization', token('uid-admin'))

      expect(res.status).toBe(200)
      expect(res.body.map((i: any) => i.id)).toEqual(['inst-pendiente'])
    })

    it('204: admin aprueba una institución (cuerpo vacío) y queda verificada', async () => {
      const res = await request(http)
        .post('/api/administracion/instituciones/inst-pendiente/aprobar')
        .set('Authorization', token('uid-admin'))

      expect(res.status).toBe(204)
      expect(res.text).toBe('')

      const inst = await leerDoc('instituciones', 'inst-pendiente')
      expect(inst.verificada).toBe(true)
      expect(inst.activa).toBe(true)
    })

    it('403: PCD no puede aprobar instituciones', async () => {
      const res = await request(http)
        .post('/api/administracion/instituciones/inst-pendiente/aprobar')
        .set('Authorization', token('uid-pcd'))
      expect(res.status).toBe(403)
    })
  })

  describe('Gestión de usuarios', () => {
    it('200: admin lista usuarios con formato paginado', async () => {
      const res = await request(http).get('/api/administracion/usuarios').set('Authorization', token('uid-admin'))

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.datos)).toBe(true)
      expect(res.body.total).toBe(3)
      expect(res.body.pagina).toBe(1)
      expect(res.body.totalPaginas).toBe(1)
    })

    it('200: admin alterna el estado activo de un usuario', async () => {
      const res = await request(http)
        .patch('/api/administracion/usuarios/uid-objetivo/activo')
        .set('Authorization', token('uid-admin'))

      expect(res.status).toBe(200)
      expect(res.body.activo).toBe(true)
    })

    it('400: admin no puede desactivar su propia cuenta', async () => {
      const res = await request(http)
        .patch('/api/administracion/usuarios/uid-admin/activo')
        .set('Authorization', token('uid-admin'))
      expect(res.status).toBe(400)
    })

    it('200: admin cambia el rol de un usuario', async () => {
      const res = await request(http)
        .patch('/api/administracion/usuarios/uid-objetivo/rol')
        .send({ role: 'admin' })
        .set('Authorization', token('uid-admin'))

      expect(res.status).toBe(200)
      expect(res.body.rol).toBe('admin')
    })

    it('400: rol inválido', async () => {
      const res = await request(http)
        .patch('/api/administracion/usuarios/uid-objetivo/rol')
        .send({ role: 'super-admin' })
        .set('Authorization', token('uid-admin'))
      expect(res.status).toBe(400)
    })

    it('204: admin elimina un usuario (cuerpo vacío)', async () => {
      const res = await request(http)
        .delete('/api/administracion/usuarios/uid-pcd')
        .set('Authorization', token('uid-admin'))

      expect(res.status).toBe(204)
      expect(res.text).toBe('')
      expect(await leerDoc('perfiles', 'uid-pcd')).toBeNull()
    })
  })

  describe('Configuración', () => {
    it('200: admin actualiza configuración', async () => {
      const res = await request(http)
        .put('/api/administracion/configuracion')
        .send({ modoMantenimiento: 'true' })
        .set('Authorization', token('uid-admin'))

      expect(res.status).toBe(200)
      expect(res.body.modoMantenimiento).toBe('true')
    })

    it('403: PCD no puede actualizar configuración', async () => {
      const res = await request(http)
        .put('/api/administracion/configuracion')
        .send({ modoMantenimiento: 'true' })
        .set('Authorization', token('uid-pcd'))
      expect(res.status).toBe(403)
    })
  })
})
