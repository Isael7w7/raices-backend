import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, dbE2E, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

describe('Notificaciones (E2E)', () => {
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
    await sembrarPerfil({ id: 'uid-notif', email: 'notif@test.com', rol: 'pcd', activo: true })
  })

  async function sembrarNotificacion(datos: any) {
    const ref = dbE2E().collection('notificaciones').doc()
    const id = ref.id
    await ref.set({
      id,
      usuarioId: 'uid-notif',
      tipo: 'mensaje',
      titulo: 'Nuevo mensaje',
      cuerpo: 'Tienes un mensaje nuevo',
      leida: false,
      fechaCreacion: new Date().toISOString(),
      ...datos,
    })
    return id
  }

  describe('GET /api/notificaciones', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/notificaciones')
      expect(res.status).toBe(401)
    })

    it('200: retorna array vacío sin notificaciones', async () => {
      const res = await request(http)
        .get('/api/notificaciones')
        .set('Authorization', token('uid-notif'))

      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('200: retorna notificaciones del usuario ordenadas por fecha', async () => {
      await sembrarNotificacion({ titulo: 'Primera', fechaCreacion: '2026-01-01T00:00:00.000Z' })
      await sembrarNotificacion({ titulo: 'Segunda', fechaCreacion: '2026-01-02T00:00:00.000Z' })

      const res = await request(http)
        .get('/api/notificaciones')
        .set('Authorization', token('uid-notif'))

      expect(res.status).toBe(200)
      expect(res.body.length).toBe(2)
      // Más reciente primero
      expect(res.body[0].titulo).toBe('Segunda')
      expect(res.body[1].titulo).toBe('Primera')
    })

    it('200: no retorna notificaciones de otros usuarios', async () => {
      await sembrarNotificacion({ titulo: 'Mía' })
      // Notificación de otro usuario
      const ref = dbE2E().collection('notificaciones').doc()
      await ref.set({
        id: ref.id,
        usuarioId: 'uid-otro',
        tipo: 'mensaje',
        titulo: 'De otro',
        cuerpo: 'No debería aparecer',
        leida: false,
        fechaCreacion: new Date().toISOString(),
      })

      const res = await request(http)
        .get('/api/notificaciones')
        .set('Authorization', token('uid-notif'))

      expect(res.status).toBe(200)
      expect(res.body.length).toBe(1)
      expect(res.body[0].titulo).toBe('Mía')
    })
  })

  describe('PATCH /api/notificaciones/:id/leer', () => {
    it('401: sin token', async () => {
      const res = await request(http).patch('/api/notificaciones/some-id/leer')
      expect(res.status).toBe(401)
    })

    it('204: marca notificación como leída', async () => {
      const notifId = await sembrarNotificacion({ leida: false })

      const res = await request(http)
        .patch(`/api/notificaciones/${notifId}/leer`)
        .set('Authorization', token('uid-notif'))

      expect(res.status).toBe(204)

      // Verificar que se marcó
      const doc = await dbE2E().collection('notificaciones').doc(notifId).get()
      expect(doc.data().leida).toBe(true)
    })
  })

  describe('PATCH /api/notificaciones/leer-todas', () => {
    it('401: sin token', async () => {
      const res = await request(http).patch('/api/notificaciones/leer-todas')
      expect(res.status).toBe(401)
    })

    it('204: marca todas como leídas', async () => {
      const id1 = await sembrarNotificacion({ leida: false })
      const id2 = await sembrarNotificacion({ leida: false })

      const res = await request(http)
        .patch('/api/notificaciones/leer-todas')
        .set('Authorization', token('uid-notif'))

      expect(res.status).toBe(204)

      const doc1 = await dbE2E().collection('notificaciones').doc(id1).get()
      const doc2 = await dbE2E().collection('notificaciones').doc(id2).get()
      expect(doc1.data().leida).toBe(true)
      expect(doc2.data().leida).toBe(true)
    })

    it('204: es idempotente (ya marcadas)', async () => {
      const id1 = await sembrarNotificacion({ leida: true })

      const res = await request(http)
        .patch('/api/notificaciones/leer-todas')
        .set('Authorization', token('uid-notif'))

      expect(res.status).toBe(204)

      const doc1 = await dbE2E().collection('notificaciones').doc(id1).get()
      expect(doc1.data().leida).toBe(true)
    })
  })
})
