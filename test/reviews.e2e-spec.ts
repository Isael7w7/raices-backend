import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, sembrarInstitucion, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

const instResena = {
  id: 'rev-inst-1',
  nombre: 'Centro de Reseñas',
  categoria: 'funcional',
  ciudad: 'Mérida',
  activa: true,
  verificada: true,
  creadoPor: 'owner@test.com',
  tiposDiscapacidad: ['motriz'],
  calificacionPromedio: 0,
  cantidadCalificaciones: 0,
  fechaCreacion: '2026-01-01T00:00:00.000Z',
}

describe('Reseñas (E2E)', () => {
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
    await sembrarPerfil({ id: 'uid-reviewer', email: 'reviewer@test.com', rol: 'pcd', activo: true })
    await sembrarPerfil({ id: 'uid-reviewer2', email: 'reviewer2@test.com', rol: 'pcd', activo: true })
    await sembrarInstitucion(instResena)
  })

  describe('POST /api/resenas/institucion/:id', () => {
    it('401: sin token', async () => {
      const res = await request(http)
        .post('/api/resenas/institucion/rev-inst-1')
        .send({ calificacion: 5, comentario: 'Excelente' })
      expect(res.status).toBe(401)
    })

    it('201: crea reseña exitosamente', async () => {
      const res = await request(http)
        .post('/api/resenas/institucion/rev-inst-1')
        .send({ calificacion: 4, comentario: 'Muy buen servicio' })
        .set('Authorization', token('uid-reviewer'))

      expect(res.status).toBe(201)
      expect(res.body.calificacion).toBe(4)
      expect(res.body.comentario).toBe('Muy buen servicio')
      expect(res.body.usuarioId).toBe('uid-reviewer')
      expect(res.body.institucionId).toBe('rev-inst-1')
    })

    it('201: actualiza reseña existente del mismo usuario', async () => {
      // Crear primera reseña
      await request(http)
        .post('/api/resenas/institucion/rev-inst-1')
        .send({ calificacion: 3, comentario: 'Regular' })
        .set('Authorization', token('uid-reviewer'))

      // Actualizar
      const res = await request(http)
        .post('/api/resenas/institucion/rev-inst-1')
        .send({ calificacion: 5, comentario: '¡Excelente!' })
        .set('Authorization', token('uid-reviewer'))

      expect(res.status).toBe(201)
      expect(res.body.calificacion).toBe(5)
      expect(res.body.comentario).toBe('¡Excelente!')
    })

    it('200: sin comentario es válido', async () => {
      const res = await request(http)
        .post('/api/resenas/institucion/rev-inst-1')
        .send({ calificacion: 4 })
        .set('Authorization', token('uid-reviewer'))

      expect(res.status).toBe(201)
      expect(res.body.calificacion).toBe(4)
    })
  })

  describe('GET /api/resenas/institucion/:id', () => {
    it('200: retorna reseñas de una institución', async () => {
      // Crear reseñas
      await request(http)
        .post('/api/resenas/institucion/rev-inst-1')
        .send({ calificacion: 5, comentario: 'Increíble' })
        .set('Authorization', token('uid-reviewer'))
      await request(http)
        .post('/api/resenas/institucion/rev-inst-1')
        .send({ calificacion: 4, comentario: 'Muy bien' })
        .set('Authorization', token('uid-reviewer2'))

      const res = await request(http).get('/api/resenas/institucion/rev-inst-1')

      expect(res.status).toBe(200)
      expect(res.body.datos.length).toBe(2)
      expect(res.body.total).toBe(2)
    })

    it('200: retorna paginación correcta', async () => {
      const res = await request(http).get('/api/resenas/institucion/rev-inst-1?pagina=1&limite=10')

      expect(res.status).toBe(200)
      expect(res.body.pagina).toBe(1)
      expect(res.body.limite).toBe(10)
    })
  })

  describe('GET /api/resenas/mias', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/resenas/mias')
      expect(res.status).toBe(401)
    })

    it('200: retorna solo las reseñas del usuario', async () => {
      await request(http)
        .post('/api/resenas/institucion/rev-inst-1')
        .send({ calificacion: 5, comentario: 'Mía' })
        .set('Authorization', token('uid-reviewer'))

      const res = await request(http)
        .get('/api/resenas/mias')
        .set('Authorization', token('uid-reviewer'))

      expect(res.status).toBe(200)
      expect(res.body.datos.length).toBe(1)
      expect(res.body.datos[0].usuarioId).toBe('uid-reviewer')
    })
  })

  describe('PUT /api/resenas/:id', () => {
    it('401: sin token', async () => {
      const res = await request(http)
        .put('/api/resenas/uid-reviewer_rev-inst-1')
        .send({ calificacion: 3 })
      expect(res.status).toBe(401)
    })

    it('200: actualiza calificación y comentario', async () => {
      await request(http)
        .post('/api/resenas/institucion/rev-inst-1')
        .send({ calificacion: 4, comentario: 'Original' })
        .set('Authorization', token('uid-reviewer'))

      const res = await request(http)
        .put('/api/resenas/uid-reviewer_rev-inst-1')
        .send({ calificacion: 5, comentario: 'Editado' })
        .set('Authorization', token('uid-reviewer'))

      expect(res.status).toBe(200)
      expect(res.body.calificacion).toBe(5)
      expect(res.body.comentario).toBe('Editado')
    })

    it('403: no puede editar reseña de otro usuario', async () => {
      await request(http)
        .post('/api/resenas/institucion/rev-inst-1')
        .send({ calificacion: 4, comentario: 'De reviewer1' })
        .set('Authorization', token('uid-reviewer'))

      const res = await request(http)
        .put('/api/resenas/uid-reviewer_rev-inst-1')
        .send({ calificacion: 1 })
        .set('Authorization', token('uid-reviewer2'))

      expect(res.status).toBe(403)
    })

    it('404: reseña inexistente', async () => {
      const res = await request(http)
        .put('/api/resenas/no-existe')
        .send({ calificacion: 3 })
        .set('Authorization', token('uid-reviewer'))

      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/resenas/:id', () => {
    it('401: sin token', async () => {
      const res = await request(http).delete('/api/resenas/uid-reviewer_rev-inst-1')
      expect(res.status).toBe(401)
    })

    it('204: elimina reseña propia', async () => {
      await request(http)
        .post('/api/resenas/institucion/rev-inst-1')
        .send({ calificacion: 4, comentario: 'Para borrar' })
        .set('Authorization', token('uid-reviewer'))

      const res = await request(http)
        .delete('/api/resenas/uid-reviewer_rev-inst-1')
        .set('Authorization', token('uid-reviewer'))

      expect(res.status).toBe(204)
    })

    it('403: no puede eliminar reseña de otro usuario', async () => {
      await request(http)
        .post('/api/resenas/institucion/rev-inst-1')
        .send({ calificacion: 4, comentario: 'Ajena' })
        .set('Authorization', token('uid-reviewer'))

      const res = await request(http)
        .delete('/api/resenas/uid-reviewer_rev-inst-1')
        .set('Authorization', token('uid-reviewer2'))

      expect(res.status).toBe(403)
    })
  })
})
