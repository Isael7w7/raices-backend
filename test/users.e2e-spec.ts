import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, leerDoc, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

describe('Usuarios y vínculo tutor-PCD (E2E)', () => {
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
    await sembrarPerfil({ id: 'uid-tutor', email: 'tutor@test.com', rol: 'tutor', activo: true, nombreCompleto: 'Tutor' })
    await sembrarPerfil({ id: 'uid-otro-tutor', email: 'otro@test.com', rol: 'tutor', activo: true, nombreCompleto: 'Otro' })
    await sembrarPerfil({ id: 'uid-pcd', email: 'pcd@test.com', rol: 'pcd', activo: true, nombreCompleto: 'PCD Libre' })
    await sembrarPerfil({ id: 'uid-pcd-vinculada', email: 'vinculada@test.com', rol: 'pcd', activo: true, tutorId: 'uid-otro-tutor', nombreCompleto: 'PCD Vinculada' })
  })

  describe('GET /api/usuarios/perfil', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/usuarios/perfil')
      expect(res.status).toBe(401)
    })

    it('200: devuelve el perfil completo del usuario autenticado', async () => {
      const res = await request(http).get('/api/usuarios/perfil').set('Authorization', token('uid-pcd'))
      expect(res.status).toBe(200)
      expect(res.body.email).toBe('pcd@test.com')
      expect(res.body.rol).toBe('pcd')
    })
  })

  describe('POST /api/usuarios/vincular-pcd (solo tutor)', () => {
    it('401: sin token', async () => {
      const res = await request(http).post('/api/usuarios/vincular-pcd').send({ email: 'pcd@test.com' })
      expect(res.status).toBe(401)
    })

    it('403: rol PCD no puede vincular', async () => {
      const res = await request(http)
        .post('/api/usuarios/vincular-pcd')
        .send({ email: 'pcd@test.com' })
        .set('Authorization', token('uid-pcd'))
      expect(res.status).toBe(403)
    })

    it('201: el tutor vincula una PCD por email', async () => {
      const res = await request(http)
        .post('/api/usuarios/vincular-pcd')
        .send({ email: 'pcd@test.com' })
        .set('Authorization', token('uid-tutor'))

      expect(res.status).toBe(201)
      expect(res.body.vinculado).toBe(true)
      expect(res.body.pcdUserId).toBe('uid-pcd')
      expect(res.body.tutorId).toBe('uid-tutor')

      // El perfil quedó vinculado y se creó la relación en dependientes
      const perfil = await leerDoc('perfiles', 'uid-pcd')
      expect(perfil.tutorId).toBe('uid-tutor')
      const rel = await leerDoc('dependientes', 'uid-pcd')
      expect(rel.esCuentaVinculada).toBe(true)
    })

    it('404: email sin cuenta PCD', async () => {
      const res = await request(http)
        .post('/api/usuarios/vincular-pcd')
        .send({ email: 'no-existe@test.com' })
        .set('Authorization', token('uid-tutor'))
      expect(res.status).toBe(404)
    })

    it('400: PCD ya vinculada a otro tutor', async () => {
      const res = await request(http)
        .post('/api/usuarios/vincular-pcd')
        .send({ email: 'vinculada@test.com' })
        .set('Authorization', token('uid-tutor'))
      expect(res.status).toBe(400)
    })
  })

  describe('DELETE /api/usuarios/pcd-vinculado/:pcdUserId/desvincular', () => {
    it('403: un tutor que no es dueño no puede desvincular', async () => {
      const res = await request(http)
        .delete('/api/usuarios/pcd-vinculado/uid-pcd-vinculada/desvincular')
        .set('Authorization', token('uid-tutor'))
      expect(res.status).toBe(403)
    })

    it('200: el tutor dueño desvincula de forma atómica', async () => {
      const res = await request(http)
        .delete('/api/usuarios/pcd-vinculado/uid-pcd-vinculada/desvincular')
        .set('Authorization', token('uid-otro-tutor'))

      expect(res.status).toBe(200)
      expect(res.body.desvinculado).toBe(true)

      const perfil = await leerDoc('perfiles', 'uid-pcd-vinculada')
      expect(perfil.tutorId).toBeNull()
    })
  })
})
