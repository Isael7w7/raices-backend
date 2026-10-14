import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, sembrarInstitucion, leerDoc, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

const instVisible = {
  id: 'inst-visible',
  nombre: 'Centro Visible',
  categoria: 'funcional',
  ciudad: 'Mérida',
  activa: true,
  verificada: true,
  creadoPor: 'uid-owner',
  calificacionPromedio: 4.5,
  cantidadCalificaciones: 3,
  fechaCreacion: '2026-01-05T00:00:00.000Z',
}

const instPendiente = {
  id: 'inst-pendiente',
  nombre: 'Centro Pendiente',
  categoria: 'educativo',
  ciudad: 'Mérida',
  activa: true,
  verificada: false,
  creadoPor: 'uid-owner',
  calificacionPromedio: 0,
  cantidadCalificaciones: 0,
  fechaCreacion: '2026-01-02T00:00:00.000Z',
}

const instInactiva = {
  id: 'inst-inactiva',
  nombre: 'Centro Inactivo',
  categoria: 'laboral',
  ciudad: 'Valladolid',
  activa: false,
  verificada: true,
  creadoPor: 'uid-owner',
  calificacionPromedio: 0,
  cantidadCalificaciones: 0,
  fechaCreacion: '2026-01-03T00:00:00.000Z',
}

async function sembrarUsuarios() {
  await sembrarPerfil({ id: 'uid-owner', email: 'owner@test.com', rol: 'institucion', activo: true, verificado: true })
  await sembrarPerfil({ id: 'uid-admin', email: 'admin@test.com', rol: 'admin', activo: true })
  await sembrarPerfil({ id: 'uid-pcd', email: 'pcd@test.com', rol: 'pcd', activo: true })
  await sembrarPerfil({ id: 'uid-tutor', email: 'tutor@test.com', rol: 'padre_tutor', activo: true })
}

