import { crearAppE2E } from './helpers/app.e2e'
import { limpiarDb, sembrarPerfil, token, dbE2E, leerDoc } from './helpers/fixtures'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

/**
 * E2E del cierre del onboarding (fin del formulario de perfilado, paso 16).
 *
 * Reproduce el bucle reportado: el modal "Completa tu perfil" reaparecía
 * indefinidamente con 33%/75% de avance aunque el usuario hubiera terminado.
 * Aquí se verifica el circuito completo por HTTP: autoguardado parcial,
 * consolidación final y lectura del estado ya actualizado.
 */
describe('Onboarding: cierre del formulario de perfilado (E2E)', () => {
  let app: INestApplication
  let http: any

  const USUARIO = 'uid-onboarding'

  /** Respuestas que cubren las 6 secciones obligatorias (14 campos). */
  const RESPUESTAS_OBLIGATORIAS = {
    fechaNacimiento: '2015-03-15',
    curp: 'GAPL800101HMCYRL09',
    ciudad: 'Mérida',
    historialEducacion: ['educacion_regular'],
    etapaVida: 'infancia',
    historialTerapia: ['fisioterapia'],
    tieneDiagnostico: true,
    tiposDiscapacidad: ['tea'],
    necesidades: ['apoyo_social'],
    metasActuales: ['escuela'],
    escalasVida: { autonomia: 3 },
    preferenciasAcompanamiento: 'recomendaciones_paso',
    tonoContextual: 'empatico',
    areasInteres: ['educacion'],
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
    await sembrarPerfil({ id: USUARIO, email: 'onboarding@test.com', rol: 'pcd', activo: true })
  })

  // ─── Guardado parcial persistente ─────────────────────────────────

  describe('POST /api/onboarding/borrador', () => {
    it('401: sin token', async () => {
      const res = await request(http).post('/api/onboarding/borrador').send({ ciudad: 'Mérida' })
      expect(res.status).toBe(401)
    })

    it('guarda un paso parcial y conserva lo anterior al refrescar / cambiar de paso', async () => {
      const auth = { Authorization: token(USUARIO) }

      // Paso 1: datos generales
      await request(http).post('/api/onboarding/borrador').set(auth).send({
        fechaNacimiento: '2015-03-15',
        curp: 'GAPL800101HMCYRL09',
        ciudad: 'Mérida',
      }).expect(200)

      // Cambio de pantalla: payload parcial de otro paso
      await request(http).post('/api/onboarding/borrador').set(auth).send({
        historialEducacion: ['educacion_regular'],
        etapaVida: 'infancia',
      }).expect(200)

      // Refresco: el payload no trae los datos generales y NO deben perderse
      await request(http).post('/api/onboarding/borrador').set(auth).send({
        historialTerapia: ['fisioterapia'],
      }).expect(200)

      const borrador = await leerDoc('borradoresOnboarding', USUARIO)
      expect(borrador.curp).toBe('GAPL800101HMCYRL09')
      expect(borrador.ciudad).toBe('Mérida')
      expect(borrador.historialEducacion).toEqual(['educacion_regular'])
      expect(borrador.etapaVida).toBe('infancia')
      expect(borrador.historialTerapia).toEqual(['fisioterapia'])
    })
  })

  // ─── Estado y etiquetas amigables ────────────────────────────────

  describe('GET /api/onboarding/estado', () => {
    it('401: sin token', async () => {
      const res = await request(http).get('/api/onboarding/estado')
      expect(res.status).toBe(401)
    })

    it('usuario nuevo: 0% y seccionesFaltantes con etiqueta amigable (no claves técnicas)', async () => {
      const res = await request(http).get('/api/onboarding/estado').set('Authorization', token(USUARIO)).expect(200)

      expect(res.body.completado).toBe(false)
      expect(res.body.onboardingCompleto).toBe(false)
      expect(res.body.porcentajeProgreso).toBe(0)
      expect(res.body.seccionesFaltantes.length).toBeGreaterThan(0)
      for (const seccion of res.body.seccionesFaltantes) {
        expect(typeof seccion.etiqueta).toBe('string')
        expect(seccion.etiqueta.length).toBeGreaterThan(0)
        expect(seccion.etiqueta).not.toBe(seccion.clave)
      }
      expect(res.body.seccionesFaltantes[0].etiqueta).toBe('Datos generales')
    })

    it('las preferencias ya guardadas en /usuarios/perfil cuentan como respondidas', async () => {
      // Estas dos respuestas viven en el documento `perfiles`, no en el
      // borrador: si baseDesdePerfil no las leyera, la sección "preferencias"
      // nunca cerraría y el modal volvería a pedir el perfil.
      const res = await request(http)
        .put('/api/usuarios/perfil')
        .set('Authorization', token(USUARIO))
        .send({ preferenciasAcompanamiento: 'recomendaciones_paso', tonoContextual: 'empatico' })
        .expect(200)

      const estado = await request(http).get('/api/onboarding/estado').set('Authorization', token(USUARIO)).expect(200)
      const preferencias = estado.body.seccionesFaltantes.find((s: any) => s.clave === 'preferencias')

      expect(preferencias?.camposFaltantes ?? []).not.toContain('preferenciasAcompanamiento')
      expect(preferencias?.camposFaltantes ?? []).not.toContain('tonoContextual')
      // areasInteres sigue pendiente: vive en perfilesExtendidos
      expect(preferencias?.camposFaltantes).toEqual(['areasInteres'])
      expect(res.body.perfilNecesidades).toBeDefined()
    })
  })

  // ─── Consolidación final ─────────────────────────────────────────

  describe('POST /api/onboarding/completar', () => {
    it('401: sin token', async () => {
      const res = await request(http).post('/api/onboarding/completar')
      expect(res.status).toBe(401)
    })

    it('consolida el formulario completo: perfil al 100% y promoción a perfilesExtendidos', async () => {
      const auth = { Authorization: token(USUARIO) }

      // El Frontend autoguarda paso a paso
      await request(http).post('/api/onboarding/borrador').set(auth).send(RESPUESTAS_OBLIGATORIAS).expect(200)

      // Estado previo: aún no cerrado
      const antes = await request(http).get('/api/onboarding/estado').set(auth).expect(200)
      expect(antes.body.completado).toBe(true)
      expect(antes.body.porcentajeProgreso).toBe(100)
      expect(antes.body.seccionesFaltantes).toEqual([])

      // Confirmación del paso 16
      const res = await request(http).post('/api/onboarding/completar').set(auth).expect(200)

      expect(res.body.completado).toBe(true)
      expect(res.body.onboardingCompleto).toBe(true)
      expect(res.body.porcentajeProgreso).toBe(100)
      expect(res.body.seccionesFaltantes).toEqual([])
      expect(res.body.consolidado).toBe(true)

      // 1) El perfil queda marcado al 100%
      const perfil = await leerDoc('perfiles', USUARIO)
      expect(perfil.onboardingCompleto).toBe(true)
      expect(perfil.porcentajeProgreso).toBe(100)
      expect(perfil.curp).toBe('GAPL800101HMCYRL09')
      expect(perfil.preferenciasAcompanamiento).toBe('recomendaciones_paso')
      expect(perfil.fechaOnboardingCompletado).toEqual(expect.any(String))

      // 2) Las respuestas se promovieron a la colección definitiva
      const extSnap = await dbE2E().collection('perfilesExtendidos').where('usuarioId', '==', USUARIO).limit(1).get()
      expect(extSnap.empty).toBe(false)
      const extendido = extSnap.docs[0].data()
      expect(JSON.parse(extendido.tiposDiscapacidad)).toEqual(['tea'])
      expect(JSON.parse(extendido.necesidades)).toEqual(['apoyo_social'])
      expect(JSON.parse(extendido.historialTerapia)).toEqual(['fisioterapia'])
      expect(extendido.etapaVida).toBe('infancia')
      expect(extendido.escalasVida).toEqual({ autonomia: 3 })
      expect(extendido.tieneDiagnostico).toBe(true)
      expect(extendido.onboardingCompleto).toBe(true)
    })

    it('el cierre es idempotente: repetirlo no rompe nada', async () => {
      const auth = { Authorization: token(USUARIO) }
      await request(http).post('/api/onboarding/borrador').set(auth).send(RESPUESTAS_OBLIGATORIAS).expect(200)

      await request(http).post('/api/onboarding/completar').set(auth).expect(200)
      const res = await request(http).post('/api/onboarding/completar').set(auth).expect(200)

      expect(res.body.porcentajeProgreso).toBe(100)
      expect(res.body.completado).toBe(true)
    })

    it('para un tutor NO exige documentos de acreditación y aun así cierra al 100%', async () => {
      await sembrarPerfil({
        id: USUARIO,
        email: 'tutor@test.com',
        rol: 'padre_tutor',
        destinatarioRegistro: 'para_hijo',
        activo: true,
      })
      const auth = { Authorization: token(USUARIO) }

      await request(http).post('/api/onboarding/borrador').set(auth).send(RESPUESTAS_OBLIGATORIAS).expect(200)
      const res = await request(http).post('/api/onboarding/completar').set(auth).expect(200)

      expect(res.body.completado).toBe(true)
      const perfil = await leerDoc('perfiles', USUARIO)
      expect(perfil.onboardingCompleto).toBe(true)
      expect(perfil.porcentajeProgreso).toBe(100)
      // Acreditación registrada, nunca bloqueante
      expect(perfil.estadoAcreditacionTutor).toBe('pendiente')
    })
  })

  // ─── Cierre implícito vía el guardado del perfil ─────────────────

  describe('POST /api/usuarios/perfil-necesidades consolida el onboarding', () => {
    it('marca el 100% cuando el formulario ya está completo', async () => {
      const auth = { Authorization: token(USUARIO) }

      // Lo que el Frontend ya había ido guardando en el perfil
      await request(http).put('/api/usuarios/perfil').set(auth).send({
        fechaNacimiento: '2015-03-15',
        curp: 'GAPL800101HMCYRL09',
        ciudad: 'Mérida',
        preferenciasAcompanamiento: 'recomendaciones_paso',
        tonoContextual: 'empatico',
      }).expect(200)
      await request(http).post('/api/usuarios/escalas-vida').set(auth).send({
        nivelAutonomia: 3,
        nivelIndependencia: 3,
        nivelComunicacion: 3,
        nivelComprension: 3,
        nivelEnergia: 3,
        nivelMovilidad: 3,
        nivelSocial: 3,
        nivelEmocional: 3,
        tieneDiagnostico: true,
        areasInteres: ['educacion'],
      }).expect(201)
      await request(http).post('/api/onboarding/borrador').set(auth).send({
        historialEducacion: ['educacion_regular'],
        etapaVida: 'infancia',
        historialTerapia: ['fisioterapia'],
      }).expect(200)

      // Último paso: el frontend confirma con el guardado de necesidades
      await request(http).post('/api/usuarios/perfil-necesidades').set(auth).send({
        tiposDiscapacidad: ['tea'],
        necesidades: ['apoyo_social'],
        metasActuales: ['escuela'],
      }).expect(201)

      const perfil = await leerDoc('perfiles', USUARIO)
      expect(perfil.onboardingCompleto).toBe(true)
      expect(perfil.porcentajeProgreso).toBe(100)

      // Y la lectura ya devuelve el estado cerrado (sin 304 con datos viejos)
      const estado = await request(http).get('/api/onboarding/estado').set(auth).expect(200)
      expect(estado.body.completado).toBe(true)
      expect(estado.body.porcentajeProgreso).toBe(100)
      expect(estado.body.seccionesFaltantes).toEqual([])
    })

    it('NO fabrica un 100% falso si el formulario sigue incompleto', async () => {
      const auth = { Authorization: token(USUARIO) }

      await request(http).post('/api/usuarios/perfil-necesidades').set(auth).send({
        tiposDiscapacidad: ['tea'],
      }).expect(201)

      const perfil = await leerDoc('perfiles', USUARIO)
      expect(perfil.onboardingCompleto).toBe(false)
      expect(perfil.porcentajeProgreso).toBeLessThan(100)

      const estado = await request(http).get('/api/onboarding/estado').set(auth).expect(200)
      expect(estado.body.completado).toBe(false)
      expect(estado.body.seccionesFaltantes.length).toBeGreaterThan(0)
    })
  })
})