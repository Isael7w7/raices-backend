import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, token, dbE2E } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

describe('Rutas de Desarrollo (E2E)', () => {
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
    await sembrarPerfil({ id: 'uid-rutas', email: 'rutas@test.com', rol: 'pcd', activo: true })
    // Perfil extendido para generación personalizada
    await dbE2E().collection('perfilesExtendidos').doc('ext-rutas').set({
      usuarioId: 'uid-rutas',
      tiposDiscapacidad: '["habla"]',
      etapaVida: 'infancia',
    })
  })

  describe('POST /api/rutas-desarrollo', () => {
    it('401: sin token', async () => {
      const res = await request(http)
        .post('/api/rutas-desarrollo')
        .send({ nombre: 'Mi ruta', areaInteres: 'educacion', descripcion: 'Una ruta de prueba' })
      expect(res.status).toBe(401)
    })

    it('201: crea ruta de desarrollo', async () => {
      const res = await request(http)
        .post('/api/rutas-desarrollo')
        .send({ nombre: 'Aprender a cocinar', areaInteres: 'educacion', descripcion: 'Ruta de habilidades culinarias', prioridad: 'alta' })
        .set('Authorization', token('uid-rutas'))

      expect(res.status).toBe(201)
      expect(res.body.nombre).toBe('Aprender a cocinar')
      expect(res.body.usuarioId).toBe('uid-rutas')
      expect(res.body.estado).toBe('activa')
      expect(res.body.porcentajeProgreso).toBe(0)
    })
  })

  describe('GET /api/rutas-desarrollo', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/rutas-desarrollo')
      expect(res.status).toBe(401)
    })

    it('200: retorna array vacío sin rutas', async () => {
      const res = await request(http)
        .get('/api/rutas-desarrollo')
        .set('Authorization', token('uid-rutas'))

      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('200: lista las rutas del usuario', async () => {
      await request(http)
        .post('/api/rutas-desarrollo')
        .send({ nombre: 'Ruta 1', areaInteres: 'educacion' })
        .set('Authorization', token('uid-rutas'))
      await request(http)
        .post('/api/rutas-desarrollo')
        .send({ nombre: 'Ruta 2', areaInteres: 'laboral', prioridad: 'baja' })
        .set('Authorization', token('uid-rutas'))

      const res = await request(http)
        .get('/api/rutas-desarrollo')
        .set('Authorization', token('uid-rutas'))

      expect(res.status).toBe(200)
      expect(res.body.length).toBe(2)
    })

    it('200: filtra por estado', async () => {
      await request(http)
        .post('/api/rutas-desarrollo')
        .send({ nombre: 'Activa', areaInteres: 'educacion' })
        .set('Authorization', token('uid-rutas'))

      const res = await request(http)
        .get('/api/rutas-desarrollo?estado=activa')
        .set('Authorization', token('uid-rutas'))

      expect(res.status).toBe(200)
      expect(res.body.length).toBe(1)
    })
  })

  describe('GET /api/rutas-desarrollo/resumen', () => {
    it('200: retorna resumen de rutas', async () => {
      await request(http)
        .post('/api/rutas-desarrollo')
        .send({ nombre: 'Ruta activa', areaInteres: 'educacion' })
        .set('Authorization', token('uid-rutas'))

      const res = await request(http)
        .get('/api/rutas-desarrollo/resumen')
        .set('Authorization', token('uid-rutas'))

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('totalRutas')
      expect(res.body).toHaveProperty('rutasActivas')
      expect(res.body).toHaveProperty('rutasCompletadas')
      expect(res.body).toHaveProperty('progresoPromedio')
    })
  })

  describe('GET /api/rutas-desarrollo/:id', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/rutas-desarrollo/some-id')
      expect(res.status).toBe(401)
    })

    it('200: retorna detalle de ruta con pasos', async () => {
      const crear = await request(http)
        .post('/api/rutas-desarrollo')
        .send({ nombre: 'Detalle test', areaInteres: 'educacion' })
        .set('Authorization', token('uid-rutas'))
      const rutaId = crear.body.id

      const res = await request(http)
        .get(`/api/rutas-desarrollo/${rutaId}`)
        .set('Authorization', token('uid-rutas'))

      expect(res.status).toBe(200)
      expect(res.body.id).toBe(rutaId)
      expect(res.body.nombre).toBe('Detalle test')
      expect(Array.isArray(res.body.pasos)).toBe(true)
    })

    it('404: ruta inexistente', async () => {
      const res = await request(http)
        .get('/api/rutas-desarrollo/ruta-fantasma')
        .set('Authorization', token('uid-rutas'))
      expect(res.status).toBe(404)
    })
  })

  describe('PUT /api/rutas-desarrollo/:id', () => {
    it('200: actualiza ruta', async () => {
      const crear = await request(http)
        .post('/api/rutas-desarrollo')
        .send({ nombre: 'Original', areaInteres: 'educacion' })
        .set('Authorization', token('uid-rutas'))
      const rutaId = crear.body.id

      const res = await request(http)
        .put(`/api/rutas-desarrollo/${rutaId}`)
        .send({ nombre: 'Actualizada', prioridad: 'baja' })
        .set('Authorization', token('uid-rutas'))

      expect(res.status).toBe(200)
      expect(res.body.nombre).toBe('Actualizada')
      expect(res.body.prioridad).toBe('baja')
    })

    it('404: ruta inexistente', async () => {
      const res = await request(http)
        .put('/api/rutas-desarrollo/no-existe')
        .send({ nombre: 'X', areaInteres: 'educacion' })
        .set('Authorization', token('uid-rutas'))
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/rutas-desarrollo/:id', () => {
    it('204: elimina ruta', async () => {
      const crear = await request(http)
        .post('/api/rutas-desarrollo')
        .send({ nombre: 'Para borrar', areaInteres: 'educacion' })
        .set('Authorization', token('uid-rutas'))
      const rutaId = crear.body.id

      const res = await request(http)
        .delete(`/api/rutas-desarrollo/${rutaId}`)
        .set('Authorization', token('uid-rutas'))

      expect(res.status).toBe(204)

      // Verificar que ya no existe
      const get = await request(http)
        .get(`/api/rutas-desarrollo/${rutaId}`)
        .set('Authorization', token('uid-rutas'))
      expect(get.status).toBe(404)
    })
  })

  describe('POST /api/rutas-desarrollo/:id/pasos', () => {
    it('201: agrega paso a una ruta', async () => {
      const crear = await request(http)
        .post('/api/rutas-desarrollo')
        .send({ nombre: 'Con pasos', areaInteres: 'educacion' })
        .set('Authorization', token('uid-rutas'))
      const rutaId = crear.body.id

      const res = await request(http)
        .post(`/api/rutas-desarrollo/${rutaId}/pasos`)
        .send({ titulo: 'Paso 1', orden: 1 })
        .set('Authorization', token('uid-rutas'))

      expect(res.status).toBe(201)
      expect(res.body.titulo).toBe('Paso 1')
      expect(res.body.orden).toBe(1)
      expect(res.body.completado).toBe(false)
    })

    it('404: ruta inexistente', async () => {
      const res = await request(http)
        .post('/api/rutas-desarrollo/ruta-fantasma/pasos')
        .send({ titulo: 'Paso huérfano' })
        .set('Authorization', token('uid-rutas'))
      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /api/rutas-desarrollo/:rutaId/pasos/:pasoId/completar', () => {
    it('200: completa un paso', async () => {
      const crear = await request(http)
        .post('/api/rutas-desarrollo')
        .send({ nombre: 'Completar test', areaInteres: 'educacion' })
        .set('Authorization', token('uid-rutas'))
      const rutaId = crear.body.id

      const paso = await request(http)
        .post(`/api/rutas-desarrollo/${rutaId}/pasos`)
        .send({ titulo: 'Paso 1', orden: 1 })
        .set('Authorization', token('uid-rutas'))
      const pasoId = paso.body.id

      const res = await request(http)
        .patch(`/api/rutas-desarrollo/${rutaId}/pasos/${pasoId}/completar`)
        .set('Authorization', token('uid-rutas'))

      expect(res.status).toBe(200)
      expect(res.body.completado).toBe(true)
    })
  })

  describe('PATCH /api/rutas-desarrollo/:rutaId/pasos/:pasoId/descompletar', () => {
    it('200: descompleta un paso', async () => {
      const crear = await request(http)
        .post('/api/rutas-desarrollo')
        .send({ nombre: 'Descompletar test', areaInteres: 'educacion' })
        .set('Authorization', token('uid-rutas'))
      const rutaId = crear.body.id

      const paso = await request(http)
        .post(`/api/rutas-desarrollo/${rutaId}/pasos`)
        .send({ titulo: 'Paso 1', orden: 1 })
        .set('Authorization', token('uid-rutas'))
      const pasoId = paso.body.id

      // Completar primero
      await request(http)
        .patch(`/api/rutas-desarrollo/${rutaId}/pasos/${pasoId}/completar`)
        .set('Authorization', token('uid-rutas'))

      // Descompletar
      const res = await request(http)
        .patch(`/api/rutas-desarrollo/${rutaId}/pasos/${pasoId}/descompletar`)
        .set('Authorization', token('uid-rutas'))

      expect(res.status).toBe(200)
      expect(res.body.completado).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Generación personalizada (Día Cero + Algoritmo Evolutivo)
  // ═══════════════════════════════════════════════════════════════════

  describe('POST /api/rutas-desarrollo/generar-personalizada', () => {
    it('401: sin token', async () => {
      const res = await request(http).post('/api/rutas-desarrollo/generar-personalizada')
      expect(res.status).toBe(401)
    })

    it('201: genera ruta personalizada (Día Cero) para usuario nuevo', async () => {
      const res = await request(http)
        .post('/api/rutas-desarrollo/generar-personalizada')
        .set('Authorization', token('uid-rutas'))

      expect(res.status).toBe(201)
      expect(res.body).toHaveProperty('id')
      expect(res.body).toHaveProperty('nombre')
      expect(res.body).toHaveProperty('pasos')
      expect(res.body.estado).toBe('activa')
      expect(Array.isArray(res.body.pasos)).toBe(true)
      expect(res.body.pasos.length).toBeGreaterThan(0)
    })

    it('201: retorna ruta existente si ya tiene una activa', async () => {
      // Generar primera vez
      const primera = await request(http)
        .post('/api/rutas-desarrollo/generar-personalizada')
        .set('Authorization', token('uid-rutas'))

      // Generar segunda vez
      const segunda = await request(http)
        .post('/api/rutas-desarrollo/generar-personalizada')
        .set('Authorization', token('uid-rutas'))

      expect(segunda.status).toBe(201)
      expect(segunda.body.id).toBe(primera.body.id) // Misma ruta
    })
  })

  describe('GET /api/rutas-desarrollo/mi-ruta', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/rutas-desarrollo/mi-ruta')
      expect(res.status).toBe(401)
    })

    it('200: retorna mensaje cuando no hay ruta activa', async () => {
      const res = await request(http)
        .get('/api/rutas-desarrollo/mi-ruta')
        .set('Authorization', token('uid-rutas'))

      expect(res.status).toBe(200)
      expect(res.body.ruta).toBeNull()
      expect(res.body.mensaje).toContain('No tienes una ruta activa')
    })

    it('200: retorna ruta activa con pasos y entidades locales', async () => {
      // Primero generar una ruta
      await request(http)
        .post('/api/rutas-desarrollo/generar-personalizada')
        .set('Authorization', token('uid-rutas'))

      const res = await request(http)
        .get('/api/rutas-desarrollo/mi-ruta')
        .set('Authorization', token('uid-rutas'))

      expect(res.status).toBe(200)
      expect(res.body.ruta).not.toBeNull()
      expect(res.body.ruta.estado).toBe('activa')
      expect(Array.isArray(res.body.pasos)).toBe(true)
      expect(res.body.pasos.length).toBeGreaterThan(0)
      expect(res.body).toHaveProperty('pasoActual')
      expect(res.body).toHaveProperty('entidadesLocales')
      expect(res.body.entidadesLocales).toHaveProperty('instituciones')
      expect(res.body.entidadesLocales).toHaveProperty('vacantes')
    })
  })
})
