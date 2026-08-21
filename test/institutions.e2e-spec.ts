import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, sembrarInstitucion, leerDoc, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

const instVisible = {
  id: 'inst-visible',
  nombre: 'Centro Visible',
  categoria: 'funcional',
  ciudad: 'Mérida',
  activa: true,
  verificada: true,
  creadoPor: 'uid-owner',
  calificacionPromedio: 4.5,
  cantidadCalificaciones: 3,
  fechaCreacion: '2026-01-05T00:00:00.000Z',
}

const instPendiente = {
  id: 'inst-pendiente',
  nombre: 'Centro Pendiente',
  categoria: 'educativo',
  ciudad: 'Mérida',
  activa: true,
  verificada: false,
  creadoPor: 'uid-owner',
  calificacionPromedio: 0,
  cantidadCalificaciones: 0,
  fechaCreacion: '2026-01-02T00:00:00.000Z',
}

const instInactiva = {
  id: 'inst-inactiva',
  nombre: 'Centro Inactivo',
  categoria: 'laboral',
  ciudad: 'Valladolid',
  activa: false,
  verificada: true,
  creadoPor: 'uid-owner',
  calificacionPromedio: 0,
  cantidadCalificaciones: 0,
  fechaCreacion: '2026-01-03T00:00:00.000Z',
}

async function sembrarUsuarios() {
  await sembrarPerfil({ id: 'uid-owner', email: 'owner@test.com', rol: 'institucion', activo: true, verificado: true })
  await sembrarPerfil({ id: 'uid-admin', email: 'admin@test.com', rol: 'admin', activo: true })
  await sembrarPerfil({ id: 'uid-pcd', email: 'pcd@test.com', rol: 'pcd', activo: true })
  await sembrarPerfil({ id: 'uid-tutor', email: 'tutor@test.com', rol: 'tutor', activo: true })
}

