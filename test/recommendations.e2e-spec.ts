import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, sembrarInstitucion, sembrarInteraccion, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

/** Fecha ISO de hace N días (para simular la ventana de 30 días) */
function haceDias(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()
}

const instituciones = [
  { id: 'inst-laboral', nombre: 'Centro de Empleo Inclusivo', categoria: 'laboral', activa: true, verificada: true, descripcion: 'empleo y tecnologia' },
  { id: 'inst-social', nombre: 'Centro Social Comunitario', categoria: 'social', activa: true, verificada: true, descripcion: 'integracion' },
]

async function sembrarEscenario() {
  await sembrarPerfil({ id: 'uid-user', email: 'user@test.com', rol: 'pcd', activo: true })
  await sembrarPerfil({ id: 'uid-otro', email: 'otro@test.com', rol: 'tutor', activo: true })
  for (const inst of instituciones) await sembrarInstitucion(inst)
}

describe('Recomendaciones e Interacciones (E2E)', () => {
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
    await sembrarEscenario()
  })

  // ─── POST /api/usuarios/interacciones ──────────────────────────────

  describe('POST /api/usuarios/interacciones', () => {
    it('401: sin token', async () => {
      const res = await request(http).post('/api/usuarios/interacciones').send({
        institucionId: 'inst-laboral',
        tipo: 'guardar',
      })
      expect(res.status).toBe(401)
    })

    it('400: tipo de interacción inválido', async () => {
      const res = await request(http)
        .post('/api/usuarios/interacciones')
        .send({ institucionId: 'inst-laboral', tipo: 'compartir' })
        .set('Authorization', token('uid-user'))
      expect(res.status).toBe(400)
    })

    it('400: categoría inválida', async () => {
      const res = await request(http)
        .post('/api/usuarios/interacciones')
        .send({ institucionId: 'inst-laboral', tipo: 'guardar', categoria: 'deportiva' })
        .set('Authorization', token('uid-user'))
      expect(res.status).toBe(400)
    })

    it('201: registra la interacción en Firestore', async () => {
      const res = await request(http)
        .post('/api/usuarios/interacciones')
        .send({ institucionId: 'inst-laboral', tipo: 'guardar', categoria: 'laboral' })
        .set('Authorization', token('uid-user'))

      expect(res.status).toBe(201)
      expect(res.body.exito).toBe(true)
      expect(res.body.id).toBeDefined()

      // Verificar el documento guardado (id aleatorio → buscar por usuarioId no es trivial;
      // validamos el contrato de respuesta y los pesos en el siguiente describe)
    })
  })

  // ─── GET /api/usuarios/interacciones/pesos ─────────────────────────

  describe('GET /api/usuarios/interacciones/pesos', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/usuarios/interacciones/pesos')
      expect(res.status).toBe(401)
    })

    it('200: agrupa puntos por categoría solo dentro de la ventana de 30 días', async () => {
      await sembrarInteraccion({ usuarioId: 'uid-user', institucionId: 'inst-laboral', tipo: 'guardar', categoria: 'laboral', createdAt: haceDias(1) })      // 10
      await sembrarInteraccion({ usuarioId: 'uid-user', institucionId: 'inst-laboral', tipo: 'click_card', categoria: 'laboral', createdAt: haceDias(2) })   // +2
      await sembrarInteraccion({ usuarioId: 'uid-user', institucionId: 'inst-social', tipo: 'ver_detalle', categoria: 'social', createdAt: haceDias(3) })     // 5
      // Fuera de ventana: no debe contar
      await sembrarInteraccion({ usuarioId: 'uid-user', institucionId: 'inst-social', tipo: 'guardar', categoria: 'social', createdAt: haceDias(45) })
      // De otro usuario: no debe contar
      await sembrarInteraccion({ usuarioId: 'uid-otro', institucionId: 'inst-laboral', tipo: 'guardar', categoria: 'laboral', createdAt: haceDias(1) })

      const res = await request(http)
        .get('/api/usuarios/interacciones/pesos')
        .set('Authorization', token('uid-user'))

      expect(res.status).toBe(200)
      expect(res.body.pesos).toEqual({ laboral: 12, social: 5 })
    })
  })

  // ─── GET /api/usuarios/recomendaciones ─────────────────────────────

  describe('GET /api/usuarios/recomendaciones', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/usuarios/recomendaciones')
      expect(res.status).toBe(401)
    })

    it('200: ordena por final_score descendente combinando intereses y comportamiento', async () => {
      // Perfil extendido con metas que coinciden con la institución laboral
      await (globalThis as any).__E2E__.db.collection('perfilesExtendidos').add({
        usuarioId: 'uid-user',
        metasActuales: JSON.stringify(['empleo']),
        areasInteres: JSON.stringify(['tecnologia']),
      })
      await sembrarInteraccion({ usuarioId: 'uid-user', institucionId: 'inst-social', tipo: 'ver_detalle', categoria: 'social', createdAt: haceDias(1) }) // 5

      const res = await request(http)
        .get('/api/usuarios/recomendaciones')
        .set('Authorization', token('uid-user'))

      expect(res.status).toBe(200)
      expect(res.body.datos).toHaveLength(2)
      expect(res.body.paginacion.total).toBe(2)

      const [primera, segunda] = res.body.datos
      // Orden descendente por final_score
      expect(primera.final_score).toBeGreaterThanOrEqual(segunda.final_score)

      // Cada institución expone sus scores desglosados
      for (const fila of res.body.datos) {
        expect(fila.score_intereses).toBeGreaterThanOrEqual(0)
        expect(fila.score_comportamiento).toBeGreaterThanOrEqual(0)
        expect(fila.final_score).toBeCloseTo(fila.score_intereses * 0.6 + fila.score_comportamiento * 0.4, 1)
      }

      // La laboral coincide con la meta 'empleo' → score de intereses > 0
      expect(primera.id).toBe('inst-laboral')
      expect(primera.score_intereses).toBeGreaterThan(0)
    })

    it('200: respeta la paginación', async () => {
      const res = await request(http)
        .get('/api/usuarios/recomendaciones?pagina=1&limite=1')
        .set('Authorization', token('uid-user'))

      expect(res.status).toBe(200)
      expect(res.body.datos).toHaveLength(1)
      expect(res.body.paginacion).toEqual({ total: 2, pagina: 1, limite: 1, totalPaginas: 2 })
    })
  })

  // ─── GET /api/descubrimiento?categorias=... ─────────────────────────

  describe('GET /api/descubrimiento?categorias', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/descubrimiento')
      expect(res.status).toBe(401)
    })

    it('200: prioriza las categorías solicitadas respetando el orden del array', async () => {
      const res = await request(http)
        .get('/api/descubrimiento?categorias=social,laboral')
        .set('Authorization', token('uid-user'))

      expect(res.status).toBe(200)
      const ids = res.body.map((r: any) => r.id)
      expect(ids[0]).toBe('inst-social')
      expect(ids[1]).toBe('inst-laboral')
    })
  })
})
