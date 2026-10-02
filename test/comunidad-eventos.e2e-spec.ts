/// <reference types="jest" />
import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

/**
 * E2E de la sección "Eventos" de la comunidad: creación, listado con filtros,
 * detalle y alternancia de asistencia.
 */
describe('Comunidad: Eventos (E2E)', () => {
  let app: INestApplication
  let http: any

  const eventoMarzo = {
    titulo: 'Evento marzo',
    descripcion: 'Taller de arte inclusivo',
    categoria: 'taller',
    fechaInicio: '2099-03-10T10:00:00.000Z',
    fechaFin: '2099-03-10T12:00:00.000Z',
    ubicacion: 'Auditorio municipal',
  }

  const eventoAbril = {
    titulo: 'Evento abril',
    categoria: 'deporte',
    fechaInicio: '2099-04-20T09:00:00.000Z',
  }

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
    await sembrarPerfil({ id: 'uid-pcd', email: 'pcd@test.com', rol: 'pcd', activo: true, nombreCompleto: 'Ana PCD' })
    await sembrarPerfil({ id: 'uid-tutor', email: 'tutor@test.com', rol: 'padre_tutor', activo: true, nombreCompleto: 'Carlos Tutor' })
    await sembrarPerfil({
      id: 'uid-sin-comunidad', email: 'sincom@test.com', rol: 'pcd', activo: true,
      nombreCompleto: 'Sin Comunidad', features: { comunidad: false },
    })
  })

  async function crear(payload: any, uid = 'uid-pcd') {
    return request(http)
      .post('/api/comunidad/eventos')
      .send(payload)
      .set('Authorization', token(uid))
  }

  // ═══════════════════════════════════════════════════════════════════
  // Creación
  // ═══════════════════════════════════════════════════════════════════

  describe('POST /api/comunidad/eventos', () => {
    it('201: crea un evento con contadores en cero y organizador', async () => {
      const res = await crear(eventoMarzo)

      expect(res.status).toBe(201)
      expect(res.body.id).toBeTruthy()
      expect(res.body.titulo).toBe('Evento marzo')
      expect(res.body.categoria).toBe('taller')
      expect(res.body.cantidadAsistentes).toBe(0)
      expect(res.body.activo).toBe(true)
      expect(res.body.asisto).toBe(false)
      expect(res.body.nombreCreador).toBe('Ana PCD')
    })

    it('400: rechaza fechaFin anterior a fechaInicio', async () => {
      const res = await crear({
        ...eventoMarzo,
        fechaInicio: '2099-03-10T12:00:00.000Z',
        fechaFin: '2099-03-10T10:00:00.000Z',
      })

      expect(res.status).toBe(400)
    })

    it('400: rechaza categoría fuera del catálogo', async () => {
      const res = await crear({ ...eventoMarzo, categoria: 'inexistente' })

      expect(res.status).toBe(400)
    })

    it('401: sin token', async () => {
      const res = await request(http).post('/api/comunidad/eventos').send(eventoMarzo)

      expect(res.status).toBe(401)
    })

    it('403: comunidad desactivada en el perfil', async () => {
      const res = await crear(eventoMarzo, 'uid-sin-comunidad')

      expect(res.status).toBe(403)
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Listado con filtros
  // ═══════════════════════════════════════════════════════════════════

  describe('GET /api/comunidad/eventos', () => {
    it('200: lista próximos eventos ordenados por fecha de inicio ascendente', async () => {
      await crear(eventoAbril)
      await crear(eventoMarzo)

      const res = await request(http)
        .get('/api/comunidad/eventos')
        .set('Authorization', token('uid-pcd'))

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(2)
      expect(res.body.datos.map((e: any) => e.titulo)).toEqual(['Evento marzo', 'Evento abril'])
      expect(res.body.datos[0].nombreCreador).toBe('Ana PCD')
      expect(res.body.datos[0].asisto).toBe(false)
    })

    it('200: excluye eventos pasados por defecto y los incluye con fecha exacta', async () => {
      await crear({ ...eventoMarzo, titulo: 'Pasado', fechaInicio: '2000-01-05T10:00:00.000Z', fechaFin: undefined })

      const porDefecto = await request(http)
        .get('/api/comunidad/eventos')
        .set('Authorization', token('uid-pcd'))
      expect(porDefecto.body.total).toBe(0)

      const porFecha = await request(http)
        .get('/api/comunidad/eventos?fecha=2000-01-05')
        .set('Authorization', token('uid-pcd'))
      expect(porFecha.status).toBe(200)
      expect(porFecha.body.total).toBe(1)
      expect(porFecha.body.datos[0].titulo).toBe('Pasado')
    })

    it('200: filtra por categoría', async () => {
      await crear(eventoAbril)
      await crear(eventoMarzo)

      const res = await request(http)
        .get('/api/comunidad/eventos?categoria=taller')
        .set('Authorization', token('uid-pcd'))

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(1)
      expect(res.body.datos[0].categoria).toBe('taller')
    })

    it('200: pagina resultados', async () => {
      await crear(eventoAbril)
      await crear(eventoMarzo)

      const res = await request(http)
        .get('/api/comunidad/eventos?pagina=2&limite=1')
        .set('Authorization', token('uid-pcd'))

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(2)
      expect(res.body.totalPaginas).toBe(2)
      expect(res.body.datos).toHaveLength(1)
      expect(res.body.datos[0].titulo).toBe('Evento abril')
    })

    it('401: sin token', async () => {
      const res = await request(http).get('/api/comunidad/eventos')

      expect(res.status).toBe(401)
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Detalle
  // ═══════════════════════════════════════════════════════════════════

  describe('GET /api/comunidad/eventos/:id', () => {
    it('200: retorna el evento con organizador y asistencia', async () => {
      const creado = await crear(eventoMarzo)

      const res = await request(http)
        .get(`/api/comunidad/eventos/${creado.body.id}`)
        .set('Authorization', token('uid-pcd'))

      expect(res.status).toBe(200)
      expect(res.body.id).toBe(creado.body.id)
      expect(res.body.ubicacion).toBe('Auditorio municipal')
      expect(res.body.nombreCreador).toBe('Ana PCD')
      expect(res.body.asisto).toBe(false)
    })

    it('404: evento inexistente', async () => {
      const res = await request(http)
        .get('/api/comunidad/eventos/no-existe')
        .set('Authorization', token('uid-pcd'))

      expect(res.status).toBe(404)
    })

    it('401: sin token', async () => {
      const res = await request(http).get('/api/comunidad/eventos/no-existe')

      expect(res.status).toBe(401)
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Asistencia
  // ═══════════════════════════════════════════════════════════════════

  describe('POST /api/comunidad/eventos/:id/asistir', () => {
    it('200: confirma y luego cancela la asistencia', async () => {
      const creado = await crear(eventoMarzo)
      const id = creado.body.id

      const confirma = await request(http)
        .post(`/api/comunidad/eventos/${id}/asistir`)
        .set('Authorization', token('uid-pcd'))
      expect(confirma.status).toBe(200)
      expect(confirma.body).toEqual({ asistiendo: true, cantidadAsistentes: 1 })

      const cancela = await request(http)
        .post(`/api/comunidad/eventos/${id}/asistir`)
        .set('Authorization', token('uid-pcd'))
      expect(cancela.status).toBe(200)
      expect(cancela.body).toEqual({ asistiendo: false, cantidadAsistentes: 0 })
    })

    it('200: el detalle refleja asisto=true tras confirmar', async () => {
      const creado = await crear(eventoMarzo)
      const id = creado.body.id

      await request(http)
        .post(`/api/comunidad/eventos/${id}/asistir`)
        .set('Authorization', token('uid-pcd'))

      const detalle = await request(http)
        .get(`/api/comunidad/eventos/${id}`)
        .set('Authorization', token('uid-pcd'))
      expect(detalle.body.asisto).toBe(true)

      const listado = await request(http)
        .get('/api/comunidad/eventos')
        .set('Authorization', token('uid-pcd'))
      expect(listado.body.datos[0].asisto).toBe(true)
      expect(listado.body.datos[0].cantidadAsistentes).toBe(1)
    })

    it('404: evento inexistente', async () => {
      const res = await request(http)
        .post('/api/comunidad/eventos/no-existe/asistir')
        .set('Authorization', token('uid-pcd'))

      expect(res.status).toBe(404)
    })

    it('401: sin token', async () => {
      const res = await request(http).post('/api/comunidad/eventos/no-existe/asistir')

      expect(res.status).toBe(401)
    })
  })
})
