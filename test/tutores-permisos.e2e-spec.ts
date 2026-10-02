/// <reference types="jest" />
import { crearAppE2E } from './helpers/app.e2e'
import { dbE2E, leerDoc, limpiarDb, sembrarPerfil, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

/**
 * E2E de los permisos del tutor sobre un dependiente: los módulos del modal
 * "Configurar opciones" y las acciones del modal "Permisos de acceso" deben
 * persistirse (200 OK) en Firestore junto con las features funcionales.
 */
describe('Tutores: permisos de dependiente (E2E)', () => {
  let app: INestApplication
  let http: any

  const featuresPorDefecto = { chat: true, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true }

  async function sembrarDependiente(id: string, extra: Record<string, any> = {}) {
    await dbE2E().collection('dependientes').doc(id).set({
      id, tutorId: 'uid-tutor', nombreCompleto: 'María García', parentesco: 'hija',
      rol: 'discapacitado', features: { ...featuresPorDefecto },
      fechaCreacion: '2026-01-01T00:00:00.000Z', ...extra,
    })
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
    await sembrarPerfil({ id: 'uid-tutor', email: 'tutor@test.com', rol: 'padre_tutor', activo: true, nombreCompleto: 'Carlos Tutor' })
    await sembrarDependiente('dep-1')
  })

  // ═══════════════════════════════════════════════════════════════════
  // Lectura
  // ═══════════════════════════════════════════════════════════════════

  describe('GET /api/usuarios/dependientes/:id/permisos', () => {
    it('200: retorna features y permisos con los defaults y el espejo de features', async () => {
      const res = await request(http)
        .get('/api/usuarios/dependientes/dep-1/permisos')
        .set('Authorization', token('uid-tutor'))

      expect(res.status).toBe(200)
      expect(res.body.dependienteId).toBe('dep-1')
      expect(res.body.features).toEqual(featuresPorDefecto)
      expect(res.body.permisos).toEqual({
        instituciones: true, empleo: true, comunidad: true,
        puedeComentar: true, puedeInteractuar: true, accesoMultimedia: true, accesoChat: true,
      })
    })

    it('404: cuando el dependiente pertenece a otro tutor', async () => {
      await sembrarDependiente('dep-ajeno', { tutorId: 'otro-tutor' })

      const res = await request(http)
        .get('/api/usuarios/dependientes/dep-ajeno/permisos')
        .set('Authorization', token('uid-tutor'))

      expect(res.status).toBe(404)
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Escritura: PUT / PATCH /api/usuarios
  // ═══════════════════════════════════════════════════════════════════

  describe('PUT /api/usuarios/dependientes/:id/permisos', () => {
    const payload = {
      instituciones: false, empleo: false, comunidad: true,
      puedeComentar: false, puedeInteractuar: true, accesoMultimedia: true, accesoChat: false,
    }

    it('200: persiste módulos, acciones y features en Firestore', async () => {
      const res = await request(http)
        .put('/api/usuarios/dependientes/dep-1/permisos')
        .send(payload)
        .set('Authorization', token('uid-tutor'))

      expect(res.status).toBe(200)
      expect(res.body.dependienteId).toBe('dep-1')
      expect(res.body.permisos).toEqual(payload)
      expect(res.body.features.descubrimiento).toBe(false)
      expect(res.body.features.postulaciones).toBe(false)
      expect(res.body.features.chat).toBe(false)

      const guardado = await leerDoc('dependientes', 'dep-1')
      expect(guardado.permisos).toEqual(payload)
      expect(guardado.features.chat).toBe(false)
      expect(guardado.features.descubrimiento).toBe(false)
      expect(guardado.features.postulaciones).toBe(false)
      expect(guardado.features.comunidad).toBe(true)
    })

    it('200 (parcial): solo modifica los campos enviados y conserva el resto', async () => {
      await request(http)
        .put('/api/usuarios/dependientes/dep-1/permisos')
        .send({ accesoChat: false, puedeComentar: false })
        .set('Authorization', token('uid-tutor'))

      const guardado = await leerDoc('dependientes', 'dep-1')
      expect(guardado.permisos.accesoChat).toBe(false)
      expect(guardado.permisos.puedeComentar).toBe(false)
      expect(guardado.permisos.instituciones).toBe(true)
      expect(guardado.permisos.puedeInteractuar).toBe(true)
      expect(guardado.features.chat).toBe(false)
      expect(guardado.features.comunidad).toBe(true)
    })

    it('200: acepta nombres clásicos de features por compatibilidad', async () => {
      const res = await request(http)
        .put('/api/usuarios/dependientes/dep-1/permisos')
        .send({ chat: false, postulaciones: false })
        .set('Authorization', token('uid-tutor'))

      expect(res.status).toBe(200)
      expect(res.body.features.chat).toBe(false)
      expect(res.body.features.postulaciones).toBe(false)
      expect(res.body.permisos.accesoChat).toBe(false)
      expect(res.body.permisos.empleo).toBe(false)

      const guardado = await leerDoc('dependientes', 'dep-1')
      expect(guardado.features.chat).toBe(false)
      expect(guardado.permisos.accesoChat).toBe(false)
    })

    it('400: cuando el body no trae permisos', async () => {
      const res = await request(http)
        .put('/api/usuarios/dependientes/dep-1/permisos')
        .send({})
        .set('Authorization', token('uid-tutor'))

      expect(res.status).toBe(400)
    })

    it('403: cuando el dependiente pertenece a otro tutor (no escribe nada)', async () => {
      await sembrarDependiente('dep-ajeno', { tutorId: 'otro-tutor' })

      const res = await request(http)
        .put('/api/usuarios/dependientes/dep-ajeno/permisos')
        .send({ accesoChat: false })
        .set('Authorization', token('uid-tutor'))

      expect(res.status).toBe(403)
      expect((await leerDoc('dependientes', 'dep-ajeno')).features).toEqual(featuresPorDefecto)
    })

    it('200: un administrador puede actualizar permisos de cualquier dependiente', async () => {
      await sembrarPerfil({ id: 'uid-admin', email: 'admin@test.com', rol: 'admin', activo: true, nombreCompleto: 'Admin' })

      const res = await request(http)
        .put('/api/usuarios/dependientes/dep-1/permisos')
        .send({ accesoChat: false, empleo: false })
        .set('Authorization', token('uid-admin'))

      expect(res.status).toBe(200)
      expect(res.body.permisos.accesoChat).toBe(false)

      const guardado = await leerDoc('dependientes', 'dep-1')
      expect(guardado.permisos.accesoChat).toBe(false)
      expect(guardado.features.chat).toBe(false)
      expect(guardado.features.postulaciones).toBe(false)
    })
  })

  describe('PATCH /api/usuarios/dependientes/:id/permisos', () => {
    it('200: alias del PUT con el mismo resultado persistido', async () => {
      const res = await request(http)
        .patch('/api/usuarios/dependientes/dep-1/permisos')
        .send({ empleo: false, puedeInteractuar: false })
        .set('Authorization', token('uid-tutor'))

      expect(res.status).toBe(200)
      expect(res.body.permisos.empleo).toBe(false)
      expect(res.body.permisos.puedeInteractuar).toBe(false)

      const guardado = await leerDoc('dependientes', 'dep-1')
      expect(guardado.permisos.empleo).toBe(false)
      expect(guardado.features.postulaciones).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Rutas nuevas: /api/tutores
  // ═══════════════════════════════════════════════════════════════════

  describe('Rutas /api/tutores/dependientes/:id/permisos', () => {
    it('GET 200: retorna permisos del dependiente', async () => {
      const res = await request(http)
        .get('/api/tutores/dependientes/dep-1/permisos')
        .set('Authorization', token('uid-tutor'))

      expect(res.status).toBe(200)
      expect(res.body.dependienteId).toBe('dep-1')
      expect(res.body.permisos.accesoChat).toBe(true)
    })

    it('PUT 200: persiste los permisos enviados (respuesta 200 OK)', async () => {
      const payload = { instituciones: false, empleo: false, comunidad: false, puedeComentar: false, puedeInteractuar: false, accesoMultimedia: false, accesoChat: false }

      const res = await request(http)
        .put('/api/tutores/dependientes/dep-1/permisos')
        .send(payload)
        .set('Authorization', token('uid-tutor'))

      expect(res.status).toBe(200)
      expect(res.body.permisos).toEqual(payload)

      const guardado = await leerDoc('dependientes', 'dep-1')
      expect(guardado.permisos).toEqual(payload)
      expect(guardado.features).toEqual({ chat: false, postulaciones: false, comunidad: false, resenas: true, descubrimiento: false, favoritos: true, multimedia: false })
    })

    it('PATCH 200: alias del PUT', async () => {
      const res = await request(http)
        .patch('/api/tutores/dependientes/dep-1/permisos')
        .send({ accesoChat: false })
        .set('Authorization', token('uid-tutor'))

      expect(res.status).toBe(200)
      expect((await leerDoc('dependientes', 'dep-1')).permisos.accesoChat).toBe(false)
    })

    it('401: sin token', async () => {
      const res = await request(http)
        .put('/api/tutores/dependientes/dep-1/permisos')
        .send({ accesoChat: false })

      expect(res.status).toBe(401)
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Cuentas PCD vinculadas
  // ═══════════════════════════════════════════════════════════════════

  describe('Cuenta PCD vinculada', () => {
    beforeEach(async () => {
      await sembrarDependiente('pcd-1', { esCuentaVinculada: true, pcdUserId: 'pcd-1' })
      await sembrarPerfil({ id: 'pcd-1', email: 'pcd@test.com', rol: 'pcd', activo: true, nombreCompleto: 'Ana PCD', tutorId: 'uid-tutor', features: { ...featuresPorDefecto } })
    })

    it('200: escribe en el perfil real de la PCD (fuente de verdad)', async () => {
      const res = await request(http)
        .put('/api/usuarios/dependientes/pcd-1/permisos')
        .send({ accesoChat: false, puedeComentar: false })
        .set('Authorization', token('uid-tutor'))

      expect(res.status).toBe(200)

      const perfil = await leerDoc('perfiles', 'pcd-1')
      expect(perfil.features.chat).toBe(false)
      expect(perfil.permisos.accesoChat).toBe(false)
      expect(perfil.permisos.puedeComentar).toBe(false)

      // GET refleja los permisos reales del perfil
      const getRes = await request(http)
        .get('/api/usuarios/dependientes/pcd-1/permisos')
        .set('Authorization', token('uid-tutor'))
      expect(getRes.status).toBe(200)
      expect(getRes.body.features.chat).toBe(false)
      expect(getRes.body.permisos.accesoChat).toBe(false)
    })

    it('403: cuando la PCD vinculada pertenece a otro tutor', async () => {
      await dbE2E().collection('perfiles').doc('pcd-1').set({ id: 'pcd-1', email: 'pcd@test.com', rol: 'pcd', activo: true, tutorId: 'otro-tutor' })

      const res = await request(http)
        .put('/api/usuarios/dependientes/pcd-1/permisos')
        .send({ accesoChat: false })
        .set('Authorization', token('uid-tutor'))

      expect(res.status).toBe(403)
      expect((await leerDoc('perfiles', 'pcd-1')).features ?? null).toBeNull()
    })
  })
})
