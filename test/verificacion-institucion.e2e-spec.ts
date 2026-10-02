import { crearAppE2E } from './helpers/app.e2e'
import { leerDoc, limpiarDb, sembrarPerfil, sembrarInstitucion, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Verificación de Instituciones — E2E Tests
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Pruebas del flujo de verificación de instituciones:
 *  1. Registro: CURP NO obligatoria para "institucion"/"empresa" (verificación vía CSF)
 *  2. Guard: instituciones no verificadas no pueden crear vacantes
 *  3. Guard: instituciones verificadas SÍ pueden crear vacantes
 *  4. Guard: otros roles (tutor, pcd) no se ven afectados
 *  5. Endpoints que NO requieren verificación
 *  6. POST /instituciones/verificacion/documentos: CSF indispensable, sin CURP
 *  7. GET /instituciones/mi-institucion/estado-verificacion: pasos sin CURP
 *  8. Aprobación admin: exige CSF (nunca CURP/identificación del representante)
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
  // 1. Registro: CURP no obligatoria para instituciones/empresas (verificación vía CSF)
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /api/autenticacion/registro — CURP no obligatoria para instituciones/empresas', () => {
    it('201: registro institución sin CURP (la verificación es vía CSF)', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({
          email: 'inst@test.com',
          password: 'Password123!',
          nombreCompleto: 'Centro Terapéutico',
          rol: 'institucion',
          categoria: 'funcional',
        })

      expect(res.status).toBe(201)
      expect(res.body.usuario.rol).toBe('institucion')
      expect(res.body.requiereInicioSesion).toBe(true)
    })

    it('201: registro empresa sin CURP', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({
          email: 'empresa@test.com',
          password: 'Password123!',
          nombreCompleto: 'Empresa Inclusiva',
          rol: 'empresa',
        })

      expect(res.status).toBe(201)
      expect(res.body.usuario.rol).toBe('empresa')

      // Opción A (subtipo en institución): la empresa vive en la colección
      // 'instituciones' con tipo 'empresa', pendiente de verificación, y su
      // perfil queda vinculado a esa entidad.
      const inst = await leerDoc('instituciones', res.body.usuario.id)
      expect(inst?.tipo).toBe('empresa')
      expect(inst?.verificada).toBe(false)
      expect(res.body.usuario.institucionId).toBe(res.body.usuario.id)
    })

    it('201: registro institución con CSF adjunta guarda documentoCsf', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .field('email', 'inst-csf@test.com')
        .field('password', 'Password123!')
        .field('nombreCompleto', 'Centro Con CSF')
        .field('rol', 'institucion')
        .field('categoria', 'funcional')
        .attach('csf', Buffer.from('%PDF-1.4 fake csf'), { filename: 'csf.pdf', contentType: 'application/pdf' })

      expect(res.status).toBe(201)
      expect(res.body.usuario.rol).toBe('institucion')

      // La CSF adjunta quedó registrada en el documento de la institución
      const inst = await leerDoc('instituciones', res.body.usuario.id)
      expect(inst?.documentoCsf).toBeDefined()
    })

    it('201: registro institución con CURP válida (opcional, se acepta si viene)', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({
          email: 'inst@test.com',
          password: 'Password123!',
          nombreCompleto: 'Centro Terapéutico',
          rol: 'institucion',
          categoria: 'funcional',
          curp: 'GAPL800101HMCYRL09',
        })

      expect(res.status).toBe(201)
      expect(res.body.usuario.rol).toBe('institucion')
    })

    it('201: padre_tutor NO necesita CURP', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({
          email: 'tutor@test.com',
          password: 'Password123!',
          nombreCompleto: 'Tutor Test',
          rol: 'padre_tutor',
        })

      expect(res.status).toBe(201)
      expect(res.body.usuario.rol).toBe('padre_tutor')
    })

    it('201: PCD NO necesita CURP', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({
          email: 'pcd@test.com',
          password: 'Password123!',
          nombreCompleto: 'PCD Test',
          rol: 'pcd',
        })

      expect(res.status).toBe(201)
      expect(res.body.usuario.rol).toBe('pcd')
    })

    it('400: CURP inválida en registro de institución (si se envía, debe ser válida)', async () => {
      const res = await request(http)
        .post('/api/autenticacion/registro')
        .send({
          email: 'inst-curp-invalida@test.com',
          password: 'Password123!',
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
        rol: 'padre_tutor',
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

  // ══════════════════════════════════════════════════════════════════════════
  // 6. POST /instituciones/verificacion/documentos — CSF indispensable, sin CURP
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /api/instituciones/verificacion/documentos', () => {
    const uid = 'uid-inst-verif'
    const csf = () => Buffer.from('%PDF-1.4 fake csf')

    beforeEach(async () => {
      await sembrarPerfil({
        id: uid,
        email: 'verif@test.com',
        rol: 'institucion',
        activo: true,
        verificado: false,
        nombreCompleto: 'Centro Verificación',
        institucionId: uid,
      })
      await sembrarInstitucion({
        id: uid,
        nombre: 'Centro Verificación',
        emailContacto: 'verif@test.com',
        categoria: 'funcional',
        activa: true,
        verificada: false,
        creadoPor: uid,
        usuarioId: uid,
      })
    })

    it('401: sin token', async () => {
      const res = await request(http)
        .post('/api/instituciones/verificacion/documentos')
        .field('tipo', 'csf')
        .attach('documento', csf(), { filename: 'csf.pdf', contentType: 'application/pdf' })

      expect(res.status).toBe(401)
    })

    it('403: rol PCD no puede subir documentos de verificación', async () => {
      await sembrarPerfil({ id: 'uid-pcd-verif', email: 'pcd-verif@test.com', rol: 'pcd', activo: true, nombreCompleto: 'PCD' })

      const res = await request(http)
        .post('/api/instituciones/verificacion/documentos')
        .set('Authorization', token('uid-pcd-verif'))
        .field('tipo', 'csf')
        .attach('documento', csf(), { filename: 'csf.pdf', contentType: 'application/pdf' })

      expect(res.status).toBe(403)
    })

    it('201: sube la CSF (indispensable) y persiste documentoCsf en la institución', async () => {
      const res = await request(http)
        .post('/api/instituciones/verificacion/documentos')
        .set('Authorization', token(uid))
        .field('tipo', 'csf')
        .attach('documento', csf(), { filename: 'csf.pdf', contentType: 'application/pdf' })

      expect(res.status).toBe(201)
      expect(res.body.tipo).toBe('csf')
      expect(res.body.estado).toBe('pendiente')
      expect(typeof res.body.urlDocumento).toBe('string')
      // La CURP no participa en absoluto en la respuesta
      expect(res.body.numeroCurp).toBeUndefined()

      const inst = await leerDoc('instituciones', uid)
      expect(typeof inst.documentoCsf).toBe('string')
      expect(inst.documentoCsf.length).toBeGreaterThan(0)
      expect(typeof inst.fechaDocumentoCsf).toBe('string')
    })

    it('201: sube la identificación del representante SIN numeroCurp (opcional)', async () => {
      const res = await request(http)
        .post('/api/instituciones/verificacion/documentos')
        .set('Authorization', token(uid))
        .field('tipo', 'identificacion_representante')
        .attach('documento', Buffer.from('png-bytes'), { filename: 'ine.png', contentType: 'image/png' })

      expect(res.status).toBe(201)
      expect(res.body.tipo).toBe('identificacion_representante')
      expect(res.body.estado).toBe('pendiente')
      expect(typeof res.body.urlDocumento).toBe('string')

      // Quedó registrada como identificación oficial del usuario, sin CURP
      const estado = await request(http)
        .get('/api/usuarios/estado-validacion-identidad')
        .set('Authorization', token(uid))
      expect(estado.status).toBe(200)
      expect(estado.body.tieneIdentificacion).toBe(true)
      expect(estado.body.tieneCurp).toBe(false)
    })

    it('400: tipo inválido (solo csf o identificacion_representante)', async () => {
      const res = await request(http)
        .post('/api/instituciones/verificacion/documentos')
        .set('Authorization', token(uid))
        .field('tipo', 'curp')
        .attach('documento', csf(), { filename: 'curp.pdf', contentType: 'application/pdf' })

      expect(res.status).toBe(400)
    })

    it('400: sin archivo adjunto', async () => {
      const res = await request(http)
        .post('/api/instituciones/verificacion/documentos')
        .set('Authorization', token(uid))
        .field('tipo', 'csf')

      expect(res.status).toBe(400)
    })

    it('404: usuario con rol institución pero sin institución registrada', async () => {
      await sembrarPerfil({ id: 'uid-sin-inst', email: 'sininst@test.com', rol: 'institucion', activo: true, nombreCompleto: 'Sin Institución' })

      const res = await request(http)
        .post('/api/instituciones/verificacion/documentos')
        .set('Authorization', token('uid-sin-inst'))
        .field('tipo', 'csf')
        .attach('documento', csf(), { filename: 'csf.pdf', contentType: 'application/pdf' })

      expect(res.status).toBe(404)
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // 7. GET /instituciones/mi-institucion/estado-verificacion — pasos sin CURP
  // ══════════════════════════════════════════════════════════════════════════

  describe('GET /api/instituciones/mi-institucion/estado-verificacion', () => {
    const uid = 'uid-inst-estado'
    const CSF = 'https://storage.googleapis.com/raices-bucket/instituciones/csf.pdf'

    const sembrarBase = (extras: Record<string, any> = {}) =>
      sembrarInstitucion({
        id: uid,
        nombre: 'Centro Estado',
        emailContacto: 'estado@test.com',
        categoria: 'funcional',
        activa: true,
        verificada: false,
        creadoPor: uid,
        usuarioId: uid,
        ...extras,
      })

    beforeEach(async () => {
      await sembrarPerfil({
        id: uid,
        email: 'estado@test.com',
        rol: 'institucion',
        activo: true,
        verificado: false,
        nombreCompleto: 'Centro Estado',
        institucionId: uid,
      })
      await sembrarBase()
    })

    it('401: sin token', async () => {
      const res = await request(http).get('/api/instituciones/mi-institucion/estado-verificacion')
      expect(res.status).toBe(401)
    })

    it('200: sin CSF → pasos sin CURP, pendientes CSF + aprobación', async () => {
      const res = await request(http)
        .get('/api/instituciones/mi-institucion/estado-verificacion')
        .set('Authorization', token(uid))

      expect(res.status).toBe(200)
      expect(res.body.verificada).toBe(false)
      expect(res.body.pasos.map((p: any) => p.clave)).toEqual(['csf', 'aprobacion_admin', 'identificacion_representante'])
      expect(res.body.pasos.some((p: any) => p.clave === 'curp')).toBe(false)
      expect(res.body.pasos.find((p: any) => p.clave === 'csf').obligatorio).toBe(true)
      expect(res.body.pasos.find((p: any) => p.clave === 'identificacion_representante').obligatorio).toBe(false)
      expect(res.body.documentosFaltantes).toEqual(['csf'])
      expect(res.body.documentosFaltantes).not.toContain('curp')
      expect(res.body.pasosPendientes).toEqual(['csf', 'aprobacion_admin'])
      expect(res.body.porcentaje).toBe(0)
    })

    it('200: con CSF → solo falta la aprobación del administrador (50%)', async () => {
      await sembrarBase({ documentoCsf: CSF })

      const res = await request(http)
        .get('/api/instituciones/mi-institucion/estado-verificacion')
        .set('Authorization', token(uid))

      expect(res.status).toBe(200)
      expect(res.body.documentosFaltantes).toEqual([])
      expect(res.body.pasosPendientes).toEqual(['aprobacion_admin'])
      expect(res.body.porcentaje).toBe(50)
    })

    it('200: con CSF y aprobación → 100%', async () => {
      await sembrarBase({ documentoCsf: CSF, verificada: true })

      const res = await request(http)
        .get('/api/instituciones/mi-institucion/estado-verificacion')
        .set('Authorization', token(uid))

      expect(res.status).toBe(200)
      expect(res.body.verificada).toBe(true)
      expect(res.body.pasosPendientes).toEqual([])
      expect(res.body.porcentaje).toBe(100)
    })

    it('200: la identificación del representante es opcional y no altera el porcentaje', async () => {
      await sembrarBase({ documentoCsf: CSF })
      await sembrarPerfil({ id: uid, email: 'estado@test.com', rol: 'institucion', activo: true, verificado: false, nombreCompleto: 'Centro Estado', institucionId: uid, curp: 'GAPL800101HMCYRL09' })

      const res = await request(http)
        .get('/api/instituciones/mi-institucion/estado-verificacion')
        .set('Authorization', token(uid))

      expect(res.status).toBe(200)
      expect(res.body.pasos.find((p: any) => p.clave === 'identificacion_representante').obligatorio).toBe(false)
      expect(res.body.porcentaje).toBe(50)
    })

    it('200: rol empresa también obtiene los pasos sin CURP', async () => {
      await sembrarPerfil({ id: 'uid-empresa-estado', email: 'empresa-estado@test.com', rol: 'empresa', activo: true, verificado: false, nombreCompleto: 'Empresa SA', institucionId: 'uid-empresa-estado' })
      await sembrarInstitucion({
        id: 'uid-empresa-estado',
        nombre: 'Empresa SA',
        emailContacto: 'empresa-estado@test.com',
        categoria: 'funcional',
        activa: true,
        verificada: false,
        creadoPor: 'uid-empresa-estado',
        usuarioId: 'uid-empresa-estado',
        tipo: 'empresa',
      })

      const res = await request(http)
        .get('/api/instituciones/mi-institucion/estado-verificacion')
        .set('Authorization', token('uid-empresa-estado'))

      expect(res.status).toBe(200)
      expect(res.body.pasos.map((p: any) => p.clave)).toEqual(['csf', 'aprobacion_admin', 'identificacion_representante'])
      expect(res.body.documentosFaltantes).toEqual(['csf'])
    })

    it('404: usuario sin institución registrada', async () => {
      await sembrarPerfil({ id: 'uid-estado-sin-inst', email: 'estadoinst@test.com', rol: 'institucion', activo: true, nombreCompleto: 'Sin Inst' })

      const res = await request(http)
        .get('/api/instituciones/mi-institucion/estado-verificacion')
        .set('Authorization', token('uid-estado-sin-inst'))

      expect(res.status).toBe(404)
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // 8. Aprobación del administrador — exige CSF, nunca CURP/identificación
  // ══════════════════════════════════════════════════════════════════════════

  describe('Aprobación admin — requisito CSF (sin CURP)', () => {
    const uid = 'uid-inst-aprobar'
    const CSF = 'https://storage.googleapis.com/raices-bucket/instituciones/csf.pdf'

    const sembrarInstitucionConCSF = () =>
      sembrarInstitucion({
        id: uid,
        nombre: 'Centro Aprobar',
        emailContacto: 'aprobar@test.com',
        categoria: 'funcional',
        activa: true,
        verificada: false,
        creadoPor: uid,
        usuarioId: uid,
        documentoCsf: CSF,
      })

    beforeEach(async () => {
      await sembrarPerfil({ id: 'uid-admin-aprobar', email: 'admin-aprobar@test.com', rol: 'admin', activo: true, nombreCompleto: 'Admin' })
      await sembrarPerfil({ id: uid, email: 'aprobar@test.com', rol: 'institucion', activo: true, verificado: false, nombreCompleto: 'Centro Aprobar', institucionId: uid })
    })

    it('400: no puede aprobarse sin CSF (indispensable para personas morales)', async () => {
      await sembrarInstitucion({ id: uid, nombre: 'Centro Aprobar', emailContacto: 'aprobar@test.com', categoria: 'funcional', activa: true, verificada: false, creadoPor: uid, usuarioId: uid })

      const res = await request(http)
        .post(`/api/administracion/instituciones/${uid}/aprobar`)
        .set('Authorization', token('uid-admin-aprobar'))

      expect(res.status).toBe(400)
      expect(res.body.message).toContain('Constancia de Situación Fiscal')
      expect(res.body.message).not.toContain('CURP')

      const inst = await leerDoc('instituciones', uid)
      expect(inst.verificada).toBe(false)
    })

    it('204: se aprueba con SOLO la CSF (sin CURP ni identificación del representante)', async () => {
      await sembrarInstitucionConCSF()

      const res = await request(http)
        .post(`/api/administracion/instituciones/${uid}/aprobar`)
        .set('Authorization', token('uid-admin-aprobar'))

      expect(res.status).toBe(204)

      const inst = await leerDoc('instituciones', uid)
      expect(inst.verificada).toBe(true)
      expect(inst.activa).toBe(true)
    })

    it('200: verificación de identidad reporta puedeAprobarse por CSF, nunca por CURP', async () => {
      await sembrarInstitucionConCSF()

      const res = await request(http)
        .get(`/api/administracion/instituciones/${uid}/verificacion-identidad`)
        .set('Authorization', token('uid-admin-aprobar'))

      expect(res.status).toBe(200)
      expect(res.body.verificacionIdentidad.tieneCsf).toBe(true)
      expect(res.body.verificacionIdentidad.tieneCurp).toBe(false)
      expect(res.body.verificacionIdentidad.tieneIdentificacion).toBe(false)
      expect(res.body.verificacionIdentidad.puedeAprobarse).toBe(true)
      expect(res.body.verificacionIdentidad.motivo).toBeNull()
    })

    it('200: sin CSF → puedeAprobarse false y el motivo menciona la CSF (no la CURP)', async () => {
      await sembrarInstitucion({ id: uid, nombre: 'Centro Aprobar', emailContacto: 'aprobar@test.com', categoria: 'funcional', activa: true, verificada: false, creadoPor: uid, usuarioId: uid })

      const res = await request(http)
        .get(`/api/administracion/instituciones/${uid}/verificacion-identidad`)
        .set('Authorization', token('uid-admin-aprobar'))

      expect(res.status).toBe(200)
      expect(res.body.verificacionIdentidad.tieneCsf).toBe(false)
      expect(res.body.verificacionIdentidad.puedeAprobarse).toBe(false)
      expect(res.body.verificacionIdentidad.motivo).toContain('Constancia de Situación Fiscal')
      expect(res.body.verificacionIdentidad.motivo).not.toContain('CURP')
    })

    it('200: el listado de pendientes expone tieneCsf y puedeAprobarse basado en la CSF', async () => {
      await sembrarInstitucionConCSF()

      const res = await request(http)
        .get('/api/administracion/instituciones/pendientes')
        .set('Authorization', token('uid-admin-aprobar'))

      expect(res.status).toBe(200)
      const item = (res.body as any[]).find((i: any) => i.id === uid)
      expect(item).toBeDefined()
      expect(item.verificacionIdentidad.tieneCsf).toBe(true)
      expect(item.verificacionIdentidad.puedeAprobarse).toBe(true)
      expect(item.verificacionIdentidad.tieneCurp).toBe(false)
    })

    it('flujo completo: subir CSF → estado 50% → aprobar → 100% (sin CURP en ningún paso)', async () => {
      await sembrarInstitucion({ id: uid, nombre: 'Centro Aprobar', emailContacto: 'aprobar@test.com', categoria: 'funcional', activa: true, verificada: false, creadoPor: uid, usuarioId: uid })

      // 1. Subir la CSF
      const subir = await request(http)
        .post('/api/instituciones/verificacion/documentos')
        .set('Authorization', token(uid))
        .field('tipo', 'csf')
        .attach('documento', Buffer.from('%PDF-1.4 fake csf'), { filename: 'csf.pdf', contentType: 'application/pdf' })
      expect(subir.status).toBe(201)

      // 2. Estado intermedio: 50%, solo falta aprobación
      const estado1 = await request(http)
        .get('/api/instituciones/mi-institucion/estado-verificacion')
        .set('Authorization', token(uid))
      expect(estado1.body.porcentaje).toBe(50)
      expect(estado1.body.pasosPendientes).toEqual(['aprobacion_admin'])
      expect(estado1.body.pasos.every((p: any) => p.clave !== 'curp')).toBe(true)

      // 3. El admin aprueba con solo la CSF
      const aprobar = await request(http)
        .post(`/api/administracion/instituciones/${uid}/aprobar`)
        .set('Authorization', token('uid-admin-aprobar'))
      expect(aprobar.status).toBe(204)

      // 4. Estado final: 100%
      const estado2 = await request(http)
        .get('/api/instituciones/mi-institucion/estado-verificacion')
        .set('Authorization', token(uid))
      expect(estado2.body.porcentaje).toBe(100)
      expect(estado2.body.pasosPendientes).toEqual([])
      expect(estado2.body.verificada).toBe(true)
    })
  })
})
