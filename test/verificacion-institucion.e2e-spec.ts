import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, sembrarInstitucion, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Verificación de Instituciones — E2E Tests
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Pruebas del flujo de verificación de instituciones:
 *  1. Registro: CURP obligatoria para rol "institucion"
 *  2. Guard: instituciones no verificadas no pueden crear vacantes
 *  3. Guard: instituciones verificadas SÍ pueden crear vacantes
 *  4. Guard: otros roles (tutor, pcd) no se ven afectados
 * ══════════════════════════════════════════════════════════════════════════════
 */

describe('Verificación de Instituciones (E2E)', () => {
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

  // ══════════════════════════════════════════════════════════════════════════
  // 1. Registro: CURP obligatoria para instituciones
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /api/autenticacion/registro — CURP obligatoria para instituciones', () => {
    it('400: registro institución sin CURP', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({
          email: 'inst@test.com',
          password: '123456',
          nombreCompleto: 'Centro Terapéutico',
          rol: 'institucion',
          categoria: 'funcional',
        })

      expect(res.status).toBe(400)
      expect(res.body.message).toContain('CURP')
    })

    it('201: registro institución con CURP válida', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({
          email: 'inst@test.com',
          password: '123456',
          nombreCompleto: 'Centro Terapéutico',
          rol: 'institucion',
          categoria: 'funcional',
          curp: 'GAPL800101HMCYRL09',
        })

      expect(res.status).toBe(201)
      expect(res.body.usuario.rol).toBe('institucion')
    })

    it('201: tutor NO necesita CURP', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({
          email: 'tutor@test.com',
          password: '123456',
          nombreCompleto: 'Tutor Test',
          rol: 'tutor',
        })

      expect(res.status).toBe(201)
      expect(res.body.usuario.rol).toBe('tutor')
    })

    it('201: PCD NO necesita CURP', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({
          email: 'pcd@test.com',
          password: '123456',
          nombreCompleto: 'PCD Test',
          rol: 'pcd',
        })

      expect(res.status).toBe(201)
      expect(res.body.usuario.rol).toBe('pcd')
    })

    it('400: CURP inválida en registro de institución', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({
          email: 'inst@test.com',
          password: '123456',
          nombreCompleto: 'Centro Terapéutico',
          rol: 'institucion',
          categoria: 'funcional',
          curp: 'CURP-CORTA',
        })

      expect(res.status).toBe(400)
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // 2. Guard: instituciones no verificadas bloqueadas
  // ══════════════════════════════════════════════════════════════════════════

  describe('InstitucionVerificadaGuard — institución no verificada', () => {
    beforeEach(async () => {
      await sembrarPerfil({
        id: 'uid-inst-no-verificada',
        email: 'inst-nover@test.com',
        rol: 'institucion',
        activo: true,
        verificado: false,
        nombreCompleto: 'Inst No Verificada',
        institucionId: 'uid-inst-no-verificada',
      })
      await sembrarInstitucion({
        id: 'uid-inst-no-verificada',
        nombre: 'Inst No Verificada',
        emailContacto: 'inst-nover@test.com',
        categoria: 'funcional',
        activa: true,
        verificada: false,
        creadoPor: 'uid-inst-no-verificada',
        usuarioId: 'uid-inst-no-verificada',
      })
    })

    it('403: crear vacante sin estar verificada', async () => {
      const res = await request(http)
        .post('/api/empleo')
        .set('Authorization', token('uid-inst-no-verificada'))
        .send({
          titulo: 'Terapeuta Ocupacional',
          descripcion: 'Se busca terapeuta',
          ciudad: 'Mérida',
          estado: 'Yucatán',
        })

      expect(res.status).toBe(403)
      expect(res.body.message).toContain('no verificada')
    })

    it('403: editar vacante sin estar verificada', async () => {
      const res = await request(http)
        .put('/api/empleo/fake-vacante-id')
        .set('Authorization', token('uid-inst-no-verificada'))
        .send({ titulo: 'Actualizado' })

      expect(res.status).toBe(403)
    })

    it('403: eliminar vacante sin estar verificada', async () => {
      const res = await request(http)
        .delete('/api/empleo/fake-vacante-id')
        .set('Authorization', token('uid-inst-no-verificada'))

      expect(res.status).toBe(403)
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // 3. Guard: instituciones verificadas SÍ pueden operar
  // ══════════════════════════════════════════════════════════════════════════

  describe('InstitucionVerificadaGuard — institución verificada', () => {
    beforeEach(async () => {
      await sembrarPerfil({
        id: 'uid-inst-verificada',
        email: 'inst-ver@test.com',
        rol: 'institucion',
        activo: true,
        verificado: true,
        nombreCompleto: 'Inst Verificada',
        institucionId: 'uid-inst-verificada',
      })
      await sembrarInstitucion({
        id: 'uid-inst-verificada',
        nombre: 'Inst Verificada',
        emailContacto: 'inst-ver@test.com',
        categoria: 'funcional',
        activa: true,
        verificada: true,
        creadoPor: 'uid-inst-verificada',
        usuarioId: 'uid-inst-verificada',
      })
    })

    it('201: crear vacante estando verificada', async () => {
      const res = await request(http)
        .post('/api/empleo')
        .set('Authorization', token('uid-inst-verificada'))
        .send({
          titulo: 'Terapeuta Ocupacional',
          descripcion: 'Se busca terapeuta',
          ciudad: 'Mérida',
          estado: 'Yucatán',
        })

      expect(res.status).toBe(201)
      expect(res.body.titulo).toBe('Terapeuta Ocupacional')
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // 4. Guard: otros roles no se ven afectados
  // ══════════════════════════════════════════════════════════════════════════

  describe('InstitucionVerificadaGuard — otros roles no afectados', () => {
    beforeEach(async () => {
      await sembrarPerfil({
        id: 'uid-tutor',
        email: 'tutor@test.com',
        rol: 'tutor',
        activo: true,
        nombreCompleto: 'Tutor',
      })
      await sembrarPerfil({
        id: 'uid-admin',
        email: 'admin@test.com',
        rol: 'admin',
        activo: true,
        nombreCompleto: 'Admin',
      })
      await sembrarInstitucion({
        id: 'uid-admin',
        nombre: 'Inst Admin',
        emailContacto: 'admin@test.com',
        categoria: 'funcional',
        activa: true,
        verificada: true,
        creadoPor: 'uid-admin',
        usuarioId: 'uid-admin',
      })
    })

    it('403: tutor no puede crear vacantes (rol incorrecto, no guard)', async () => {
      const res = await request(http)
        .post('/api/empleo')
        .set('Authorization', token('uid-tutor'))
        .send({
          titulo: 'Terapeuta Ocupacional',
          descripcion: 'Se busca terapeuta',
          ciudad: 'Mérida',
          estado: 'Yucatán',
        })

      // Tutor no tiene rol "institucion" ni "admin" → 403 por RolesGuard
      expect(res.status).toBe(403)
    })

    it('admin puede crear vacantes sin verificación', async () => {
      const res = await request(http)
        .post('/api/empleo')
        .set('Authorization', token('uid-admin'))
        .send({
          titulo: 'Vacante Admin',
          descripcion: 'Creada por admin',
          ciudad: 'Mérida',
          estado: 'Yucatán',
          institucionId: 'uid-admin',
        })

      expect(res.status).toBe(201)
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // 5. Endpoints que NO requieren verificación
  // ══════════════════════════════════════════════════════════════════════════

  describe('Instituciones no verificadas SÍ pueden acceder a:', () => {
    beforeEach(async () => {
      await sembrarPerfil({
        id: 'uid-inst-noverificada-2',
        email: 'inst-nover2@test.com',
        rol: 'institucion',
        activo: true,
        verificado: false,
        nombreCompleto: 'Inst No Verificada 2',
        institucionId: 'uid-inst-noverificada-2',
      })
      await sembrarInstitucion({
        id: 'uid-inst-noverificada-2',
        nombre: 'Inst No Verificada 2',
        emailContacto: 'inst-nover2@test.com',
        categoria: 'funcional',
        activa: true,
        verificada: false,
        creadoPor: 'uid-inst-noverificada-2',
        usuarioId: 'uid-inst-noverificada-2',
      })
    })

    it('200: ver su propio perfil', async () => {
      const res = await request(http)
        .get('/api/usuarios/perfil')
        .set('Authorization', token('uid-inst-noverificada-2'))

      expect(res.status).toBe(200)
      expect(res.body.rol).toBe('institucion')
    })

    it('200: ver su institución', async () => {
      const res = await request(http)
        .get('/api/instituciones/mi-institucion')
        .set('Authorization', token('uid-inst-noverificada-2'))

      expect(res.status).toBe(200)
    })

    it('200: subir documento de identidad', async () => {
      const buffer = Buffer.from('%PDF-1.4 fake')
      const res = await request(http)
        .post('/api/usuarios/documento-identidad')
        .set('Authorization', token('uid-inst-noverificada-2'))
        .field('tipo', 'curp')
        .field('numeroCurp', 'GAPL800101HMCYRL09')
        .attach('documento', buffer, { filename: 'curp.pdf', contentType: 'application/pdf' })

      expect(res.status).toBe(201)
    })

    it('200: listar instituciones (público)', async () => {
      const res = await request(http)
        .get('/api/instituciones')

      expect(res.status).toBe(200)
    })
  })
})
