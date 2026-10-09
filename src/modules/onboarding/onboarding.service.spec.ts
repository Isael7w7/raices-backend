import { Test, TestingModule } from '@nestjs/testing'
import {
  CAMPOS_ONBOARDING,
  OnboardingService,
  SECCIONES_BLOQUEANTES,
  SECCIONES_ONBOARDING,
} from './onboarding.service'
import { FIRESTORE } from '../../database/firebase.provider'
import { ETagInterceptor } from '../../common/interceptors/etag.interceptor'

/** Respuestas que cubren TODAS las secciones obligatorias del onboarding. */
const ONBOARDING_COMPLETO = {
  fechaNacimiento: '2015-03-15',
  curp: 'GAPL800101MCYRL093',
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
  observacionesGenerales: 'Todo en orden',
}

/** Mocks de escritura devueltos por `mockearFuentes`, uno por colección. */
interface Escrituras {
  setBorrador: jest.Mock
  updateExtendido: jest.Mock
  createExtendido: jest.Mock
  setPerfil: jest.Mock
}

describe('OnboardingService', () => {
  let service: OnboardingService
  let firestoreMock: Record<string, any>
  let limpiarCache: jest.SpyInstance

  /**
   * Simula las fuentes de lectura (borrador / perfil / extendido /
   * dependientes) y devuelve los mocks de escritura por colección.
   */
  function mockearFuentes(opts: {
    borrador?: Record<string, any> | null
    perfil?: Record<string, any> | null
    extendido?: Record<string, any> | null
    dependientes?: Record<string, any>[]
  } = {}): Escrituras {
    const setBorrador = jest.fn().mockResolvedValue(undefined)
    const updateExtendido = jest.fn().mockResolvedValue(undefined)
    const createExtendido = jest.fn().mockResolvedValue(undefined)
    const setPerfil = jest.fn().mockResolvedValue(undefined)

    firestoreMock.collection.mockImplementation((nombre: string) => {
      if (nombre === 'borradoresOnboarding') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: !!opts.borrador, data: () => opts.borrador }),
            set: setBorrador,
          }),
        }
      }
      if (nombre === 'perfiles') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: !!opts.perfil, data: () => opts.perfil }),
            set: setPerfil,
          }),
        }
      }
      if (nombre === 'perfilesExtendidos') {
        return {
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({
            empty: !opts.extendido,
            docs: opts.extendido ? [{ id: 'ext-1', data: () => opts.extendido }] : [],
          }),
          doc: jest.fn().mockImplementation((id?: string) => ({
            id: id ?? 'ext-nuevo',
            update: updateExtendido,
            set: createExtendido,
          })),
        }
      }
      if (nombre === 'dependientes') {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({
            docs: (opts.dependientes ?? []).map(d => ({ data: () => d })),
          }),
        }
      }
      return { doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue({ exists: false }) }) }
    })

    return { setBorrador, updateExtendido, createExtendido, setPerfil }
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    limpiarCache = jest.spyOn(ETagInterceptor, 'clearUsuarioCache').mockImplementation(() => undefined)

    firestoreMock = { collection: jest.fn() }
    const module: TestingModule = await Test.createTestingModule({
      providers: [OnboardingService, { provide: FIRESTORE, useValue: firestoreMock }],
    }).compile()
    service = module.get<OnboardingService>(OnboardingService)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  // ── saveDraft: guardado parcial ────────────────────────────────────

  describe('saveDraft', () => {
    it('guarda un payload incompleto SIN lanzar 400 por campos faltantes', async () => {
      const escrituras = mockearFuentes()

      const resultado = await service.saveDraft('u1', { historialTerapia: ['fisioterapia'] } as any)

      expect(escrituras.setBorrador).toHaveBeenCalledTimes(1)
      expect(resultado.borrador).toEqual({ historialTerapia: ['fisioterapia'] })
      expect(resultado.pasosPendientes).toContain('datosGenerales')
      // La sección 'terapias' pide historialTerapia Y tieneDiagnostico: aún falta una
      expect(resultado.pasosPendientes).toContain('terapias')
      expect(resultado.onboardingCompleto).toBe(false)
    })

    it('acepta un payload vacío (solo re-calcula progreso) sin error', async () => {
      mockearFuentes({ borrador: { curp: 'GAPL800101MCYRL093' } })

      const resultado = await service.saveDraft('u1', {} as any)

      expect(resultado.borrador).toEqual({ curp: 'GAPL800101MCYRL093' })
    })

    it('la fusión mantiene los datos guardados previamente', async () => {
      const escrituras = mockearFuentes({
        borrador: {
          fechaNacimiento: '2015-03-15',
          curp: 'GAPL800101MCYRL093',
          historialEducacion: ['educacion_especial'],
        },
      })

      // Payload parcial: solo toca la sección de terapias
      const resultado = await service.saveDraft('u1', {
        historialTerapia: ['terapia_de_habla'],
        tieneDiagnostico: true,
      } as any)

      expect(resultado.borrador.fechaNacimiento).toBe('2015-03-15')
      expect(resultado.borrador.curp).toBe('GAPL800101MCYRL093')
      expect(resultado.borrador.historialEducacion).toEqual(['educacion_especial'])
      expect(resultado.borrador.historialTerapia).toEqual(['terapia_de_habla'])
      expect(resultado.borrador.tieneDiagnostico).toBe(true)

      // Lo persistido también conserva lo previo
      const guardado = escrituras.setBorrador.mock.calls[0][0]
      expect(guardado.fechaNacimiento).toBe('2015-03-15')
      expect(guardado.historialTerapia).toEqual(['terapia_de_habla'])
      expect(guardado.usuarioId).toBe('u1')
      expect(guardado.fechaActualizacion).toEqual(expect.any(String))
    })

    it('NO sobrescribe información previa con null o undefined del payload', async () => {
      mockearFuentes({
        borrador: { ciudad: 'Mérida', curp: 'GAPL800101MCYRL093' },
      })

      const resultado = await service.saveDraft('u1', {
        ciudad: null,
        curp: undefined,
        etapaVida: 'adolescencia',
      } as any)

      expect(resultado.borrador.ciudad).toBe('Mérida')
      expect(resultado.borrador.curp).toBe('GAPL800101MCYRL093')
      expect(resultado.borrador.etapaVida).toBe('adolescencia')
    })

    it('persiste con merge (UPSERT) para que refrescar o cambiar de paso no borre respuestas', async () => {
      const escrituras = mockearFuentes({ borrador: { curp: 'GAPL800101MCYRL093' } })

      await service.saveDraft('u1', { ciudad: 'Mérida' } as any)

      expect(escrituras.setBorrador.mock.calls[0][1]).toEqual({ merge: true })
    })

    it('invalida la caché ETag del usuario tras cada guardado', async () => {
      mockearFuentes()

      await service.saveDraft('u1', { ciudad: 'Mérida' } as any)

      expect(limpiarCache).toHaveBeenCalledWith('u1')
    })

    it('recalcula porcentajeProgreso y ultimoPasoCompletado correctamente', async () => {
      // 14 campos obligatorios; 5 respondidos (3 de datosGenerales + 2 de historialEducativo)
      mockearFuentes({
        borrador: {
          fechaNacimiento: '2015-03-15',
          curp: 'GAPL800101MCYRL093',
          ciudad: 'Mérida',
          historialEducacion: ['educacion_regular'],
          etapaVida: 'infancia',
        },
      })

      const resultado = await service.saveDraft('u1', {} as any)

      expect(resultado.ultimoPasoCompletado).toBe(2) // datosGenerales + historialEducativo
      expect(resultado.porcentajeProgreso).toBe(Math.round((5 / 14) * 100))
      expect(resultado.pasosPendientes).toEqual([
        'terapias',
        'perfilNecesidades',
        'escalasVida',
        'preferencias',
      ])
      expect(resultado.onboardingCompleto).toBe(false)
    })

    it('cuenta tieneDiagnostico=false como respondido (false explícito ≠ vacío)', async () => {
      mockearFuentes({
        perfil: { fechaNacimiento: '2015-03-15', curp: 'GAPL800101MCYRL093', ciudad: 'Mérida' },
        extendido: {
          historialEducacion: JSON.stringify(['educacion_regular']),
          etapaVida: 'infancia',
        },
        borrador: {
          historialTerapia: ['fisioterapia'],
          tieneDiagnostico: false,
        },
      })

      const resultado = await service.saveDraft('u1', {} as any)

      expect(resultado.pasosPendientes).not.toContain('terapias')
      expect(resultado.ultimoPasoCompletado).toBe(3)
    })

    it('al completar todas las secciones retorna onboardingCompleto=true y 100%', async () => {
      mockearFuentes({ borrador: ONBOARDING_COMPLETO })

      const resultado = await service.saveDraft('u1', {} as any)

      expect(resultado.onboardingCompleto).toBe(true)
      expect(resultado.porcentajeProgreso).toBe(100)
      expect(resultado.ultimoPasoCompletado).toBe(SECCIONES_BLOQUEANTES.length)
      expect(resultado.pasosPendientes).toEqual([])
      expect(resultado.seccionesFaltantes).toEqual([])
    })

    it('un campo opcional vacío (observaciones) NO frena el 100% [regresión del bucle]', async () => {
      const { observacionesGenerales: _omitido, ...sinObservaciones } = ONBOARDING_COMPLETO
      mockearFuentes({ borrador: sinObservaciones })

      const resultado = await service.saveDraft('u1', {} as any)

      expect(resultado.onboardingCompleto).toBe(true)
      expect(resultado.porcentajeProgreso).toBe(100)
      expect(resultado.seccionesFaltantes).toEqual([])
      // El campo opcional sí se guarda si llega
      expect((await service.saveDraft('u1', { observacionesGenerales: 'Nota' } as any)).borrador.observacionesGenerales).toBe('Nota')
    })

    it('lee las preferencias ya guardadas en perfiles para cerrar la sección "preferencias"', async () => {
      mockearFuentes({
        perfil: {
          fechaNacimiento: '2015-03-15',
          curp: 'GAPL800101MCYRL093',
          ciudad: 'Mérida',
          preferenciasAcompanamiento: 'recomendaciones_paso',
          tonoContextual: 'empatico',
        },
        extendido: {
          historialEducacion: JSON.stringify(['educacion_regular']),
          etapaVida: 'infancia',
          historialTerapia: JSON.stringify(['fisioterapia']),
          tieneDiagnostico: true,
          tiposDiscapacidad: JSON.stringify(['tea']),
          necesidades: JSON.stringify(['apoyo_social']),
          metasActuales: JSON.stringify(['escuela']),
          escalasVida: { autonomia: 3 },
          areasInteres: JSON.stringify(['educacion']),
        },
      })

      const resultado = await service.saveDraft('u1', {} as any)

      // Todo lo del formulario estaba persistido salvo las preferencias, que
      // viven en `perfiles`: deben contar como respondidas.
      expect(resultado.pasosPendientes).not.toContain('preferencias')
      expect(resultado.porcentajeProgreso).toBe(100)
      expect(resultado.onboardingCompleto).toBe(true)
    })

    it('sumando respuestas al perfil extendido existente el progreso sube', async () => {
      // Base desde perfil: curp + historial educativo ya contestados en el registro
      const escrituras = mockearFuentes({
        perfil: { curp: 'GAPL800101MCYRL093', fechaNacimiento: '2015-03-15', ciudad: 'Mérida' },
        extendido: { historialEducacion: JSON.stringify(['educacion_especial']) },
      })

      const resultado = await service.saveDraft('u1', { etapaVida: 'infancia' } as any)

      // datosGenerales (3) + historialEducacion + etapaVida = 5 de 14
      expect(resultado.porcentajeProgreso).toBe(Math.round((5 / 14) * 100))
      expect(resultado.ultimoPasoCompletado).toBe(2)
      // La base del perfil no se persiste en el documento del borrador
      expect(escrituras.setBorrador.mock.calls[0][0].curp).toBeUndefined()
      expect(escrituras.setBorrador.mock.calls[0][0].etapaVida).toBe('infancia')
    })
  })

  // ── obtenerEstado ──────────────────────────────────────────────────

  describe('obtenerEstado', () => {
    it('retorna el contrato completo con destinatarioPerfil PARA_MI_HIJO y nombrePcd del dependiente', async () => {
      mockearFuentes({
        perfil: { destinatarioRegistro: 'para_hijo', rol: 'padre_tutor', nombreCompleto: 'Carlos Pérez' },
        dependientes: [{ tutorId: 'u1', nombreCompleto: 'Diego', esCuentaVinculada: false }],
        borrador: {
          fechaNacimiento: '2015-03-15',
          curp: 'GAPL800101MCYRL093',
          ciudad: 'Mérida',
        },
      })

      const estado = await service.obtenerEstado('u1')

      expect(estado).toEqual({
        onboardingCompleto: false,
        completado: false,
        porcentajeProgreso: expect.any(Number),
        ultimoPasoCompletado: 1,
        destinatarioPerfil: 'PARA_MI_HIJO',
        nombrePcd: 'Diego',
        pasosPendientes: expect.arrayContaining(['historialEducativo', 'preferencias']),
        seccionesFaltantes: expect.any(Array),
        etapas: {
          etapa1: { nombre: 'Conocer quién eres', completada: false, desbloqueada: true, porcentaje: expect.any(Number) },
          etapa2: { nombre: 'Conocer tu día a día', completada: false, desbloqueada: false, porcentaje: 0 },
          etapa3: { nombre: 'Reconocer tus logros e intereses', completada: false, desbloqueada: false, porcentaje: 0 },
        },
        modulosPermitidos: ['inicio', 'perfil_pcd'],
      })
      expect(estado.pasosPendientes).not.toContain('datosGenerales')
      // Regla por rol: al Tutor NO se le exigen las secciones del formulario PCD
      expect(estado.pasosPendientes).not.toContain('terapias')
      expect(estado.pasosPendientes).not.toContain('escalasVida')
      expect(estado.pasosPendientes).not.toContain('perfilNecesidades')
    })

    it('seccionesFaltantes devuelve etiquetas amigables, no claves técnicas', async () => {
      mockearFuentes({ borrador: { curp: 'GAPL800101MCYRL093' } })

      const estado = await service.obtenerEstado('u1')

      expect(estado.seccionesFaltantes.length).toBeGreaterThan(0)
      for (const seccion of estado.seccionesFaltantes) {
        // La etiqueta es texto de interfaz: nunca una clave camelCase.
        expect(seccion.etiqueta).toEqual(expect.any(String))
        expect(seccion.etiqueta).not.toMatch(/^[a-z]+[A-Z]/)
        expect(seccion.etiqueta).not.toBe(seccion.clave)
        expect(seccion.etiqueta.length).toBeGreaterThan(0)
        expect(seccion.camposFaltantes.length).toBeGreaterThan(0)
      }
      // Coinciden una a una con las claves técnicas que ya devolvía pasosPendientes
      expect(estado.seccionesFaltantes.map(s => s.clave)).toEqual(estado.pasosPendientes)
    })

    it('retorna destinatarioPerfil PARA_MI y nombrePcd propio cuando el perfil es del usuario', async () => {
      mockearFuentes({
        perfil: { destinatarioRegistro: 'para_mi', rol: 'pcd', nombreCompleto: 'Ana López' },
        borrador: {},
      })

      const estado = await service.obtenerEstado('u1')

      expect(estado.destinatarioPerfil).toBe('PARA_MI')
      expect(estado.nombrePcd).toBe('Ana López')
    })

    it('sin destinatario registrado infiere PARA_MI_HIJO desde el rol padre_tutor', async () => {
      mockearFuentes({ perfil: { rol: 'padre_tutor', nombreCompleto: 'María' } })

      const estado = await service.obtenerEstado('u1')

      expect(estado.destinatarioPerfil).toBe('PARA_MI_HIJO')
    })

    it('sin datos retornan progreso cero en lugar de fallar (usuario nuevo)', async () => {
      mockearFuentes()

      const estado = await service.obtenerEstado('u1')

      expect(estado.onboardingCompleto).toBe(false)
      expect(estado.completado).toBe(false)
      expect(estado.porcentajeProgreso).toBe(0)
      expect(estado.ultimoPasoCompletado).toBe(0)
      expect(estado.pasosPendientes).toEqual(SECCIONES_BLOQUEANTES.map(s => s.clave))
      expect(estado.seccionesFaltantes).toHaveLength(SECCIONES_BLOQUEANTES.length)
      expect(estado.nombrePcd).toBeNull()
    })

    it('no lanza 500 si Firestore falla: responde estado "sin avanzar" con etiquetas amigables', async () => {
      firestoreMock.collection.mockImplementation(() => {
        throw new Error('The collection does not exist')
      })

      const estado = await service.obtenerEstado('u1')

      expect(estado.onboardingCompleto).toBe(false)
      expect(estado.completado).toBe(false)
      expect(estado.porcentajeProgreso).toBe(0)
      expect(estado.pasosPendientes).toHaveLength(SECCIONES_BLOQUEANTES.length)
      expect(estado.seccionesFaltantes.map(s => s.etiqueta)).toEqual(
        SECCIONES_BLOQUEANTES.map(s => s.etiqueta),
      )
      // Fail-closed: sin estado confiable no se desbloquea nada más allá de la Etapa 1
      expect(estado.etapas.etapa1.desbloqueada).toBe(true)
      expect(estado.etapas.etapa1.completada).toBe(false)
      expect(estado.modulosPermitidos).toEqual(['inicio', 'perfil_pcd'])
    })

    it('ROL TUTOR: exige solo los campos que el formulario del Tutor recopila y alcanza 100%', async () => {
      // Datos que el flujo del Tutor SÍ escribe: registro (fechaNacimiento,
      // curp, ciudad, preferencias) + etapaVida del dependiente. Faltan
      // campos exclusivos del formulario PCD (historialEducacion,
      // tieneDiagnostico, tiposDiscapacidad, tonoContextual, areasInteres).
      mockearFuentes({
        perfil: {
          rol: 'padre_tutor',
          fechaNacimiento: '1990-05-05',
          curp: 'GAPL800101MCYRL093',
          ciudad: 'Mérida',
          preferenciasAcompanamiento: 'recomendaciones_paso',
        },
        borrador: { etapaVida: 'infancia' },
      })

      const estado = await service.obtenerEstado('u1')

      expect(estado.onboardingCompleto).toBe(true)
      expect(estado.completado).toBe(true)
      expect(estado.porcentajeProgreso).toBe(100)
      expect(estado.pasosPendientes).toEqual([])
      expect(estado.seccionesFaltantes).toEqual([])
      expect(estado.etapas.etapa1.completada).toBe(true)
    })

    it('ROL PCD: con los MISMOS datos la regla original sigue exigiendo todas las secciones', async () => {
      mockearFuentes({
        perfil: {
          rol: 'pcd',
          fechaNacimiento: '1990-05-05',
          curp: 'GAPL800101MCYRL093',
          ciudad: 'Mérida',
          preferenciasAcompanamiento: 'recomendaciones_paso',
        },
        borrador: { etapaVida: 'infancia' },
      })

      const estado = await service.obtenerEstado('u1')

      expect(estado.onboardingCompleto).toBe(false)
      expect(estado.porcentajeProgreso).toBeLessThan(100)
      expect(estado.pasosPendientes).toEqual(
        expect.arrayContaining(['historialEducativo', 'terapias', 'escalasVida', 'perfilNecesidades']),
      )
    })

    it('ROL TUTOR: si el backend ya confirmó el cierre (flag), responde 100% aunque falte todo', async () => {
      mockearFuentes({
        perfil: { rol: 'padre_tutor', onboardingCompleto: true, porcentajeProgreso: 100 },
        borrador: {},
      })

      const estado = await service.obtenerEstado('u1')

      expect(estado.onboardingCompleto).toBe(true)
      expect(estado.porcentajeProgreso).toBe(100)
      expect(estado.pasosPendientes).toEqual([])
      expect(estado.seccionesFaltantes).toEqual([])
    })

    it('prefiere la cuenta PCD vinculada para nombrePcd sobre un dependiente plano', async () => {
      mockearFuentes({
        perfil: { destinatarioRegistro: 'para_hijo', rol: 'padre_tutor', nombreCompleto: 'Carlos' },
        dependientes: [
          { tutorId: 'u1', nombreCompleto: 'Hijo plano' },
          { tutorId: 'u1', nombreCompleto: 'Diego', esCuentaVinculada: true, pcdUserId: 'pcd-1' },
        ],
      })

      const estado = await service.obtenerEstado('u1')

      expect(estado.nombrePcd).toBe('Diego')
    })
  })

  // ── Consolidación de cierre (finalización del formulario) ─────────

  describe('completar (consolidación final)', () => {
    it('promueve el borrador a perfilesExtendidos y deja el perfil al 100%', async () => {
      const escrituras = mockearFuentes({ borrador: ONBOARDING_COMPLETO, perfil: { rol: 'pcd' }, extendido: {} })

      const resultado = await service.completar('u1')

      expect(resultado.onboardingCompleto).toBe(true)
      expect(resultado.completado).toBe(true)
      expect(resultado.consolidado).toBe(true)
      expect(resultado.porcentajeProgreso).toBe(100)
      expect(resultado.ultimoPasoCompletado).toBe(SECCIONES_BLOQUEANTES.length)
      expect(resultado.pasosPendientes).toEqual([])
      expect(resultado.seccionesFaltantes).toEqual([])

      // 1) Promoción a la colección definitiva (arreglos como JSON string,
      //    igual que UsersService.saveProfilingData)
      expect(escrituras.updateExtendido).toHaveBeenCalledTimes(1)
      const carga = escrituras.updateExtendido.mock.calls[0][0]
      expect(carga.tiposDiscapacidad).toBe(JSON.stringify(['tea']))
      expect(carga.necesidades).toBe(JSON.stringify(['apoyo_social']))
      expect(carga.metasActuales).toBe(JSON.stringify(['escuela']))
      expect(carga.historialEducacion).toBe(JSON.stringify(['educacion_regular']))
      expect(carga.historialTerapia).toBe(JSON.stringify(['fisioterapia']))
      expect(carga.areasInteres).toBe(JSON.stringify(['educacion']))
      expect(carga.etapaVida).toBe('infancia')
      expect(carga.tonoContextual).toBe('empatico')
      expect(carga.observacionesGenerales).toBe('Todo en orden')
      expect(carga.escalasVida).toEqual({ autonomia: 3 })
      expect(carga.tieneDiagnostico).toBe(true)
      expect(carga.onboardingCompleto).toBe(true)
      expect(carga.porcentajeProgreso).toBe(100)

      // 2) El perfil queda marcado al 100% con UPSERT (merge), no se pisa
      expect(escrituras.setPerfil).toHaveBeenCalledTimes(1)
      const perfilCarga = escrituras.setPerfil.mock.calls[0][0]
      expect(perfilCarga.onboardingCompleto).toBe(true)
      expect(perfilCarga.porcentajeProgreso).toBe(100)
      expect(perfilCarga.curp).toBe('GAPL800101MCYRL093')
      expect(perfilCarga.ciudad).toBe('Mérida')
      expect(perfilCarga.preferenciasAcompanamiento).toBe('recomendaciones_paso')
      expect(perfilCarga.fechaOnboardingCompletado).toEqual(expect.any(String))
      expect(escrituras.setPerfil.mock.calls[0][1]).toEqual({ merge: true })

      // 3) El borrador queda sellado como consolidado
      const borradorGuardado = escrituras.setBorrador.mock.calls[0][0]
      expect(borradorGuardado.consolidado).toBe(true)
      expect(borradorGuardado.onboardingCompleto).toBe(true)
      expect(borradorGuardado.porcentajeProgreso).toBe(100)
      expect(escrituras.setBorrador.mock.calls[0][1]).toEqual({ merge: true })
    })

    it('crea el documento de perfilesExtendidos si el usuario aún no tenía uno', async () => {
      const escrituras = mockearFuentes({ borrador: ONBOARDING_COMPLETO })

      await service.completar('u1')

      expect(escrituras.updateExtendido).not.toHaveBeenCalled()
      expect(escrituras.createExtendido).toHaveBeenCalledTimes(1)
      const creado = escrituras.createExtendido.mock.calls[0][0]
      expect(creado.usuarioId).toBe('u1')
      expect(creado.onboardingCompleto).toBe(true)
      expect(creado.tiposDiscapacidad).toBe(JSON.stringify(['tea']))
    })

    it('cierra al 100% aunque el borrador esté incompleto (confirmación explícita del cierre)', async () => {
      mockearFuentes({ borrador: { curp: 'GAPL800101MCYRL093' } })

      const resultado = await service.completar('u1')

      expect(resultado.porcentajeProgreso).toBe(100)
      expect(resultado.completado).toBe(true)
      expect(resultado.seccionesFaltantes).toEqual([])
    })

    it('no exige documentos de acreditación al tutor: registra el vínculo sin bloquear', async () => {
      const escrituras = mockearFuentes({
        borrador: ONBOARDING_COMPLETO,
        perfil: { rol: 'padre_tutor', destinatarioRegistro: 'para_hijo' },
      })

      const resultado = await service.completar('u1')

      expect(resultado.completado).toBe(true)
      const perfilCarga = escrituras.setPerfil.mock.calls[0][0]
      expect(perfilCarga.estadoAcreditacionTutor).toBe('pendiente')
    })

    it('no sobrescribe una acreditación ya resuelta', async () => {
      const escrituras = mockearFuentes({
        borrador: ONBOARDING_COMPLETO,
        perfil: { rol: 'tutor', estadoAcreditacionTutor: 'aprobado' },
      })

      await service.completar('u1')

      expect(escrituras.setPerfil.mock.calls[0][0].estadoAcreditacionTutor).toBeUndefined()
    })

    it('invalida la caché ETag para que la UI lea el estado actualizado de inmediato', async () => {
      mockearFuentes({ borrador: ONBOARDING_COMPLETO })

      await service.completar('u1')

      expect(limpiarCache).toHaveBeenCalledWith('u1')
    })

    it('es idempotente: repetir el cierre mantiene 100% y no duplica escrituras de perfil', async () => {
      mockearFuentes({ borrador: ONBOARDING_COMPLETO })
      await service.completar('u1')
      limpiarCache.mockClear()

      const resultado = await service.completar('u1')

      expect(resultado.porcentajeProgreso).toBe(100)
      expect(resultado.completado).toBe(true)
      expect(limpiarCache).toHaveBeenCalledWith('u1')
    })

    it('promueve también lo que ya estaba en perfilesExtendidos, sin perder datos', async () => {
      const escrituras = mockearFuentes({
        perfil: { rol: 'pcd' },
        extendido: {
          tiposDiscapacidad: JSON.stringify(['tea']),
          areasApoyo: JSON.stringify(['educacion']),
        },
        borrador: { ...ONBOARDING_COMPLETO, areasInteres: ['deporte'] },
      })

      await service.completar('u1')

      const carga = escrituras.updateExtendido.mock.calls[0][0]
      expect(carga.areasInteres).toBe(JSON.stringify(['deporte']))
      // El resto del documento existente no se toca (update parcial)
      expect(carga.areasApoyo).toBeUndefined()
    })
  })

  describe('consolidar (sin forzar el cierre)', () => {
    it('marca el 100% solo cuando las secciones obligatorias están cubiertas', async () => {
      const escrituras = mockearFuentes({ borrador: ONBOARDING_COMPLETO })

      const resultado = await service.consolidar('u1')

      expect(resultado.onboardingCompleto).toBe(true)
      expect(resultado.porcentajeProgreso).toBe(100)
      expect(escrituras.setPerfil.mock.calls[0][0].onboardingCompleto).toBe(true)
    })

    it('NO fabrica un 100% falso cuando todavía falta algo', async () => {
      const escrituras = mockearFuentes({ borrador: { curp: 'GAPL800101MCYRL093' } })

      const resultado = await service.consolidar('u1')

      expect(resultado.onboardingCompleto).toBe(false)
      // Solo la CURP está respondida: 1 de 14 campos obligatorios
      expect(resultado.porcentajeProgreso).toBe(Math.round((1 / 14) * 100))
      expect(resultado.seccionesFaltantes.length).toBe(SECCIONES_BLOQUEANTES.length)
      expect(escrituras.setPerfil.mock.calls[0][0].onboardingCompleto).toBe(false)
      expect(escrituras.setPerfil.mock.calls[0][0].fechaOnboardingCompletado).toBeUndefined()
    })
  })

  // ── Navegación por etapas ──────────────────────────────────────────

  describe('etapas y modulosPermitidos', () => {
    it('onboarding incompleto: solo Etapa 1 desbloqueada y modulos de esa etapa', async () => {
      mockearFuentes({ borrador: { curp: 'GAPL800101MCYRL093' } })

      const estado = await service.obtenerEstado('u1')

      expect(estado.etapas.etapa1).toEqual({
        nombre: 'Conocer quién eres',
        completada: false,
        desbloqueada: true,
        porcentaje: expect.any(Number),
      })
      // Etapa 2 requiere Etapa 1 completada → bloqueada
      expect(estado.etapas.etapa2.desbloqueada).toBe(false)
      expect(estado.etapas.etapa3.desbloqueada).toBe(false)
      expect(estado.modulosPermitidos).toEqual(['inicio', 'perfil_pcd'])
    })

    it('onboarding completo: Etapa 1 completada desbloquea la Etapa 2 y sus módulos', async () => {
      mockearFuentes({ borrador: ONBOARDING_COMPLETO })

      const estado = await service.obtenerEstado('u1')

      expect(estado.etapas.etapa1.completada).toBe(true)
      expect(estado.etapas.etapa1.porcentaje).toBe(100)
      expect(estado.etapas.etapa2.desbloqueada).toBe(true)
      expect(estado.etapas.etapa2.completada).toBe(false) // módulo pendiente
      expect(estado.etapas.etapa2.porcentaje).toBe(0)
      // Etapa 3 requiere Etapa 2 completada → sigue bloqueada
      expect(estado.etapas.etapa3.desbloqueada).toBe(false)
      expect(estado.modulosPermitidos).toEqual(['inicio', 'perfil_pcd', 'terapias', 'rutinas'])
    })

    it('las etapas 2 y 3 nunca aparecen desbloqueadas sin completar la previa', async () => {
      mockearFuentes({ borrador: ONBOARDING_COMPLETO })

      const estado = await service.obtenerEstado('u1')

      expect(estado.etapas.etapa3.desbloqueada).toBe(false)
      expect(estado.modulosPermitidos).not.toContain('caminos')
      expect(estado.modulosPermitidos).not.toContain('comunidad')
    })

    it('etapaCompletada retorna true solo para la Etapa 1 con onboarding completo', async () => {
      mockearFuentes({ borrador: ONBOARDING_COMPLETO })

      await expect(service.etapaCompletada('u1', 1)).resolves.toBe(true)
      await expect(service.etapaCompletada('u1', 2)).resolves.toBe(false)
      await expect(service.etapaCompletada('u1', 3)).resolves.toBe(false)
    })

    it('etapaCompletada es fail-closed cuando Firestore falla', async () => {
      firestoreMock.collection.mockImplementation(() => {
        throw new Error('The collection does not exist')
      })

      await expect(service.etapaCompletada('u1', 1)).resolves.toBe(false)
    })
  })

  // ── SECCIONES_ONBOARDING ───────────────────────────────────────────

  describe('SECCIONES_ONBOARDING', () => {
    it('expone las claves técnicas de ejemplo y etiqueta amigable en cada sección', () => {
      const claves = SECCIONES_ONBOARDING.map(s => s.clave)
      expect(claves).toContain('historialEducativo')
      expect(claves).toContain('terapias')
      for (const seccion of SECCIONES_ONBOARDING) {
        expect(seccion.etiqueta).toEqual(expect.any(String))
        expect(seccion.etiqueta.trim().length).toBeGreaterThan(0)
      }
    })

    it('14 campos obligatorios gobiernan el porcentaje; el campo opcional no cuenta', () => {
      const totalObligatorios = SECCIONES_ONBOARDING.reduce((suma, s) => suma + s.campos.length, 0)
      expect(totalObligatorios).toBe(14)
      expect(CAMPOS_ONBOARDING).toHaveLength(15) // 14 obligatorios + observacionesGenerales
      expect(SECCIONES_BLOQUEANTES).toHaveLength(6)
      expect(SECCIONES_BLOQUEANTES.map(s => s.clave)).not.toContain('observacionesGenerales')
    })
  })
})