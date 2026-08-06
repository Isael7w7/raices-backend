import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

describe('Health (E2E)', () => {
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

  it('200: GET /api/health reporta proceso y Firestore ok', async () => {
    const res = await request(http).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.checks.proceso.estado).toBe('ok')
    expect(res.body.checks.firestore.estado).toBe('ok')
    expect(typeof res.body.checks.proceso.uptimeSegundos).toBe('number')
    expect(typeof res.body.tiempoMs).toBe('number')
  })
})
