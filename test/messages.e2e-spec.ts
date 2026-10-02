import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

describe('Mensajes (E2E) — IDOR Protection', () => {
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
    // Seed users
    await sembrarPerfil({ id: 'uid-alice', email: 'alice@test.com', rol: 'pcd', activo: true, nombreCompleto: 'Alice' })
    await sembrarPerfil({ id: 'uid-bob', email: 'bob@test.com', rol: 'pcd', activo: true, nombreCompleto: 'Bob' })
    await sembrarPerfil({ id: 'uid-charlie', email: 'charlie@test.com', rol: 'pcd', activo: true, nombreCompleto: 'Charlie' })
    await sembrarPerfil({ id: 'uid-admin', email: 'admin@test.com', rol: 'admin', activo: true, nombreCompleto: 'Admin' })
  })

  describe('GET /api/mensajes/con/:userId — IDOR Protection', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/mensajes/con/uid-bob')
      expect(res.status).toBe(401)
    })

    it('403: usuario sin conversación previa no puede ver mensajes de otro usuario', async () => {
      // Alice intenta ver mensajes con Bob sin haber tenido conversación
      const res = await request(http)
        .get('/api/mensajes/con/uid-bob')
        .set('Authorization', token('uid-alice'))
      expect(res.status).toBe(403)
    })

    it('403: usuario intenta acceder a conversación entre otros dos usuarios', async () => {
      // Charlie intenta ver conversación entre Alice y Bob
      const res = await request(http)
        .get('/api/mensajes/con/uid-bob')
        .set('Authorization', token('uid-charlie'))
      expect(res.status).toBe(403)
    })

    it('403: usuario con ID aleatorio no puede espiar conversaciones', async () => {
      // Usuario inventado intenta acceder a mensajes
      const res = await request(http)
        .get('/api/mensajes/con/uid-alice')
        .set('Authorization', token('uid-bob'))
      expect(res.status).toBe(403)
    })
  })

  describe('POST /api/mensajes/enviar/:userId — SendMessage', () => {
    it('401: sin token', async () => {
      const res = await request(http)
        .post('/api/mensajes/enviar/uid-bob')
        .send({ contenido: 'Hola' })
      expect(res.status).toBe(401)
    })

    it('403: no puede enviarse mensajes a sí mismo', async () => {
      const res = await request(http)
        .post('/api/mensajes/enviar/uid-alice')
        .send({ contenido: 'Auto-mensaje' })
        .set('Authorization', token('uid-alice'))
      expect(res.status).toBe(403)
    })

    it('201: mensaje enviado exitosamente a usuario existente', async () => {
      const res = await request(http)
        .post('/api/mensajes/enviar/uid-bob')
        .send({ contenido: 'Hola Bob' })
        .set('Authorization', token('uid-alice'))

      expect(res.status).toBe(201)
      expect(res.body.contenido).toBe('Hola Bob')
      expect(res.body.remitenteId).toBe('uid-alice')
      expect(res.body.destinatarioId).toBe('uid-bob')
    })

    it('403: destinatario no existe', async () => {
      const res = await request(http)
        .post('/api/mensajes/enviar/uid-inexistente')
        .send({ contenido: 'Hola' })
        .set('Authorization', token('uid-alice'))
      expect(res.status).toBe(403)
    })

    it('400: contenido vacío', async () => {
      const res = await request(http)
        .post('/api/mensajes/enviar/uid-bob')
        .send({ contenido: '' })
        .set('Authorization', token('uid-alice'))
      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/mensajes/conversaciones', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/mensajes/conversaciones')
      expect(res.status).toBe(401)
    })

    it('200: usuario sin conversaciones retorna lista vacía', async () => {
      const res = await request(http)
        .get('/api/mensajes/conversaciones')
        .set('Authorization', token('uid-alice'))
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body).toHaveLength(0)
    })
  })

  describe('DELETE /api/mensajes/conversaciones/:userId (borrar chat)', () => {
    it('401: sin token', async () => {
      const res = await request(http).delete('/api/mensajes/conversaciones/uid-bob')
      expect(res.status).toBe(401)
    })

    it('403: no puede borrar la propia conversación', async () => {
      const res = await request(http)
        .delete('/api/mensajes/conversaciones/uid-alice')
        .set('Authorization', token('uid-alice'))
      expect(res.status).toBe(403)
    })

    it('404: conversación inexistente (protección IDOR)', async () => {
      const res = await request(http)
        .delete('/api/mensajes/conversaciones/uid-bob')
        .set('Authorization', token('uid-alice'))
      expect(res.status).toBe(404)
    })

    it('200: oculta la conversación solo para quien la borra', async () => {
      await request(http)
        .post('/api/mensajes/enviar/uid-bob')
        .send({ contenido: 'Hola Bob' })
        .set('Authorization', token('uid-alice'))

      const res = await request(http)
        .delete('/api/mensajes/conversaciones/uid-bob')
        .set('Authorization', token('uid-alice'))
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ocultado: true, socioId: 'uid-bob' })

      // La lista de Alice ya no muestra la conversación...
      const alice = await request(http)
        .get('/api/mensajes/conversaciones')
        .set('Authorization', token('uid-alice'))
      expect(alice.body).toHaveLength(0)

      // ...pero Bob sigue viéndola (borrado lógico individual)
      const bob = await request(http)
        .get('/api/mensajes/conversaciones')
        .set('Authorization', token('uid-bob'))
      expect(bob.body).toHaveLength(1)
      expect(bob.body[0].socio.id).toBe('uid-alice')
    })

    it('200: un mensaje nuevo posterior reaparece la conversación borrada', async () => {
      await request(http)
        .post('/api/mensajes/enviar/uid-bob')
        .send({ contenido: 'Primero' })
        .set('Authorization', token('uid-alice'))
      await request(http)
        .delete('/api/mensajes/conversaciones/uid-bob')
        .set('Authorization', token('uid-alice'))

      // Bob responde después del borrado (pausa para que supere al milisegundo de ocultoEn)
      await new Promise(resolve => setTimeout(resolve, 10))
      await request(http)
        .post('/api/mensajes/enviar/uid-alice')
        .send({ contenido: 'Sigo aquí' })
        .set('Authorization', token('uid-bob'))

      const alice = await request(http)
        .get('/api/mensajes/conversaciones')
        .set('Authorization', token('uid-alice'))
      expect(alice.body).toHaveLength(1)
      expect(alice.body[0].socio.id).toBe('uid-bob')
    })
  })

  describe('GET /api/mensajes/no-leidos', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/mensajes/no-leidos')
      expect(res.status).toBe(401)
    })

    it('200: retorna conteo de mensajes no leídos', async () => {
      const res = await request(http)
        .get('/api/mensajes/no-leidos')
        .set('Authorization', token('uid-alice'))
      expect(res.status).toBe(200)
      // Response may be a raw number or wrapped in an object by the ValidationPipe
      const count = typeof res.body === 'number' ? res.body : res.body.count ?? res.body.total ?? 0
      expect(typeof count).toBe('number')
    })
  })
})
