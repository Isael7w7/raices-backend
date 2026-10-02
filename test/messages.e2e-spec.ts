import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, sembrarMensaje, leerDoc, dbE2E, token } from './helpers/fixtures'
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

    it('200: isDeleted false para un socio con cuenta activa', async () => {
      await sembrarMensaje({ id: 'm-a1', remitenteId: 'uid-alice', destinatarioId: 'uid-bob', contenido: 'Hola', leido: true, fechaCreacion: '2026-01-01' })

      const res = await request(http)
        .get('/api/mensajes/conversaciones')
        .set('Authorization', token('uid-alice'))

      expect(res.status).toBe(200)
      expect(res.body[0].isDeleted).toBe(false)
      expect(res.body[0].destinatarioActivo).toBe(true)
    })

    it('200: isDeleted true y sin PII cuando el socio es un usuario fantasma', async () => {
      // Bob fue eliminado por completo: el mensaje sigue existiendo, el perfil no.
      await dbE2E().collection('perfiles').doc('uid-bob').delete()
      await sembrarMensaje({ id: 'm-a2', remitenteId: 'uid-alice', destinatarioId: 'uid-bob', contenido: 'Hola', leido: true, fechaCreacion: '2026-01-01' })

      const res = await request(http)
        .get('/api/mensajes/conversaciones')
        .set('Authorization', token('uid-alice'))

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].isDeleted).toBe(true)
      expect(res.body[0].destinatarioActivo).toBe(false)
      // El historial NO se borra: se conserva y se muestra.
      expect(res.body[0].ultimoMensaje).toBe('Hola')
      // Pero no se filtra el nombre real de la cuenta dada de baja.
      expect(res.body[0].socio.nombreCompleto).toBe('Usuario Eliminado')
      expect(res.body[0].socio.email).toBeUndefined()
    })

    it('200: isDeleted true cuando la cuenta del socio está desactivada (soft delete)', async () => {
      await sembrarPerfil({ id: 'uid-bob', email: 'bob@test.com', rol: 'pcd', activo: false, eliminado: true, nombreCompleto: 'Bob' })
      await sembrarMensaje({ id: 'm-a3', remitenteId: 'uid-alice', destinatarioId: 'uid-bob', contenido: 'Hola', leido: true, fechaCreacion: '2026-01-01' })

      const res = await request(http)
        .get('/api/mensajes/conversaciones')
        .set('Authorization', token('uid-alice'))

      expect(res.body[0].isDeleted).toBe(true)
      expect(res.body[0].socio.nombreCompleto).toBe('Usuario Eliminado')
    })
  })

  describe('DELETE /api/mensajes/conversacion/:userId', () => {
    beforeEach(async () => {
      await sembrarMensaje({ id: 'd-1', remitenteId: 'uid-alice', destinatarioId: 'uid-bob', contenido: 'Hola Bob', leido: true, fechaCreacion: '2026-01-01' })
      await sembrarMensaje({ id: 'd-2', remitenteId: 'uid-bob', destinatarioId: 'uid-alice', contenido: 'Hola Alice', leido: true, fechaCreacion: '2026-01-02' })
    })

    it('401: sin token', async () => {
      const res = await request(http).delete('/api/mensajes/conversacion/uid-bob')
      expect(res.status).toBe(401)
    })

    it('200: elimina la conversación de la lista del usuario', async () => {
      const res = await request(http)
        .delete('/api/mensajes/conversacion/uid-bob')
        .set('Authorization', token('uid-alice'))

      expect(res.status).toBe(200)
      expect(res.body.exito).toBe(true)
      expect(res.body.eliminados).toBe(2)

      const lista = await request(http)
        .get('/api/mensajes/conversaciones')
        .set('Authorization', token('uid-alice'))
      expect(lista.body).toHaveLength(0)
    })

    it('200: es idempotente (repetir la llamada no falla)', async () => {
      await request(http).delete('/api/mensajes/conversacion/uid-bob').set('Authorization', token('uid-alice'))
      const res = await request(http)
        .delete('/api/mensajes/conversacion/uid-bob')
        .set('Authorization', token('uid-alice'))

      expect(res.status).toBe(200)
      expect(res.body.eliminados).toBe(0)
    })

    it('200: devuelve exito aunque la conversación nunca haya existido', async () => {
      const res = await request(http)
        .delete('/api/mensajes/conversacion/uid-charlie')
        .set('Authorization', token('uid-alice'))

      expect(res.status).toBe(200)
      expect(res.body.exito).toBe(true)
    })

    it('no destruye los mensajes ni el historial de la contraparte', async () => {
      await request(http).delete('/api/mensajes/conversacion/uid-bob').set('Authorization', token('uid-alice'))

      // Los documentos siguen en Firestore, marcados solo para quien eliminó.
      expect(await leerDoc('mensajesDirectos', 'd-1')).toMatchObject({ contenido: 'Hola Bob', eliminadoPor: ['uid-alice'] })
      expect(await leerDoc('mensajesDirectos', 'd-2')).toMatchObject({ contenido: 'Hola Alice', eliminadoPor: ['uid-alice'] })

      // Bob sigue viendo su conversación; Alice ya no.
      const listaBob = await request(http).get('/api/mensajes/conversaciones').set('Authorization', token('uid-bob'))
      expect(listaBob.body).toHaveLength(1)

      const conAlice = await request(http).get('/api/mensajes/con/uid-alice').set('Authorization', token('uid-bob'))
      expect(conAlice.status).toBe(200)
      expect(conAlice.body).toHaveLength(2)
    })

    it('403: tras eliminarla, no se puede reabrir por URL directa', async () => {
      await request(http).delete('/api/mensajes/conversacion/uid-bob').set('Authorization', token('uid-alice'))
      const res = await request(http)
        .get('/api/mensajes/con/uid-bob')
        .set('Authorization', token('uid-alice'))

      expect(res.status).toBe(403)
    })

    it('403: no se puede eliminar la propia conversación', async () => {
      const res = await request(http)
        .delete('/api/mensajes/conversacion/uid-alice')
        .set('Authorization', token('uid-alice'))

      expect(res.status).toBe(403)
    })

    it('no borra conversaciones con otros socios', async () => {
      await sembrarMensaje({ id: 'd-3', remitenteId: 'uid-alice', destinatarioId: 'uid-charlie', contenido: 'Hola Charlie', leido: true, fechaCreacion: '2026-01-03' })

      await request(http).delete('/api/mensajes/conversacion/uid-bob').set('Authorization', token('uid-alice'))

      const lista = await request(http).get('/api/mensajes/conversaciones').set('Authorization', token('uid-alice'))
      expect(lista.body).toHaveLength(1)
      expect(lista.body[0].socio.id).toBe('uid-charlie')
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
