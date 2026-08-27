/// <reference types="jest" />
import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, leerDoc, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

describe('Recomendaciones: Especialistas y Revelación Progresiva (E2E)', () => {
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
  })

  // ═══════════════════════════════════════════════════════════════════
  // Revelación Progresiva
  // ═══════════════════════════════════════════════════════════════════

  describe('GET /api/usuarios/onboarding', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/usuarios/onboarding')
      expect(res.status).toBe(401)
    })

    it('200: usuario con perfil incompleto retorna onboardingCompleto=false', async () => {
      await sembrarPerfil({
        id: 'uid-pcd',
        email: 'pcd@test.com',
        rol: 'pcd',
        activo: true,
        nombreCompleto: 'Ana',
        // Sin fechaNacimiento, curp, etc.
      })

      const res = await request(http)
        .get('/api/usuarios/onboarding')
        .set('Authorization', token('uid-pcd'))

      expect(res.status).toBe(200)
      expect(res.body.onboardingCompleto).toBe(false)
      expect(Array.isArray(res.body.camposFaltantes)).toBe(true)
      expect(res.body.camposFaltantes.length).toBeGreaterThan(0)
      expect(typeof res.body.porcentaje).toBe('number')
    })

    it('200: usuario con perfil completo retorna onboardingCompleto=true', async () => {
      await sembrarPerfil({
        id: 'uid-pcd',
        email: 'pcd@test.com',
        rol: 'pcd',
        activo: true,
        nombreCompleto: 'Ana',
        fechaNacimiento: '2015-03-15',
        curp: 'GAPL150315MCYRL093',
        certificadoDiscapacidad: true,
      })

      // Simular perfil extendido completo
      const db = (globalThis as any).__E2E__.db
      await db.collection('perfilesExtendidos').doc('ext-1').set({
        id: 'ext-1',
        usuarioId: 'uid-pcd',
        tiposDiscapacidad: JSON.stringify(['tea']),
        tieneDiagnostico: true,
      })

      const res = await request(http)
        .get('/api/usuarios/onboarding')
        .set('Authorization', token('uid-pcd'))

      expect(res.status).toBe(200)
      expect(res.body.onboardingCompleto).toBe(true)
      expect(res.body.camposFaltantes).toHaveLength(0)
      expect(res.body.porcentaje).toBe(100)
    })

    it('200: padre_tutor sin acreditación tiene acreditacionTutor en faltantes', async () => {
      await sembrarPerfil({
        id: 'uid-tutor',
        email: 'tutor@test.com',
        rol: 'padre_tutor',
        activo: true,
        nombreCompleto: 'Carlos',
        fechaNacimiento: '1985-01-01',
        curp: 'GAPL850101HDFRR500',
        // Sin estadoAcreditacionTutor
      })

      const res = await request(http)
        .get('/api/usuarios/onboarding')
        .set('Authorization', token('uid-tutor'))

      expect(res.status).toBe(200)
      expect(res.body.onboardingCompleto).toBe(false)
      expect(res.body.camposFaltantes).toContain('acreditacionTutor')
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Recomendación de Especialistas
  // ═══════════════════════════════════════════════════════════════════

  describe('GET /api/usuarios/especialistas', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/usuarios/especialistas')
      expect(res.status).toBe(401)
    })

    it('200: retorna lista vacía cuando no hay especialistas', async () => {
      await sembrarPerfil({
        id: 'uid-pcd',
        email: 'pcd@test.com',
        rol: 'pcd',
        activo: true,
        nombreCompleto: 'Ana',
      })

      const res = await request(http)
        .get('/api/usuarios/especialistas')
        .set('Authorization', token('uid-pcd'))

      expect(res.status).toBe(200)
      expect(res.body.datos).toEqual([])
      expect(res.body.paginacion.total).toBe(0)
    })

    it('200: retorna especialistas con scores de matching', async () => {
      await sembrarPerfil({
        id: 'uid-pcd',
        email: 'pcd@test.com',
        rol: 'pcd',
        activo: true,
        nombreCompleto: 'Ana',
        fechaNacimiento: '2015-03-15',
        ciudad: 'Mérida',
      })

      // Simular perfil extendido
      const db = (globalThis as any).__E2E__.db
      await db.collection('perfilesExtendidos').doc('ext-1').set({
        id: 'ext-1',
        usuarioId: 'uid-pcd',
        tiposDiscapacidad: JSON.stringify(['tea']),
      })

      // Simular especialistas
      await db.collection('especialistas').doc('esp-1').set({
        id: 'esp-1',
        nombre: 'Dra. López',
        especialidad: 'Neuropsicología',
        tiposDiscapacidad: ['tea', 'tdah'],
        edadMinima: 2,
        edadMaxima: 18,
        ciudad: 'Mérida',
        modalidad: 'presencial',
        calificacionPromedio: 4.8,
        cantidadCalificaciones: 15,
        activo: true,
      })

      await db.collection('especialistas').doc('esp-2').set({
        id: 'esp-2',
        nombre: 'Dr. García',
        especialidad: 'Fisioterapia',
        tiposDiscapacidad: ['motriz'],
        edadMinima: 10,
        edadMaxima: 30,
        ciudad: 'Cancún',
        modalidad: 'virtual',
        calificacionPromedio: 4.2,
        cantidadCalificaciones: 8,
        activo: true,
      })

      const res = await request(http)
        .get('/api/usuarios/especialistas')
        .set('Authorization', token('uid-pcd'))

      expect(res.status).toBe(200)
      expect(res.body.datos).toHaveLength(2)
      expect(res.body.paginacion.total).toBe(2)

      // Primera debería ser Dra. López (coincide TEA, edad 11 dentro de 2-18, misma ciudad)
      expect(res.body.datos[0].id).toBe('esp-1')
      expect(res.body.datos[0].score_discapacidad).toBe(1)
      expect(res.body.datos[0].score_edad).toBe(1)
      expect(res.body.datos[0].final_score).toBeGreaterThan(0)

      // Segunda debería ser Dr. García (no coincide discapacidad)
      expect(res.body.datos[1].id).toBe('esp-2')
    })

    it('200: paginación funciona correctamente', async () => {
      await sembrarPerfil({
        id: 'uid-pcd',
        email: 'pcd@test.com',
        rol: 'pcd',
        activo: true,
        nombreCompleto: 'Ana',
      })

      const db = (globalThis as any).__E2E__.db
      await db.collection('perfilesExtendidos').doc('ext-1').set({
        id: 'ext-1', usuarioId: 'uid-pcd', tiposDiscapacidad: '[]',
      })

      // Crear 5 especialistas
      for (let i = 0; i < 5; i++) {
        await db.collection('especialistas').doc(`esp-${i}`).set({
          id: `esp-${i}`, nombre: `Esp ${i}`, activo: true,
          tiposDiscapacidad: ['tea'], calificacionPromedio: 4.0,
        })
      }

      const res = await request(http)
        .get('/api/usuarios/especialistas?pagina=1&limite=2')
        .set('Authorization', token('uid-pcd'))

      expect(res.status).toBe(200)
      expect(res.body.datos).toHaveLength(2)
      expect(res.body.paginacion.total).toBe(5)
      expect(res.body.paginacion.totalPaginas).toBe(3)
    })
  })
})
