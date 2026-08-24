import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, leerDoc, token } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * DOCUMENTOS DE IDENTIDAD — E2E Tests
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Pruebas de extremo a extremo del flujo de validación de documentos:
 *  1. Subida de CURP e identificación oficial
 *  2. Consulta de estado de validación
 *  3. Admin: listado de documentos pendientes
 *  4. Admin: aprobación de documentos
 *  5. Admin: rechazo de documentos con motivo
 *  6. Validaciones de error (token, tipo, CURP inválida, archivos)
 * ══════════════════════════════════════════════════════════════════════════════
 */

// Helpers para crear buffers de prueba con magic bytes reales
function crearPdfFake(): Buffer {
  return Buffer.from('%PDF-1.4 fake content for testing')
}

function crearJpegFake(): Buffer {
  // JPEG magic bytes: FF D8 FF
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
}

describe('Documentos de Identidad (E2E)', () => {
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
    await sembrarPerfil({
      id: 'uid-usuario',
      email: 'usuario@test.com',
      rol: 'pcd',
      activo: true,
      nombreCompleto: 'Juan Pérez',
    })
    await sembrarPerfil({
      id: 'uid-admin',
      email: 'admin@test.com',
      rol: 'admin',
      activo: true,
      nombreCompleto: 'Admin User',
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // POST /api/usuarios/documento-identidad — Subir documento
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /api/usuarios/documento-identidad', () => {
    it('401: sin token', async () => {
      const res = await request(http)
        .post('/api/usuarios/documento-identidad')
        .field('tipo', 'curp')
        .attach('documento', crearPdfFake(), { filename: 'curp.pdf', contentType: 'application/pdf' })

      expect(res.status).toBe(401)
    })

    it('400: sin archivo', async () => {
      const res = await request(http)
        .post('/api/usuarios/documento-identidad')
        .set('Authorization', token('uid-usuario'))
        .field('tipo', 'curp')

      expect(res.status).toBe(400)
    })

    it('400: tipo inválido', async () => {
      const res = await request(http)
        .post('/api/usuarios/documento-identidad')
        .set('Authorization', token('uid-usuario'))
        .field('tipo', 'pasaporte')
        .attach('documento', crearPdfFake(), { filename: 'doc.pdf', contentType: 'application/pdf' })

      expect(res.status).toBe(400)
    })

    it('400: CURP con formato inválido (muy corta)', async () => {
      const res = await request(http)
        .post('/api/usuarios/documento-identidad')
        .set('Authorization', token('uid-usuario'))
        .field('tipo', 'curp')
        .field('numeroCurp', 'GAPL80')
        .attach('documento', crearPdfFake(), { filename: 'curp.pdf', contentType: 'application/pdf' })

      expect(res.status).toBe(400)
    })

    it('400: CURP con entidad federativa inválida', async () => {
      const res = await request(http)
        .post('/api/usuarios/documento-identidad')
        .set('Authorization', token('uid-usuario'))
        .field('tipo', 'curp')
        .field('numeroCurp', 'GAPL800101HXXRLAA9') // XX no es entidad válida
        .attach('documento', crearPdfFake(), { filename: 'curp.pdf', contentType: 'application/pdf' })

      expect(res.status).toBe(400)
    })

    it('201: sube CURP correctamente', async () => {
      const res = await request(http)
        .post('/api/usuarios/documento-identidad')
        .set('Authorization', token('uid-usuario'))
        .field('tipo', 'curp')
        .field('numeroCurp', 'GAPL800101HMCYRL09')
        .attach('documento', crearPdfFake(), { filename: 'curp.pdf', contentType: 'application/pdf' })

      expect(res.status).toBe(201)
      expect(res.body.tipo).toBe('curp')
      expect(res.body.estado).toBe('pendiente')
      expect(res.body.urlDocumento).toBeDefined()
      expect(res.body.fechaSubida).toBeDefined()
      expect(res.body.numeroCurp).toBe('GAPL800101HMCYRL09')

      // Verificar que el documento se registró en Firestore
      const docsSnap = await (globalThis as any).__E2E__.db
        .collection('documentosIdentidad')
        .where('usuarioId', '==', 'uid-usuario')
        .get()
      expect(docsSnap.docs.length).toBe(1)
      expect(docsSnap.docs[0].data().tipo).toBe('curp')
      expect(docsSnap.docs[0].data().estado).toBe('pendiente')
    })

    it('201: sube identificación oficial correctamente', async () => {
      const res = await request(http)
        .post('/api/usuarios/documento-identidad')
        .set('Authorization', token('uid-usuario'))
        .field('tipo', 'identificacion_oficial')
        .attach('documento', crearJpegFake(), { filename: 'ine.jpg', contentType: 'image/jpeg' })

      expect(res.status).toBe(201)
      expect(res.body.tipo).toBe('identificacion_oficial')
      expect(res.body.estado).toBe('pendiente')
      expect(res.body.numeroCurp).toBeNull()
    })

    it('201: CURP se guarda normalizada en mayúsculas en el perfil', async () => {
      await request(http)
        .post('/api/usuarios/documento-identidad')
        .set('Authorization', token('uid-usuario'))
        .field('tipo', 'curp')
        .field('numeroCurp', 'gapl800101hmcyrl09')
        .attach('documento', crearPdfFake(), { filename: 'curp.pdf', contentType: 'application/pdf' })

      const perfil = await leerDoc('perfiles', 'uid-usuario')
      expect(perfil.curp).toBe('GAPL800101HMCYRL09')
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // GET /api/usuarios/estado-validacion-identidad — Estado de validación
  // ══════════════════════════════════════════════════════════════════════════

  describe('GET /api/usuarios/estado-validacion-identidad', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/usuarios/estado-validacion-identidad')
      expect(res.status).toBe(401)
    })

    it('200: sin documentos — estado sin_documentos', async () => {
      const res = await request(http)
        .get('/api/usuarios/estado-validacion-identidad')
        .set('Authorization', token('uid-usuario'))

      expect(res.status).toBe(200)
      expect(res.body.estado).toBe('sin_documentos')
      expect(res.body.tieneCurp).toBe(false)
      expect(res.body.tieneIdentificacion).toBe(false)
    })

    it('200: con CURP pendiente — estado pendiente', async () => {
      // Subir CURP
      await request(http)
        .post('/api/usuarios/documento-identidad')
        .set('Authorization', token('uid-usuario'))
        .field('tipo', 'curp')
        .field('numeroCurp', 'GAPL800101HMCYRL09')
        .attach('documento', crearPdfFake(), { filename: 'curp.pdf', contentType: 'application/pdf' })

      const res = await request(http)
        .get('/api/usuarios/estado-validacion-identidad')
        .set('Authorization', token('uid-usuario'))

      expect(res.status).toBe(200)
      expect(res.body.estado).toBe('pendiente')
      expect(res.body.tieneCurp).toBe(true)
      expect(res.body.tieneIdentificacion).toBe(false)
      expect(res.body.numeroCurp).toBe('GAPL800101HMCYRL09')
    })

    it('200: con ambos documentos pendientes', async () => {
      // Subir CURP
      await request(http)
        .post('/api/usuarios/documento-identidad')
        .set('Authorization', token('uid-usuario'))
        .field('tipo', 'curp')
        .field('numeroCurp', 'GAPL800101HMCYRL09')
        .attach('documento', crearPdfFake(), { filename: 'curp.pdf', contentType: 'application/pdf' })

      // Subir identificación
      await request(http)
        .post('/api/usuarios/documento-identidad')
        .set('Authorization', token('uid-usuario'))
        .field('tipo', 'identificacion_oficial')
        .attach('documento', crearJpegFake(), { filename: 'ine.jpg', contentType: 'image/jpeg' })

      const res = await request(http)
        .get('/api/usuarios/estado-validacion-identidad')
        .set('Authorization', token('uid-usuario'))

      expect(res.status).toBe(200)
      expect(res.body.estado).toBe('pendiente')
      expect(res.body.tieneCurp).toBe(true)
      expect(res.body.tieneIdentificacion).toBe(true)
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Admin: Documentos de identidad
  // ══════════════════════════════════════════════════════════════════════════

  describe('Admin: documentos de identidad', () => {
    let docId: string

    beforeEach(async () => {
      // Subir un documento como usuario normal
      const uploadRes = await request(http)
        .post('/api/usuarios/documento-identidad')
        .set('Authorization', token('uid-usuario'))
        .field('tipo', 'curp')
        .field('numeroCurp', 'GAPL800101HMCYRL09')
        .attach('documento', crearPdfFake(), { filename: 'curp.pdf', contentType: 'application/pdf' })

      // Obtener el ID del documento recién creado
      const docsSnap = await (globalThis as any).__E2E__.db
        .collection('documentosIdentidad')
        .where('usuarioId', '==', 'uid-usuario')
        .get()
      docId = docsSnap.docs[0].id
    })

    it('GET pendientes: 401 sin token admin', async () => {
      const res = await request(http)
        .get('/api/administracion/documentos-identidad/pendientes')
        .set('Authorization', token('uid-usuario'))

      // Usuario normal no tiene rol admin
      expect(res.status).toBe(403)
    })

    it('GET pendientes: lista documentos pendientes', async () => {
      const res = await request(http)
        .get('/api/administracion/documentos-identidad/pendientes')
        .set('Authorization', token('uid-admin'))

      expect(res.status).toBe(200)
      expect(res.body.datos).toBeDefined()
      expect(res.body.datos.length).toBeGreaterThanOrEqual(1)

      const doc = res.body.datos.find((d: any) => d.id === docId)
      expect(doc).toBeDefined()
      expect(doc.tipo).toBe('curp')
      expect(doc.estado).toBe('pendiente')
      expect(doc.nombreUsuario).toBe('Juan Pérez')
      expect(doc.emailUsuario).toBe('usuario@test.com')
    })

    it('POST aprobar: cambia estado a aprobado', async () => {
      const res = await request(http)
        .post(`/api/administracion/documentos-identidad/${docId}/aprobar`)
        .set('Authorization', token('uid-admin'))

      expect(res.status).toBe(204)

      // Verificar que el documento se aprobó
      const doc = await leerDoc('documentosIdentidad', docId)
      expect(doc.estado).toBe('aprobado')
      expect(doc.fechaRevision).toBeDefined()
    })

    it('POST aprobar: el estado del usuario cambia a aprobado', async () => {
      await request(http)
        .post(`/api/administracion/documentos-identidad/${docId}/aprobar`)
        .set('Authorization', token('uid-admin'))

      // Verificar el estado de validación del usuario
      const res = await request(http)
        .get('/api/usuarios/estado-validacion-identidad')
        .set('Authorization', token('uid-usuario'))

      expect(res.status).toBe(200)
      expect(res.body.estado).toBe('aprobado')
    })

    it('POST rechazar: cambia estado a rechazado con motivo', async () => {
      const res = await request(http)
        .post(`/api/administracion/documentos-identidad/${docId}/rechazar`)
        .set('Authorization', token('uid-admin'))
        .send({ motivo: 'Imagen borrosa, no se lee la CURP' })

      expect(res.status).toBe(204)

      // Verificar que el documento se rechazó
      const doc = await leerDoc('documentosIdentidad', docId)
      expect(doc.estado).toBe('rechazado')
      expect(doc.motivoRechazo).toBe('Imagen borrosa, no se lee la CURP')
      expect(doc.fechaRevision).toBeDefined()
    })

    it('POST rechazar: el estado del usuario cambia a rechazado', async () => {
      await request(http)
        .post(`/api/administracion/documentos-identidad/${docId}/rechazar`)
        .set('Authorization', token('uid-admin'))
        .send({ motivo: 'Documento ilegible' })

      const res = await request(http)
        .get('/api/usuarios/estado-validacion-identidad')
        .set('Authorization', token('uid-usuario'))

      expect(res.status).toBe(200)
      expect(res.body.estado).toBe('rechazado')
      expect(res.body.motivoRechazo).toBe('Documento ilegible')
    })

    it('POST rechazar: 400 si no se envía motivo', async () => {
      const res = await request(http)
        .post(`/api/administracion/documentos-identidad/${docId}/rechazar`)
        .set('Authorization', token('uid-admin'))
        .send({})

      expect(res.status).toBe(400)
    })

    it('POST aprobar: 404 si documento no existe', async () => {
      const res = await request(http)
        .post('/api/administracion/documentos-identidad/no-existe-id/aprobar')
        .set('Authorization', token('uid-admin'))

      expect(res.status).toBe(404)
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Flujo completo: subir → aprobar → verificar estado
  // ══════════════════════════════════════════════════════════════════════════

  describe('Flujo completo de validación', () => {
    it('subir CURP + identificación → aprobar ambas → estado aprobado', async () => {
      // 1. Subir CURP
      const res1 = await request(http)
        .post('/api/usuarios/documento-identidad')
        .set('Authorization', token('uid-usuario'))
        .field('tipo', 'curp')
        .field('numeroCurp', 'GAPL800101HMCYRL09')
        .attach('documento', crearPdfFake(), { filename: 'curp.pdf', contentType: 'application/pdf' })
      expect(res1.status).toBe(201)

      // 2. Subir identificación
      const res2 = await request(http)
        .post('/api/usuarios/documento-identidad')
        .set('Authorization', token('uid-usuario'))
        .field('tipo', 'identificacion_oficial')
        .attach('documento', crearJpegFake(), { filename: 'ine.jpg', contentType: 'image/jpeg' })
      expect(res2.status).toBe(201)

      // 3. Verificar estado pendiente
      const estado1 = await request(http)
        .get('/api/usuarios/estado-validacion-identidad')
        .set('Authorization', token('uid-usuario'))
      expect(estado1.body.estado).toBe('pendiente')
      expect(estado1.body.tieneCurp).toBe(true)
      expect(estado1.body.tieneIdentificacion).toBe(true)

      // 4. Obtener documentos pendientes como admin
      const pendientes = await request(http)
        .get('/api/administracion/documentos-identidad/pendientes')
        .set('Authorization', token('uid-admin'))
      expect(pendientes.body.datos.length).toBe(2)

      // 5. Aprobar ambos documentos
      for (const doc of pendientes.body.datos) {
        const aprobarRes = await request(http)
          .post(`/api/administracion/documentos-identidad/${doc.id}/aprobar`)
          .set('Authorization', token('uid-admin'))
        expect(aprobarRes.status).toBe(204)
      }

      // 6. Verificar estado final: aprobado
      const estadoFinal = await request(http)
        .get('/api/usuarios/estado-validacion-identidad')
        .set('Authorization', token('uid-usuario'))
      expect(estadoFinal.body.estado).toBe('aprobado')
    })
  })
})