describe('Instituciones (E2E)', () => {
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
    await sembrarUsuarios()
    await sembrarInstitucion(instVisible)
    await sembrarInstitucion(instPendiente)
    await sembrarInstitucion(instInactiva)
  })

  describe('GET /api/instituciones (listado público)', () => {
    it('200: formato paginado { datos, paginacion } y solo activas+verificadas', async () => {
      const res = await request(http).get('/api/instituciones')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.datos)).toBe(true)
      expect(res.body.paginacion).toEqual({
        total: 1,
        pagina: 1,
        limite: 10,
        totalPaginas: 1,
      })
      expect(res.body.datos.map((i: any) => i.id)).toEqual(['inst-visible'])
    })

    it('200: filtro por categoria', async () => {
      const res = await request(http).get('/api/instituciones?categoria=educativo')
      expect(res.status).toBe(200)
      expect(res.body.datos).toEqual([]) // la única educativa está pendiente (no pública)
    })
  })

  describe('GET /api/instituciones/:id (detalle público)', () => {
    it('200: institución activa y verificada', async () => {
      const res = await request(http).get('/api/instituciones/inst-visible')
      expect(res.status).toBe(200)
      expect(res.body.id).toBe('inst-visible')
    })

    it('200: pobla `servicios` solo con los que están en estado Activo (parseados)', async () => {
      await sembrarInstitucion({
        ...instVisible,
        id: 'inst-servicios',
        servicios: [
          JSON.stringify({ id: 's-1', nombre: 'Terapia ABA', costo: 'Gratuito', horario: 'Lun-Vie 9:00-14:00', accesibilidad: ['Rampa de acceso'], activo: true }),
          JSON.stringify({ id: 's-2', nombre: 'Taller de arte', activo: false }),
          JSON.stringify({ id: 's-3', nombre: 'Clases de natación', estado: 'Inactivo' }),
          'Fisioterapia', // etiqueta legada sin JSON → servicio publicado
        ],
      })

      const res = await request(http).get('/api/instituciones/inst-servicios')

      expect(res.status).toBe(200)
      expect(res.body.servicios.map((s: any) => s.nombre)).toEqual(['Terapia ABA', 'Fisioterapia'])
      expect(res.body.servicios[0]).toEqual(expect.objectContaining({
        id: 's-1',
        costo: 'Gratuito',
        horario: 'Lun-Vie 9:00-14:00',
        accesibilidad: ['Rampa de acceso'],
        estado: 'Activo',
      }))
      // El listado NO los filtra (solo el detalle público limita a activos)
      const listado = await request(http).get('/api/instituciones')
      const enListado = listado.body.datos.find((i: any) => i.id === 'inst-servicios')
      expect(enListado.servicios).toHaveLength(4)
    })

    it('404: institución pendiente (no revela su existencia)', async () => {
      const res = await request(http).get('/api/instituciones/inst-pendiente')
      expect(res.status).toBe(404)
    })

    it('404: institución inactiva', async () => {
      const res = await request(http).get('/api/instituciones/inst-inactiva')
      expect(res.status).toBe(404)
    })

    it('404: institución inexistente', async () => {
      const res = await request(http).get('/api/instituciones/inst-no-existe')
      expect(res.status).toBe(404)
    })
  })

  describe('Inscripciones a servicios (flujo con aprobación)', () => {
    const instServicios = {
      ...instVisible,
      id: 'inst-inscripciones',
      creadoPor: 'uid-duenio-serv',
      servicios: [
        JSON.stringify({ id: 's-1', nombre: 'Terapia ABA', costo: 'Gratuito', activo: true }),
        JSON.stringify({ id: 's-2', nombre: 'Taller suspendido', activo: false }),
      ],
    }

    beforeEach(async () => {
      // Dueño dedicado: una cuenta solo puede tener una institución, así el
      // resumen por `mi-institucion` no se contamina con otros fixtures.
      await sembrarPerfil({ id: 'uid-duenio-serv', email: 'duenio-serv@test.com', rol: 'institucion', activo: true, verificado: true })
      await sembrarInstitucion(instServicios)
    })

    const base = '/api/instituciones/inst-inscripciones/servicios/s-1'

    it('flujo completo: solicitar → listar → aprobar → inscrito → cancelar', async () => {
      // 1) El usuario PCD solicita inscripción (queda pendiente)
      const solicitar = await request(http).post(`${base}/inscripcion`).set('Authorization', token('uid-pcd'))
      expect(solicitar.status).toBe(201)
      expect(solicitar.body).toEqual(expect.objectContaining({
        id: 's-1__uid-pcd', institucionId: 'inst-inscripciones', servicioId: 's-1',
        usuarioId: 'uid-pcd', estado: 'pendiente', servicioNombre: 'Terapia ABA',
      }))

      // 2) El estado propio refleja la solicitud
      const miEstado = await request(http).get(`${base}/inscripcion`).set('Authorization', token('uid-pcd'))
      expect(miEstado.status).toBe(200)
      expect(miEstado.body).toEqual(expect.objectContaining({ estado: 'pendiente', inscrito: false, solicitado: true }))

      // 3) Repetir la solicitud es idempotente (sigue pendiente, no duplica)
      const repetir = await request(http).post(`${base}/inscripcion`).set('Authorization', token('uid-pcd'))
      expect(repetir.status).toBe(201)
      expect(repetir.body.id).toBe('s-1__uid-pcd')

      // 4) Una persona ajena no puede ver la lista de inscritos
      const ajena = await request(http).get(`${base}/inscripciones`).set('Authorization', token('uid-pcd'))
      expect(ajena.status).toBe(403)

      // 5) La institución dueña ve la lista con datos de contacto
      const listado = await request(http).get(`${base}/inscripciones`).set('Authorization', token('uid-duenio-serv'))
      expect(listado.status).toBe(200)
      expect(listado.body.total).toBe(1)
      expect(listado.body.pendientes).toBe(1)
      expect(listado.body.datos[0]).toEqual(expect.objectContaining({
        id: 's-1__uid-pcd',
        usuarioId: 'uid-pcd',
        usuario: expect.objectContaining({ id: 'uid-pcd', email: 'pcd@test.com', nombre: expect.any(String) }),
      }))

      // 6) La institución aprueba la solicitud
      const aprobar = await request(http)
        .post(`${base}/inscripciones/s-1__uid-pcd/aprobar`)
        .set('Authorization', token('uid-duenio-serv'))
      expect(aprobar.status).toBe(200)
      expect(aprobar.body.estado).toBe('activa')

      // 7) Ahora la persona está inscrita
      const estadoFinal = await request(http).get(`${base}/inscripcion`).set('Authorization', token('uid-pcd'))
      expect(estadoFinal.body).toEqual(expect.objectContaining({ estado: 'activa', inscrito: true, solicitado: false }))

      // 8) Resolver dos veces es un error
      const reactivar = await request(http)
        .post(`${base}/inscripciones/s-1__uid-pcd/aprobar`)
        .set('Authorization', token('uid-duenio-serv'))
      expect(reactivar.status).toBe(400)

      // 9) La persona puede cancelar su inscripción
      const cancelar = await request(http).delete(`${base}/inscripcion`).set('Authorization', token('uid-pcd'))
      expect(cancelar.status).toBe(200)
      expect(cancelar.body.estado).toBe('cancelada')

      // 10) El resumen del panel ya no la cuenta como inscrita
      const resumen = await request(http)
        .get('/api/instituciones/mi-institucion/servicios/inscripciones/resumen')
        .set('Authorization', token('uid-duenio-serv'))
      expect(resumen.status).toBe(200)
      expect(resumen.body.datos).toEqual([]) // canceladas fuera del resumen
    })

    it('200: el resumen por servicio refleja pendientes y activas', async () => {
      await request(http).post(`${base}/inscripcion`).set('Authorization', token('uid-pcd'))
      await request(http).post(`${base}/inscripcion`).set('Authorization', token('uid-tutor'))
      await request(http)
        .post(`${base}/inscripciones/s-1__uid-tutor/aprobar`)
        .set('Authorization', token('uid-duenio-serv'))

      const resumen = await request(http)
        .get('/api/instituciones/mi-institucion/servicios/inscripciones/resumen')
        .set('Authorization', token('uid-duenio-serv'))

      expect(resumen.status).toBe(200)
      expect(resumen.body.datos).toEqual([
        expect.objectContaining({ servicioId: 's-1', servicioNombre: 'Terapia ABA', pendientes: 1, activas: 1, total: 2 }),
      ])
    })

    it('200: rechazar una solicitud pendiente', async () => {
      await request(http).post(`${base}/inscripcion`).set('Authorization', token('uid-pcd'))

      const rechazar = await request(http)
        .post(`${base}/inscripciones/s-1__uid-pcd/rechazar`)
        .set('Authorization', token('uid-duenio-serv'))
      expect(rechazar.status).toBe(200)
      expect(rechazar.body.estado).toBe('rechazada')

      const miEstado = await request(http).get(`${base}/inscripcion`).set('Authorization', token('uid-pcd'))
      expect(miEstado.body).toEqual(expect.objectContaining({ estado: 'rechazada', inscrito: false, solicitado: false }))
    })

    it('404: no se puede inscribir a un servicio inactivo ni a uno inexistente', async () => {
      const inactivo = await request(http)
        .post('/api/instituciones/inst-inscripciones/servicios/s-2/inscripcion')
        .set('Authorization', token('uid-pcd'))
      expect(inactivo.status).toBe(404)

      const inexistente = await request(http)
        .post('/api/instituciones/inst-inscripciones/servicios/s-999/inscripcion')
        .set('Authorization', token('uid-pcd'))
      expect(inexistente.status).toBe(404)
    })

    it('401: los endpoints de inscripción exigen sesión', async () => {
      expect((await request(http).post(`${base}/inscripcion`)).status).toBe(401)
      expect((await request(http).get(`${base}/inscripcion`)).status).toBe(401)
      expect((await request(http).get(`${base}/inscripciones`)).status).toBe(401)
      expect((await request(http).delete(`${base}/inscripcion`)).status).toBe(401)
    })

    it('200: mis-inscripciones devuelve los estados por servicio', async () => {
      await request(http).post(`${base}/inscripcion`).set('Authorization', token('uid-pcd'))

      const res = await request(http)
        .get('/api/instituciones/inst-inscripciones/mis-inscripciones')
        .set('Authorization', token('uid-pcd'))

      expect(res.status).toBe(200)
      expect(res.body.datos).toEqual([
        expect.objectContaining({ servicioId: 's-1', estado: 'pendiente' }),
      ])
    })
  })

  describe('GET /api/instituciones/:id/detalle (admin o propietario)', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/instituciones/inst-pendiente/detalle')
      expect(res.status).toBe(401)
    })

    it('403: usuario PCD sin permisos', async () => {
      const res = await request(http)
        .get('/api/instituciones/inst-pendiente/detalle')
        .set('Authorization', token('uid-pcd'))
      expect(res.status).toBe(403)
    })

    it('200: el propietario puede ver su institución pendiente', async () => {
      const res = await request(http)
        .get('/api/instituciones/inst-pendiente/detalle')
        .set('Authorization', token('uid-owner'))
      expect(res.status).toBe(200)
      expect(res.body.id).toBe('inst-pendiente')
    })

    it('200: el admin puede ver cualquier institución', async () => {
      const res = await request(http)
        .get('/api/instituciones/inst-pendiente/detalle')
        .set('Authorization', token('uid-admin'))
      expect(res.status).toBe(200)
    })
  })

  describe('POST /api/instituciones (creación por rol)', () => {
    const dto = {
      nombre: 'Nueva Institución',
      categoria: 'funcional',
      ciudad: 'Mérida',
      tiposDiscapacidad: ['tea'],
    }

    it('401: sin token', async () => {
      const res = await request(http).post('/api/instituciones').send(dto)
      expect(res.status).toBe(401)
    })

    it('403: rol PCD no puede crear', async () => {
      const res = await request(http).post('/api/instituciones').send(dto).set('Authorization', token('uid-pcd'))
      expect(res.status).toBe(403)
    })

    it('403: rol tutor no puede crear', async () => {
      const res = await request(http).post('/api/instituciones').send(dto).set('Authorization', token('uid-tutor'))
      expect(res.status).toBe(403)
    })

    it('400: cuerpo inválido (categoría no permitida)', async () => {
      const res = await request(http)
        .post('/api/instituciones')
        .send({ nombre: 'X', categoria: 'invalida' })
        .set('Authorization', token('uid-owner'))
      expect(res.status).toBe(400)
    })

    it('201: rol institución crea y queda pendiente de verificación', async () => {
      // El owner ya tiene una institución (canónica) → anti-duplicado devuelve 400;
      // se usa un usuario institución sin institución previa.
      await sembrarPerfil({ id: 'uid-inst2', email: 'inst2@test.com', rol: 'institucion', activo: true, verificado: true })

      const res = await request(http).post('/api/instituciones').send(dto).set('Authorization', token('uid-inst2'))

      expect(res.status).toBe(201)
      expect(res.body.verificada).toBe(false)
      expect(res.body.activa).toBe(true)
      expect(res.body.creadoPor).toBe('uid-inst2')
    })

    it('400: el usuario institución ya tiene una institución', async () => {
      const res = await request(http).post('/api/instituciones').send(dto).set('Authorization', token('uid-owner'))
      expect(res.status).toBe(400)
    })
  })

  describe('PUT y DELETE /api/instituciones/:id (propietario o admin)', () => {
    it('403: PCD no puede actualizar una institución ajena', async () => {
      const res = await request(http)
        .put('/api/instituciones/inst-visible')
        .send({ descripcion: 'cambio' })
        .set('Authorization', token('uid-pcd'))
      expect(res.status).toBe(403)
    })

    it('200: el propietario actualiza su institución', async () => {
      const res = await request(http)
        .put('/api/instituciones/inst-visible')
        .send({ descripcion: 'nueva descripción' })
        .set('Authorization', token('uid-owner'))
      expect(res.status).toBe(200)
      expect(res.body.descripcion).toBe('nueva descripción')
    })

    it('204: el propietario elimina (soft-delete) con cuerpo vacío', async () => {
      const res = await request(http).delete('/api/instituciones/inst-visible').set('Authorization', token('uid-owner'))

      expect(res.status).toBe(204)
      expect(res.text).toBe('')

      const inst = await leerDoc('instituciones', 'inst-visible')
      expect(inst.activa).toBe(false)
      expect(inst.fechaEliminacion).toBeDefined()
    })
  })

  describe('GET /api/instituciones/mi-institucion', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/instituciones/mi-institucion')
      expect(res.status).toBe(401)
    })

    it('200: devuelve la institución canónica del usuario', async () => {
      const res = await request(http).get('/api/instituciones/mi-institucion').set('Authorization', token('uid-owner'))
      expect(res.status).toBe(200)
      expect(res.body.id).toBe('inst-visible')
    })

    it('404: usuario sin institución', async () => {
      await sembrarPerfil({ id: 'uid-pcd2', email: 'pcd2@test.com', rol: 'pcd', activo: true })
      const res = await request(http).get('/api/instituciones/mi-institucion').set('Authorization', token('uid-pcd2'))
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/instituciones/mi-institucion (soft-delete)', () => {
    it('401: sin token', async () => {
      const res = await request(http).delete('/api/instituciones/mi-institucion')
      expect(res.status).toBe(401)
    })

    it('403: rol pcd no puede eliminar (RolesGuard)', async () => {
      const res = await request(http)
        .delete('/api/instituciones/mi-institucion')
        .set('Authorization', token('uid-pcd'))
      expect(res.status).toBe(403)
      expect(res.body.message).toBe('Rol insuficiente')

      // La institución no debe haberse tocado
      const inst = await leerDoc('instituciones', 'inst-visible')
      expect(inst.activa).toBe(true)
      expect(inst.fechaEliminacion).toBeUndefined()
    })

    it('403: rol tutor no puede eliminar (RolesGuard)', async () => {
      const res = await request(http)
        .delete('/api/instituciones/mi-institucion')
        .set('Authorization', token('uid-tutor'))
      expect(res.status).toBe(403)

      const inst = await leerDoc('instituciones', 'inst-visible')
      expect(inst.activa).toBe(true)
    })

    it('404: usuario institución sin institución registrada', async () => {
      await sembrarPerfil({ id: 'uid-inst-sin', email: 'instsin@test.com', rol: 'institucion', activo: true })
      const res = await request(http)
        .delete('/api/instituciones/mi-institucion')
        .set('Authorization', token('uid-inst-sin'))
      expect(res.status).toBe(404)
    })

    it('204: el propietario elimina su institución (soft-delete)', async () => {
      const res = await request(http)
        .delete('/api/instituciones/mi-institucion')
        .set('Authorization', token('uid-owner'))

      expect(res.status).toBe(204)
      expect(res.text).toBe('')

      const inst = await leerDoc('instituciones', 'inst-visible')
      expect(inst.activa).toBe(false)
      expect(inst.fechaEliminacion).toBeDefined()
    })

    it('204: un admin puede eliminar la institución que creó', async () => {
      await sembrarInstitucion({ ...instVisible, id: 'inst-de-admin', creadoPor: 'uid-admin' })

      const res = await request(http)
        .delete('/api/instituciones/mi-institucion')
        .set('Authorization', token('uid-admin'))

      expect(res.status).toBe(204)

      const inst = await leerDoc('instituciones', 'inst-de-admin')
      expect(inst.activa).toBe(false)
      expect(inst.fechaEliminacion).toBeDefined()
    })

    it('404: segunda eliminación es idempotente (ya eliminada)', async () => {
      // Propietario con una sola institución para probar el caso exacto
      await sembrarPerfil({ id: 'uid-unica', email: 'unica@test.com', rol: 'institucion', activo: true })
      await sembrarInstitucion({ ...instVisible, id: 'inst-unica', creadoPor: 'uid-unica' })

      await request(http)
        .delete('/api/instituciones/mi-institucion')
        .set('Authorization', token('uid-unica'))
        .expect(204)

      const res = await request(http)
        .delete('/api/instituciones/mi-institucion')
        .set('Authorization', token('uid-unica'))
      expect(res.status).toBe(404)
    })
  })
})
