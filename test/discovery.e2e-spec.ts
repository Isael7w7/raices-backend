import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, sembrarInstitucion, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

const instActiva1 = {
  id: 'disc-inst-1',
  nombre: 'Centro de Terapia',
  categoria: 'funcional',
  ciudad: 'Mérida',
  activa: true,
  verificada: true,
  creadoPor: 'owner@test.com',
  tiposDiscapacidad: ['motriz'],
  servicios: ['Fisioterapia', 'Terapia ocupacional'],
  calificacionPromedio: 4.5,
  cantidadCalificaciones: 3,
  fechaCreacion: '2026-01-01T00:00:00.000Z',
}

const instActiva2 = {
  id: 'disc-inst-2',
  nombre: 'Centro Laboral Inclusivo',
  categoria: 'laboral',
  ciudad: 'Cancún',
  activa: true,
  verificada: true,
  creadoPor: 'owner@test.com',
  tiposDiscapacidad: ['visual'],
  servicios: ['Capacitación laboral'],
  calificacionPromedio: 3.8,
  cantidadCalificaciones: 2,
  fechaCreacion: '2026-01-02T00:00:00.000Z',
}

const instInactiva = {
  id: 'disc-inst-3',
  nombre: 'Centro Inactivo',
  categoria: 'educativo',
  ciudad: 'Mérida',
  activa: false,
  verificada: true,
  creadoPor: 'owner@test.com',
  tiposDiscapacidad: ['auditiva'],
  calificacionPromedio: 0,
  cantidadCalificaciones: 0,
  fechaCreacion: '2026-01-03T00:00:00.000Z',
}

describe('Descubrimiento (E2E)', () => {
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
    await sembrarPerfil({ id: 'uid-disc', email: 'disc@test.com', rol: 'pcd', activo: true })
    await sembrarInstitucion(instActiva1)
    await sembrarInstitucion(instActiva2)
    await sembrarInstitucion(instInactiva)
  })

  describe('GET /api/descubrimiento', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/descubrimiento')
      expect(res.status).toBe(401)
    })

    it('200: retorna solo instituciones activas', async () => {
      const res = await request(http)
        .get('/api/descubrimiento')
        .set('Authorization', token('uid-disc'))

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      const ids = res.body.map((i: any) => i.id)
      expect(ids).toContain('disc-inst-1')
      expect(ids).toContain('disc-inst-2')
      expect(ids).not.toContain('disc-inst-3')
    })

    it('200: filtra por categoría', async () => {
      const res = await request(http)
        .get('/api/descubrimiento?categoria=funcional')
        .set('Authorization', token('uid-disc'))

      expect(res.status).toBe(200)
      expect(res.body.length).toBe(1)
      expect(res.body[0].id).toBe('disc-inst-1')
    })

    it('200: filtra por ciudad', async () => {
      const res = await request(http)
        .get('/api/descubrimiento?ciudad=Cancún')
        .set('Authorization', token('uid-disc'))

      expect(res.status).toBe(200)
      expect(res.body.length).toBe(1)
      expect(res.body[0].id).toBe('disc-inst-2')
    })

    it('200: filtra por búsqueda de texto', async () => {
      const res = await request(http)
        .get('/api/descubrimiento?busqueda=Terapia')
        .set('Authorization', token('uid-disc'))

      expect(res.status).toBe(200)
      expect(res.body.length).toBe(1)
      expect(res.body[0].id).toBe('disc-inst-1')
    })

    it('200: filtra por tipo de discapacidad', async () => {
      const res = await request(http)
        .get('/api/descubrimiento?tipoDiscapacidad=visual')
        .set('Authorization', token('uid-disc'))

      expect(res.status).toBe(200)
      expect(res.body.length).toBe(1)
      expect(res.body[0].id).toBe('disc-inst-2')
    })

    it('200: retorna coincidePerfil en cada resultado', async () => {
      const res = await request(http)
        .get('/api/descubrimiento')
        .set('Authorization', token('uid-disc'))

      expect(res.status).toBe(200)
      res.body.forEach((inst: any) => {
        expect(inst).toHaveProperty('coincidePerfil')
        expect(typeof inst.coincidePerfil).toBe('boolean')
      })
    })

    it('200: categorías prioritarias ordenan primero', async () => {
      const res = await request(http)
        .get('/api/descubrimiento?categorias=laboral')
        .set('Authorization', token('uid-disc'))

      expect(res.status).toBe(200)
      expect(res.body.length).toBeGreaterThanOrEqual(2)
      expect(res.body[0].id).toBe('disc-inst-2')
    })
  })
})