describe('Instituciones (E2E)', () => {
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
    await sembrarUsuarios()
    await sembrarInstitucion(instVisible)
    await sembrarInstitucion(instPendiente)
    await sembrarInstitucion(instInactiva)
  })

  describe('GET /api/instituciones (listado público)', () => {
    it('200: formato paginado { datos, paginacion } y solo activas+verificadas', async () => {
      const res = await request(http).get('/api/instituciones')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.datos)).toBe(true)
      expect(res.body.paginacion).toEqual({
        total: 1,
        pagina: 1,
        limite: 10,
        totalPaginas: 1,
      })
      expect(res.body.datos.map((i: any) => i.id)).toEqual(['inst-visible'])
    })

    it('200: filtro por categoria', async () => {
      const res = await request(http).get('/api/instituciones?categoria=educativo')
      expect(res.status).toBe(200)
      expect(res.body.datos).toEqual([]) // la única educativa está pendiente (no pública)
    })
  })

  describe('GET /api/instituciones/:id (detalle público)', () => {
    it('200: institución activa y verificada', async () => {
      const res = await request(http).get('/api/instituciones/inst-visible')
      expect(res.status).toBe(200)
      expect(res.body.id).toBe('inst-visible')
    })

    it('404: institución pendiente (no revela su existencia)', async () => {
      const res = await request(http).get('/api/instituciones/inst-pendiente')
      expect(res.status).toBe(404)
    })

    it('404: institución inactiva', async () => {
      const res = await request(http).get('/api/instituciones/inst-inactiva')
      expect(res.status).toBe(404)
    })

    it('404: institución inexistente', async () => {
      const res = await request(http).get('/api/instituciones/inst-no-existe')
      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/instituciones/:id/detalle (admin o propietario)', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/instituciones/inst-pendiente/detalle')
      expect(res.status).toBe(401)
    })

    it('403: usuario PCD sin permisos', async () => {
      const res = await request(http)
        .get('/api/instituciones/inst-pendiente/detalle')
        .set('Authorization', token('uid-pcd'))
      expect(res.status).toBe(403)
    })

    it('200: el propietario puede ver su institución pendiente', async () => {
      const res = await request(http)
        .get('/api/instituciones/inst-pendiente/detalle')
        .set('Authorization', token('uid-owner'))
      expect(res.status).toBe(200)
      expect(res.body.id).toBe('inst-pendiente')
    })

    it('200: el admin puede ver cualquier institución', async () => {
      const res = await request(http)
        .get('/api/instituciones/inst-pendiente/detalle')
        .set('Authorization', token('uid-admin'))
      expect(res.status).toBe(200)
    })
  })

  describe('POST /api/instituciones (creación por rol)', () => {
    const dto = {
      nombre: 'Nueva Institución',
      categoria: 'funcional',
      ciudad: 'Mérida',
      tiposDiscapacidad: ['tea'],
    }

    it('401: sin token', async () => {
      const res = await request(http).post('/api/instituciones').send(dto)
      expect(res.status).toBe(401)
    })

    it('403: rol PCD no puede crear', async () => {
      const res = await request(http).post('/api/instituciones').send(dto).set('Authorization', token('uid-pcd'))
      expect(res.status).toBe(403)
    })

    it('403: rol tutor no puede crear', async () => {
      const res = await request(http).post('/api/instituciones').send(dto).set('Authorization', token('uid-tutor'))
      expect(res.status).toBe(403)
    })

    it('400: cuerpo inválido (categoría no permitida)', async () => {
      const res = await request(http)
        .post('/api/instituciones')
        .send({ nombre: 'X', categoria: 'invalida' })
        .set('Authorization', token('uid-owner'))
      expect(res.status).toBe(400)
    })

    it('201: rol institución crea y queda pendiente de verificación', async () => {
      // El owner ya tiene una institución (canónica) → anti-duplicado devuelve 400;
      // se usa un usuario institución sin institución previa.
      await sembrarPerfil({ id: 'uid-inst2', email: 'inst2@test.com', rol: 'institucion', activo: true, verificado: true })

      const res = await request(http).post('/api/instituciones').send(dto).set('Authorization', token('uid-inst2'))

      expect(res.status).toBe(201)
      expect(res.body.verificada).toBe(false)
      expect(res.body.activa).toBe(true)
      expect(res.body.creadoPor).toBe('uid-inst2')
    })

    it('400: el usuario institución ya tiene una institución', async () => {
      const res = await request(http).post('/api/instituciones').send(dto).set('Authorization', token('uid-owner'))
      expect(res.status).toBe(400)
    })
  })

  describe('PUT y DELETE /api/instituciones/:id (propietario o admin)', () => {
    it('403: PCD no puede actualizar una institución ajena', async () => {
      const res = await request(http)
        .put('/api/instituciones/inst-visible')
        .send({ descripcion: 'cambio' })
        .set('Authorization', token('uid-pcd'))
      expect(res.status).toBe(403)
    })

    it('200: el propietario actualiza su institución', async () => {
      const res = await request(http)
        .put('/api/instituciones/inst-visible')
        .send({ descripcion: 'nueva descripción' })
        .set('Authorization', token('uid-owner'))
      expect(res.status).toBe(200)
      expect(res.body.descripcion).toBe('nueva descripción')
    })

    it('204: el propietario elimina (soft-delete) con cuerpo vacío', async () => {
      const res = await request(http).delete('/api/instituciones/inst-visible').set('Authorization', token('uid-owner'))

      expect(res.status).toBe(204)
      expect(res.text).toBe('')

      const inst = await leerDoc('instituciones', 'inst-visible')
      expect(inst.activa).toBe(false)
      expect(inst.fechaEliminacion).toBeDefined()
    })
  })

  describe('GET /api/instituciones/mi-institucion', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/instituciones/mi-institucion')
      expect(res.status).toBe(401)
    })

    it('200: devuelve la institución canónica del usuario', async () => {
      const res = await request(http).get('/api/instituciones/mi-institucion').set('Authorization', token('uid-owner'))
      expect(res.status).toBe(200)
      expect(res.body.id).toBe('inst-visible')
    })

    it('404: usuario sin institución', async () => {
      await sembrarPerfil({ id: 'uid-pcd2', email: 'pcd2@test.com', rol: 'pcd', activo: true })
      const res = await request(http).get('/api/instituciones/mi-institucion').set('Authorization', token('uid-pcd2'))
      expect(res.status).toBe(404)
    })
  })
})
