import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

describe('Autenticación (E2E)', () => {
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

  describe('POST /api/autenticacion/registro', () => {
    const registroValido = {
      email: 'ana@test.com',
      password: 'secreta123',
      nombreCompleto: 'Ana PCD',
      rol: 'pcd',
    }

    it('201: crea la cuenta y NO devuelve tokens (requiereInicioSesion: true)', async () => {
      const res = await request(http).post('/api/autenticacion/registro').send(registroValido)

      expect(res.status).toBe(201)
      expect(res.body.usuario.rol).toBe('pcd')
      expect(res.body.usuario.email).toBe('ana@test.com')
      expect(res.body.requiereInicioSesion).toBe(true)
      expect(res.body.tokenAcceso).toBeUndefined()
      expect(res.body.tokenRefresco).toBeUndefined()

      // El perfil quedó creado con id = uid (permite el login posterior)
      const perfil = await (globalThis as any).__E2E__.db.collection('perfiles').doc('uid-ana@test.com').get()
      expect(perfil.exists).toBe(true)
    })

    it('201: rol institución crea también el documento en "instituciones"', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({ email: 'inst@test.com', password: 'secreta123', nombreCompleto: 'Centro Raíces', rol: 'institucion', categoria: 'funcional' })

      expect(res.status).toBe(201)
      const inst = await (globalThis as any).__E2E__.db.collection('instituciones').doc('uid-inst@test.com').get()
      expect(inst.exists).toBe(true)
      expect(inst.data().verificada).toBe(false)
    })

    it('400: cuerpo inválido rechazado por ValidationPipe (email/rol/password)', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({ email: 'no-es-email', password: '123', rol: 'rol-invalido' })

      expect(res.status).toBe(400)
    })

    it('400: institución sin categoría', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({ email: 'inst2@test.com', password: 'secreta123', nombreCompleto: 'Centro X', rol: 'institucion' })

      expect(res.status).toBe(400)
    })

    it('400: PCD con tutorId inexistente', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({ ...registroValido, email: 'otra@test.com', tutorId: 'tutor-no-existe' })

      expect(res.status).toBe(400)
    })

    it('409: email ya registrado', async () => {
      await sembrarPerfil({ id: 'uid-existente', email: 'ya@test.com', rol: 'pcd', activo: true })

      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({ ...registroValido, email: 'ya@test.com' })

      expect(res.status).toBe(409)
    })
  })

  describe('POST /api/autenticacion/inicio-sesion', () => {
    it('200: devuelve tokenAcceso, tokenRefresco y usuario', async () => {
      await sembrarPerfil({ id: 'uid-demo@test.com', email: 'demo@test.com', rol: 'pcd', activo: true, nombreCompleto: 'Demo' })

      const res = await request(http)
        .post('/api/autenticacion/inicio-sesion')
        .send({ email: 'demo@test.com', password: 'secreta123' })

      expect(res.status).toBe(200)
      expect(res.body.tokenAcceso).toBeDefined()
      expect(res.body.tokenRefresco).toBeDefined()
      expect(res.body.expiraEn).toBe(3600)
      expect(res.body.usuario.email).toBe('demo@test.com')
    })

    it('401: credenciales incorrectas', async () => {
      const res = await request(http)
        .post('/api/autenticacion/inicio-sesion')
        .send({ email: 'incorrecto@test.com', password: 'secreta123' })

      expect(res.status).toBe(401)
    })

    it('400: cuerpo inválido', async () => {
      const res = await request(http).post('/api/autenticacion/inicio-sesion').send({ email: 'no-email' })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/autenticacion/renovar-token', () => {
    it('200: renueva el par de tokens', async () => {
      await sembrarPerfil({ id: 'uid-demo@test.com', email: 'demo@test.com', rol: 'pcd', activo: true })

      const res = await request(http)
        .post('/api/autenticacion/renovar-token')
        .send({ tokenRefresco: 'refresh-cualquiera' })

      expect(res.status).toBe(200)
      expect(res.body.tokenAcceso).toBe('nuevo-id-token')
      expect(res.body.tokenRefresco).toBe('nuevo-refresh')
    })
  })

  describe('GET /api/autenticacion/yo', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/autenticacion/yo')
      expect(res.status).toBe(401)
    })

    it('401: token inválido (usuario inexistente)', async () => {
      const res = await request(http).get('/api/autenticacion/yo').set('Authorization', token('uid-inexistente'))
      expect(res.status).toBe(401)
    })

    it('200: devuelve el perfil del usuario autenticado', async () => {
      await sembrarPerfil({ id: 'uid-ana', email: 'ana@test.com', rol: 'pcd', activo: true, nombreCompleto: 'Ana PCD' })

      const res = await request(http).get('/api/autenticacion/yo').set('Authorization', token('uid-ana'))

      expect(res.status).toBe(200)
      expect(res.body.id).toBe('uid-ana')
      expect(res.body.email).toBe('ana@test.com')
    })

    it('401: cuenta desactivada', async () => {
      await sembrarPerfil({ id: 'uid-desactivado', email: 'x@test.com', rol: 'pcd', activo: false })

      const res = await request(http).get('/api/autenticacion/yo').set('Authorization', token('uid-desactivado'))
      expect(res.status).toBe(401)
    })
  })
})
