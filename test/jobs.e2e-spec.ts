import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, sembrarInstitucion, dbE2E, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

const instEmpleo = {
  id: 'job-inst-1',
  nombre: 'Centro de Empleo',
  categoria: 'laboral',
  ciudad: 'Mérida',
  activa: true,
  verificada: true,
  usuarioId: 'uid-inst-job',
  creadoPor: 'uid-inst-job',
  tiposDiscapacidad: ['motriz', 'visual'],
  calificacionPromedio: 4.0,
  cantidadCalificaciones: 1,
  fechaCreacion: '2026-01-01T00:00:00.000Z',
}

const vacante1 = {
  id: 'vac-1',
  titulo: 'Asistente Administrativo',
  descripcion: 'Puesto de oficina accesible',
  requisitos: 'Secundaria completa',
  modalidad: 'presencial',
  ciudad: 'Mérida',
  institucionId: 'job-inst-1',
  activa: true,
  fechaCreacion: '2026-06-01T00:00:00.000Z',
}

const vacante2 = {
  id: 'vac-2',
  titulo: 'Diseñador Gráfico',
  descripcion: 'Trabajo remoto inclusivo',
  requisitos: 'Experiencia en diseño',
  modalidad: 'remoto',
  ciudad: 'Cancún',
  institucionId: 'job-inst-1',
  activa: true,
  fechaCreacion: '2026-06-02T00:00:00.000Z',
}

describe('Empleo (E2E)', () => {
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
    await sembrarPerfil({ id: 'uid-inst-job', email: 'inst-job@test.com', rol: 'institucion', activo: true, verificado: true })
    await sembrarPerfil({ id: 'uid-pcd-job', email: 'pcd-job@test.com', rol: 'pcd', activo: true })
    await sembrarInstitucion(instEmpleo)
    await dbE2E().collection('vacantes').doc(vacante1.id).set(vacante1)
    await dbE2E().collection('vacantes').doc(vacante2.id).set(vacante2)
  })

  describe('GET /api/empleo', () => {
    it('200: retorna vacantes activas', async () => {
      const res = await request(http).get('/api/empleo')

      expect(res.status).toBe(200)
      expect(res.body.datos.length).toBe(2)
      expect(res.body.total).toBe(2)
    })

    it('200: filtra por ciudad', async () => {
      const res = await request(http).get('/api/empleo?ciudad=Cancún')

      expect(res.status).toBe(200)
      expect(res.body.datos.length).toBe(1)
      expect(res.body.datos[0].id).toBe('vac-2')
    })

    it('200: filtra por modalidad', async () => {
      const res = await request(http).get('/api/empleo?modalidad=remoto')

      expect(res.status).toBe(200)
      expect(res.body.datos.length).toBe(1)
      expect(res.body.datos[0].id).toBe('vac-2')
    })

    it('200: paginación funciona', async () => {
      const res = await request(http).get('/api/empleo?pagina=1&limite=1')

      expect(res.status).toBe(200)
      expect(res.body.datos.length).toBe(1)
      expect(res.body.totalPaginas).toBe(2)
    })
  })

  describe('GET /api/empleo/:id', () => {
    it('200: retorna detalle de vacante', async () => {
      const res = await request(http).get('/api/empleo/vac-1')

      expect(res.status).toBe(200)
      expect(res.body.id).toBe('vac-1')
      expect(res.body.titulo).toBe('Asistente Administrativo')
    })

    it('404: vacante inexistente', async () => {
      const res = await request(http).get('/api/empleo/vac-fantasma')
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/empleo', () => {
    it('401: sin token', async () => {
      const res = await request(http)
        .post('/api/empleo')
        .send({ titulo: 'Nuevo puesto', descripcion: 'Desc' })
      expect(res.status).toBe(401)
    })

    it('403: rol PCD no puede crear vacantes', async () => {
      const res = await request(http)
        .post('/api/empleo')
        .send({ titulo: 'Nuevo puesto', descripcion: 'Desc' })
        .set('Authorization', token('uid-pcd-job'))
      expect(res.status).toBe(403)
    })

    it('201: rol institución crea vacante', async () => {
      const res = await request(http)
        .post('/api/empleo')
        .send({
          titulo: 'Desarrollador Web',
          descripcion: 'Puesto accesible',
          requisitos: 'HTML, CSS, JS',
          modalidad: 'remoto',
          ciudad: 'Mérida',
        })
        .set('Authorization', token('uid-inst-job'))

      expect(res.status).toBe(201)
      expect(res.body.titulo).toBe('Desarrollador Web')
      expect(res.body.activa).toBe(true)
    })
  })

  describe('POST /api/empleo/:id/postularse', () => {
    it('401: sin token', async () => {
      const res = await request(http)
        .post('/api/empleo/vac-1/postularse')
        .send({ cartaPresentacion: 'Quiero el puesto' })
      expect(res.status).toBe(401)
    })

    it('201: usuario se postula a vacante', async () => {
      const res = await request(http)
        .post('/api/empleo/vac-1/postularse')
        .send({ cartaPresentacion: 'Soy el candidato ideal' })
        .set('Authorization', token('uid-pcd-job'))

      expect(res.status).toBe(201)
      expect(res.body.id).toBeDefined()
      expect(res.body.estado).toBe('pendiente')
    })

    it('409: no puede postularse dos veces', async () => {
      await request(http)
        .post('/api/empleo/vac-1/postularse')
        .send({ cartaPresentacion: 'Primera vez' })
        .set('Authorization', token('uid-pcd-job'))

      const res = await request(http)
        .post('/api/empleo/vac-1/postularse')
        .send({ cartaPresentacion: 'Segunda vez' })
        .set('Authorization', token('uid-pcd-job'))

      expect(res.status).toBe(409)
    })
  })

  describe('GET /api/empleo/postuladas', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/empleo/postuladas')
      expect(res.status).toBe(401)
    })

    it('200: retorna IDs de vacantes postuladas', async () => {
      await request(http)
        .post('/api/empleo/vac-1/postularse')
        .send({ cartaPresentacion: 'Quiero esto' })
        .set('Authorization', token('uid-pcd-job'))

      const res = await request(http)
        .get('/api/empleo/postuladas')
        .set('Authorization', token('uid-pcd-job'))

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body).toContain('vac-1')
    })
  })

  describe('GET /api/empleo/mis-postulaciones', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/empleo/mis-postulaciones')
      expect(res.status).toBe(401)
    })

    it('200: retorna postulaciones del usuario', async () => {
      await request(http)
        .post('/api/empleo/vac-1/postularse')
        .send({ cartaPresentacion: 'Mi postulación' })
        .set('Authorization', token('uid-pcd-job'))

      const res = await request(http)
        .get('/api/empleo/mis-postulaciones')
        .set('Authorization', token('uid-pcd-job'))

      expect(res.status).toBe(200)
      expect(res.body.datos.length).toBe(1)
    })
  })
})
