import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, sembrarInstitucion, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

const inst1 = {
  id: 'fav-inst-1',
  nombre: 'Centro de Rehabilitación',
  categoria: 'funcional',
  ciudad: 'Mérida',
  activa: true,
  verificada: true,
  creadoPor: 'owner@test.com',
  tiposDiscapacidad: ['motriz'],
  servicios: ['Fisioterapia'],
  calificacionPromedio: 4.0,
  cantidadCalificaciones: 2,
  fechaCreacion: '2026-01-01T00:00:00.000Z',
}

const inst2 = {
  id: 'fav-inst-2',
  nombre: 'Centro Educativo',
  categoria: 'educativo',
  ciudad: 'Mérida',
  activa: true,
  verificada: true,
  creadoPor: 'owner@test.com',
  tiposDiscapacidad: ['tea'],
  servicios: ['Educación especial'],
  calificacionPromedio: 4.5,
  cantidadCalificaciones: 1,
  fechaCreacion: '2026-01-02T00:00:00.000Z',
}

describe('Favoritos (E2E)', () => {
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
    await sembrarPerfil({ id: 'uid-fav', email: 'fav@test.com', rol: 'pcd', activo: true })
    await sembrarInstitucion(inst1)
    await sembrarInstitucion(inst2)
  })

  describe('POST /api/favoritos/:institutionId/alternar', () => {
    it('401: sin token', async () => {
      const res = await request(http).post('/api/favoritos/fav-inst-1/alternar')
      expect(res.status).toBe(401)
    })

    it('201: agrega institución a favoritos', async () => {
      const res = await request(http)
        .post('/api/favoritos/fav-inst-1/alternar')
        .set('Authorization', token('uid-fav'))

      expect(res.status).toBe(201)
      expect(res.body.favorito).toBe(true)
    })

    it('201: quita institución de favoritos (toggle off)', async () => {
      // Agregar primero
      await request(http)
        .post('/api/favoritos/fav-inst-1/alternar')
        .set('Authorization', token('uid-fav'))

      // Quitar
      const res = await request(http)
        .post('/api/favoritos/fav-inst-1/alternar')
        .set('Authorization', token('uid-fav'))

      expect(res.status).toBe(201)
      expect(res.body.favorito).toBe(false)
    })

    it('201: puede alternar múltiples instituciones', async () => {
      const r1 = await request(http)
        .post('/api/favoritos/fav-inst-1/alternar')
        .set('Authorization', token('uid-fav'))
      expect(r1.body.favorito).toBe(true)

      const r2 = await request(http)
        .post('/api/favoritos/fav-inst-2/alternar')
        .set('Authorization', token('uid-fav'))
      expect(r2.body.favorito).toBe(true)
    })
  })

  describe('GET /api/favoritos', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/favoritos')
      expect(res.status).toBe(401)
    })

    it('200: retorna array vacío si no hay favoritos', async () => {
      const res = await request(http)
        .get('/api/favoritos')
        .set('Authorization', token('uid-fav'))

      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('200: retorna instituciones favoritas con datos completos', async () => {
      await request(http)
        .post('/api/favoritos/fav-inst-1/alternar')
        .set('Authorization', token('uid-fav'))

      const res = await request(http)
        .get('/api/favoritos')
        .set('Authorization', token('uid-fav'))

      expect(res.status).toBe(200)
      expect(res.body.length).toBe(1)
      expect(res.body[0].id).toBe('fav-inst-1')
      expect(res.body[0].nombre).toBe('Centro de Rehabilitación')
    })
  })

  describe('GET /api/favoritos/ids', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/favoritos/ids')
      expect(res.status).toBe(401)
    })

    it('200: retorna solo IDs de favoritos', async () => {
      await request(http)
        .post('/api/favoritos/fav-inst-1/alternar')
        .set('Authorization', token('uid-fav'))
      await request(http)
        .post('/api/favoritos/fav-inst-2/alternar')
        .set('Authorization', token('uid-fav'))

      const res = await request(http)
        .get('/api/favoritos/ids')
        .set('Authorization', token('uid-fav'))

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body).toContain('fav-inst-1')
      expect(res.body).toContain('fav-inst-2')
    })

    it('200: retorna array vacío sin favoritos', async () => {
      const res = await request(http)
        .get('/api/favoritos/ids')
        .set('Authorization', token('uid-fav'))

      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })
  })
})
