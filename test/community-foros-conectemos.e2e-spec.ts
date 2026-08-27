import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, sembrarInstitucion, leerDoc, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

describe('Comunidad: Foros, Conectemos y Roles (E2E)', () => {
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
    await sembrarPerfil({ id: 'uid-inst', email: 'inst@test.com', rol: 'institucion', activo: true, nombreCompleto: 'Centro Raíces', institucionId: 'uid-inst' })
    await sembrarPerfil({ id: 'uid-admin', email: 'admin@test.com', rol: 'admin', activo: true, nombreCompleto: 'Admin' })
    await sembrarPerfil({ id: 'uid-pcd', email: 'pcd@test.com', rol: 'pcd', activo: true, nombreCompleto: 'Ana PCD' })
    await sembrarPerfil({ id: 'uid-tutor', email: 'tutor@test.com', rol: 'padre_tutor', activo: true, nombreCompleto: 'Carlos Tutor' })
    await sembrarInstitucion({ id: 'uid-inst', nombre: 'Centro Raíces', categoria: 'funcional', activa: true, verificada: true, creadoPor: 'uid-inst' })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Foros Institucionales
  // ═══════════════════════════════════════════════════════════════════

  describe('POST /api/comunidad/foros', () => {
    it('201: institución crea foro con preguntas detonantes', async () => {
      const res = await request(http)
        .post('/api/comunidad/foros')
        .send({
          titulo: 'Inclusión laboral',
          descripcion: 'Discutamos estrategias',
          preguntasDetonantes: ['¿Qué funciona?', '¿Qué barreras hay?'],
        })
        .set('Authorization', token('uid-inst'))

      expect(res.status).toBe(201)
      expect(res.body.titulo).toBe('Inclusión laboral')
      expect(res.body.preguntasDetonantes).toHaveLength(2)
      expect(res.body.activo).toBe(true)
      expect(res.body.institucionId).toBe('uid-inst')
    })

    it('403: usuario pcd no puede crear foro', async () => {
      const res = await request(http)
        .post('/api/comunidad/foros')
        .send({ titulo: 'Test', preguntasDetonantes: ['P1'] })
        .set('Authorization', token('uid-pcd'))

      expect(res.status).toBe(403)
    })

    it('401: sin token', async () => {
      const res = await request(http)
        .post('/api/comunidad/foros')
        .send({ titulo: 'Test', preguntasDetonantes: ['P1'] })

      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/comunidad/foros', () => {
    it('200: lista foros activos', async () => {
      // Crear foro primero
      await request(http)
        .post('/api/comunidad/foros')
        .send({ titulo: 'Foro Test', preguntasDetonantes: ['P1'] })
        .set('Authorization', token('uid-inst'))

      const res = await request(http).get('/api/comunidad/foros')

      expect(res.status).toBe(200)
      expect(res.body.datos.length).toBeGreaterThanOrEqual(1)
      expect(res.body.datos[0].titulo).toBe('Foro Test')
      expect(res.body.datos[0].nombreInstitucion).toBe('Centro Raíces')
    })
  })

  describe('GET /api/comunidad/foros/:id', () => {
    it('200: obtiene detalle de foro con preguntas agrupadas', async () => {
      const crearRes = await request(http)
        .post('/api/comunidad/foros')
        .send({ titulo: 'Detalle Test', preguntasDetonantes: ['Pregunta 1', 'Pregunta 2'] })
        .set('Authorization', token('uid-inst'))

      const foroId = crearRes.body.id

      const res = await request(http).get(`/api/comunidad/foros/${foroId}`)

      expect(res.status).toBe(200)
      expect(res.body.titulo).toBe('Detalle Test')
      expect(res.body.preguntasConRespuestas).toHaveLength(2)
      expect(res.body.preguntasConRespuestas[0].pregunta).toBe('Pregunta 1')
      expect(res.body.preguntasConRespuestas[0].respuestas).toEqual([])
    })

    it('404: foro inexistente', async () => {
      const res = await request(http).get('/api/comunidad/foros/nonexistent')
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/comunidad/foros/:id/respuestas', () => {
    it('201: usuario autenticado responde pregunta detonante', async () => {
      const crearRes = await request(http)
        .post('/api/comunidad/foros')
        .send({ titulo: 'Foro Respuestas', preguntasDetonantes: ['¿Qué recomiendan?'] })
        .set('Authorization', token('uid-inst'))

      const foroId = crearRes.body.id

      const res = await request(http)
        .post(`/api/comunidad/foros/${foroId}/respuestas`)
        .send({ preguntaIndex: 0, contenido: 'Mi recomendación es capacitación inclusiva.' })
        .set('Authorization', token('uid-pcd'))

      expect(res.status).toBe(201)
      expect(res.body.contenido).toBe('Mi recomendación es capacitación inclusiva.')
      expect(res.body.rol).toBe('pcd')
      expect(res.body.etiquetaRol).toBe('Persona con discapacidad')
    })

    it('403: pcd no puede responder foro exclusivo para padres', async () => {
      const crearRes = await request(http)
        .post('/api/comunidad/foros')
        .send({ titulo: 'Foro Exclusivo', preguntasDetonantes: ['P1'], exclusivoPadres: true })
        .set('Authorization', token('uid-inst'))

      const foroId = crearRes.body.id

      const res = await request(http)
        .post(`/api/comunidad/foros/${foroId}/respuestas`)
        .send({ preguntaIndex: 0, contenido: 'No debería poder responder.' })
        .set('Authorization', token('uid-pcd'))

      expect(res.status).toBe(403)
    })

    it('201: padre_tutor puede responder foro exclusivo para padres', async () => {
      const crearRes = await request(http)
        .post('/api/comunidad/foros')
        .send({ titulo: 'Foro Exclusivo', preguntasDetonantes: ['P1'], exclusivoPadres: true })
        .set('Authorization', token('uid-inst'))

      const foroId = crearRes.body.id

      const res = await request(http)
        .post(`/api/comunidad/foros/${foroId}/respuestas`)
        .send({ preguntaIndex: 0, contenido: 'Como padre, mi experiencia es...' })
        .set('Authorization', token('uid-tutor'))

      expect(res.status).toBe(201)
      expect(res.body.rol).toBe('padre_tutor')
      expect(res.body.etiquetaRol).toBe('Padre / Tutor')
    })

    it('400: índice de pregunta inválido', async () => {
      const crearRes = await request(http)
        .post('/api/comunidad/foros')
        .send({ titulo: 'Foro', preguntasDetonantes: ['Solo 1'] })
        .set('Authorization', token('uid-inst'))

      const foroId = crearRes.body.id

      const res = await request(http)
        .post(`/api/comunidad/foros/${foroId}/respuestas`)
        .send({ preguntaIndex: 5, contenido: 'X' })
        .set('Authorization', token('uid-pcd'))

      expect(res.status).toBe(400)
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Espacio "Conectemos"
  // ═══════════════════════════════════════════════════════════════════

  describe('GET /api/comunidad/conectemos/publicaciones', () => {
    it('200: retorna galería vacía cuando no hay contenido creativo', async () => {
      const res = await request(http).get('/api/comunidad/conectemos/publicaciones')

      expect(res.status).toBe(200)
      expect(res.body.datos).toEqual([])
    })

    it('200: retorna publicaciones con categoriaCreativa', async () => {
      // Crear publicación creativa
      await request(http)
        .post('/api/comunidad/publicaciones')
        .send({ contenido: 'Mi dibujo favorito', categoriaCreativa: 'dibujo' })
        .set('Authorization', token('uid-pcd'))

      const res = await request(http).get('/api/comunidad/conectemos/publicaciones')

      expect(res.status).toBe(200)
      expect(res.body.datos.length).toBe(1)
      expect(res.body.datos[0].categoriaCreativa).toBe('dibujo')
      expect(res.body.datos[0].nombreCompleto).toBe('Ana PCD')
      expect(res.body.datos[0].rol).toBe('pcd')
      expect(res.body.datos[0].etiquetaRol).toBe('Persona con discapacidad')
    })

    it('200: filtra por categoría creativa', async () => {
      await request(http)
        .post('/api/comunidad/publicaciones')
        .send({ contenido: 'Arte', categoriaCreativa: 'arte' })
        .set('Authorization', token('uid-pcd'))

      await request(http)
        .post('/api/comunidad/publicaciones')
        .send({ contenido: 'Historia', categoriaCreativa: 'historia' })
        .set('Authorization', token('uid-pcd'))

      const res = await request(http).get('/api/comunidad/conectemos/publicaciones?categoriaCreativa=arte')

      expect(res.status).toBe(200)
      expect(res.body.datos.length).toBe(1)
      expect(res.body.datos[0].categoriaCreativa).toBe('arte')
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Identificación visual de rol en publicaciones
  // ═══════════════════════════════════════════════════════════════════

  describe('Identificación de rol en publicaciones', () => {
    it('200: publicación incluye rol y etiquetaRol del autor', async () => {
      await request(http)
        .post('/api/comunidad/publicaciones')
        .send({ contenido: 'Publicación de PCD' })
        .set('Authorization', token('uid-pcd'))

      const res = await request(http)
        .get('/api/comunidad/publicaciones')
        .set('Authorization', token('uid-pcd'))

      expect(res.status).toBe(200)
      expect(res.body.datos.length).toBe(1)
      expect(res.body.datos[0].rol).toBe('pcd')
      expect(res.body.datos[0].etiquetaRol).toBe('Persona con discapacidad')
    })

    it('200: comentario incluye rol y etiquetaRol del autor', async () => {
      // Crear publicación
      const pubRes = await request(http)
        .post('/api/comunidad/publicaciones')
        .send({ contenido: 'Post' })
        .set('Authorization', token('uid-pcd'))

      const pubId = pubRes.body.id

      // Crear comentario como tutor
      await request(http)
        .post(`/api/comunidad/publicaciones/${pubId}/comentarios`)
        .send({ contenido: 'Comentario de tutor' })
        .set('Authorization', token('uid-tutor'))

      const res = await request(http).get(`/api/comunidad/publicaciones/${pubId}/comentarios`)

      expect(res.status).toBe(200)
      expect(res.body.datos.length).toBe(1)
      expect(res.body.datos[0].rol).toBe('padre_tutor')
      expect(res.body.datos[0].etiquetaRol).toBe('Padre / Tutor')
    })
  })
})
