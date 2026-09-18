import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

describe('Catálogos (E2E)', () => {
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

  beforeEach(() => limpiarDb())

  describe('GET /api/catalogos', () => {
    it('200: retorna todos los catálogos en un solo objeto', async () => {
      const res = await request(http).get('/api/catalogos')

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('parentescos')
      expect(res.body).toHaveProperty('discapacidades')
      expect(res.body).toHaveProperty('etapasVida')
      expect(res.body).toHaveProperty('features')
      expect(res.body).toHaveProperty('categorias')
      expect(Array.isArray(res.body.parentescos)).toBe(true)
      expect(Array.isArray(res.body.discapacidades)).toBe(true)
      expect(Array.isArray(res.body.etapasVida)).toBe(true)
      expect(Array.isArray(res.body.features)).toBe(true)
      expect(Array.isArray(res.body.categorias)).toBe(true)
    })
  })

  describe('GET /api/catalogos/parentescos', () => {
    it('200: retorna arreglo de parentescos', async () => {
      const res = await request(http).get('/api/catalogos/parentescos')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body.length).toBeGreaterThan(0)
      expect(typeof res.body[0]).toBe('string')
    })
  })

  describe('GET /api/catalogos/discapacidades', () => {
    it('200: retorna arreglo de discapacidades', async () => {
      const res = await request(http).get('/api/catalogos/discapacidades')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body.length).toBeGreaterThan(0)
    })
  })

  describe('GET /api/catalogos/etapas-vida', () => {
    it('200: retorna etapas de vida con rangos de edad', async () => {
      const res = await request(http).get('/api/catalogos/etapas-vida')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body.length).toBeGreaterThan(0)
      expect(res.body[0]).toHaveProperty('label')
    })
  })

  describe('GET /api/catalogos/features', () => {
    it('200: retorna features disponibles', async () => {
      const res = await request(http).get('/api/catalogos/features')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
    })
  })

  describe('GET /api/catalogos/categorias', () => {
    it('200: retorna categorías con identificador y color', async () => {
      const res = await request(http).get('/api/catalogos/categorias')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body.length).toBeGreaterThan(0)
      expect(res.body[0]).toHaveProperty('id')
      expect(res.body[0]).toHaveProperty('label')
    })
  })

  describe('GET /api/catalogos/temporalidad-origen', () => {
    it('200: retorna opciones de temporalidad', async () => {
      const res = await request(http).get('/api/catalogos/temporalidad-origen')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
    })
  })

  describe('GET /api/catalogos/preferencia-formato', () => {
    it('200: retorna formatos preferidos', async () => {
      const res = await request(http).get('/api/catalogos/preferencia-formato')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
    })
  })

  describe('GET /api/catalogos/areas-interes', () => {
    it('200: retorna áreas de interés con subcategorías', async () => {
      const res = await request(http).get('/api/catalogos/areas-interes')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
    })
  })

  describe('GET /api/catalogos/viabilidad-economica', () => {
    it('200: retorna opciones de viabilidad económica', async () => {
      const res = await request(http).get('/api/catalogos/viabilidad-economica')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
    })
  })

  describe('GET /api/catalogos/subcategorias-comunidad', () => {
    it('200: retorna subcategorías de comunidad', async () => {
      const res = await request(http).get('/api/catalogos/subcategorias-comunidad')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
    })
  })

  describe('GET /api/catalogos/tono-contextual', () => {
    it('200: retorna tonos contextuales', async () => {
      const res = await request(http).get('/api/catalogos/tono-contextual')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
    })
  })
})
