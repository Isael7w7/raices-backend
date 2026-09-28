import { Test, TestingModule } from '@nestjs/testing'
import { OnboardingService, SECCIONES_ONBOARDING } from './onboarding.service'
import { FIRESTORE } from '../../database/firebase.provider'

describe('OnboardingService', () => {
  let service: OnboardingService
  let firestoreMock: Record<string, any>

  /** Doc de borrador / perfil / extendido simulados por colección. */
  function mockearFuentes(opts: {
    borrador?: Record<string, any> | null
    perfil?: Record<string, any> | null
    extendido?: Record<string, any> | null
    dependientes?: Record<string, any>[]
    onSet?: jest.Mock
  } = {}) {
    const setMock = opts.onSet ?? jest.fn().mockResolvedValue(undefined)
    firestoreMock.collection.mockImplementation((nombre: string) => {
      if (nombre === 'borradoresOnboarding') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: !!opts.borrador, data: () => opts.borrador }),
            set: setMock,
          }),
        }
      }
      if (nombre === 'perfiles') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: !!opts.perfil, data: () => opts.perfil }),
          }),
        }
      }
      if (nombre === 'perfilesExtendidos') {
        return {
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({
            empty: !opts.extendido,
            docs: opts.extendido ? [{ data: () => opts.extendido }] : [],
          }),
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
    return setMock
  }

  beforeEach(async () => {
    firestoreMock = { collection: jest.fn() }
    const module: TestingModule = await Test.createTestingModule({
      providers: [OnboardingService, { provide: FIRESTORE, useValue: firestoreMock }],
    }).compile()
    service = module.get<OnboardingService>(OnboardingService)
  })

  // ── saveDraft: guardado parcial ────────────────────────────────────

  describe('saveDraft', () => {
    it('guarda un payload incompleto SIN lanzar 400 por campos faltantes', async () => {
      const setMock = mockearFuentes()

      const resultado = await service.saveDraft('u1', { historialTerapia: ['fisioterapia'] } as any)

      expect(setMock).toHaveBeenCalledTimes(1)
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
      const setMock = mockearFuentes({
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
      const guardado = setMock.mock.calls[0][0]
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

    it('recalcula porcentajeProgreso y ultimoPasoCompletado correctamente', async () => {
      // 15 campos en total; 5 respondidos (3 de datosGenerales + 2 de historialEducativo)
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
      expect(resultado.porcentajeProgreso).toBe(Math.round((5 / 15) * 100)) // 33
      expect(resultado.pasosPendientes).toEqual([
        'terapias',
        'perfilNecesidades',
        'escalasVida',
        'preferencias',
        'observacionesGenerales',
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
      mockearFuentes({
        borrador: {
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
        },
      })

      const resultado = await service.saveDraft('u1', {} as any)

      expect(resultado.onboardingCompleto).toBe(true)
      expect(resultado.porcentajeProgreso).toBe(100)
      expect(resultado.ultimoPasoCompletado).toBe(SECCIONES_ONBOARDING.length)
      expect(resultado.pasosPendientes).toEqual([])
    })

    it('sumando respuestas al perfil extendido existente el progreso sube', async () => {
      // Base desde perfil: curp + historial educativo ya contestados en el registro
      const setMock = mockearFuentes({
        perfil: { curp: 'GAPL800101MCYRL093', fechaNacimiento: '2015-03-15', ciudad: 'Mérida' },
        extendido: { historialEducacion: JSON.stringify(['educacion_especial']) },
      })

      const resultado = await service.saveDraft('u1', { etapaVida: 'infancia' } as any)

      // datosGenerales (3) + historialEducacion + etapaVida = 5 de 15
      expect(resultado.porcentajeProgreso).toBe(Math.round((5 / 15) * 100))
      expect(resultado.ultimoPasoCompletado).toBe(2)
      // La base del perfil no se persiste en el documento del borrador
      expect(setMock.mock.calls[0][0].curp).toBeUndefined()
      expect(setMock.mock.calls[0][0].etapaVida).toBe('infancia')
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
        porcentajeProgreso: expect.any(Number),
        ultimoPasoCompletado: 1,
        destinatarioPerfil: 'PARA_MI_HIJO',
        nombrePcd: 'Diego',
        pasosPendientes: expect.arrayContaining(['historialEducativo', 'terapias']),
      })
      expect(estado.pasosPendientes).not.toContain('datosGenerales')
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
      mockearFuentes({})

      const estado = await service.obtenerEstado('u1')

      expect(estado.onboardingCompleto).toBe(false)
      expect(estado.porcentajeProgreso).toBe(0)
      expect(estado.ultimoPasoCompletado).toBe(0)
      expect(estado.pasosPendientes).toEqual(SECCIONES_ONBOARDING.map(s => s.clave))
      expect(estado.nombrePcd).toBeNull()
    })

    it('no lanza 500 si Firestore falla: responde estado "sin avanzar"', async () => {
      firestoreMock.collection.mockImplementation(() => {
        throw new Error('The collection does not exist')
      })

      const estado = await service.obtenerEstado('u1')

      expect(estado.onboardingCompleto).toBe(false)
      expect(estado.porcentajeProgreso).toBe(0)
      expect(estado.pasosPendientes).toHaveLength(SECCIONES_ONBOARDING.length)
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

  // ── SECCIONES_ONBOARDING ───────────────────────────────────────────

  describe('SECCIONES_ONBOARDING', () => {
    it('la clave de ejemplo del contrato (historialEducativo, terapias) existe y el total de campos es 15', () => {
      const claves = SECCIONES_ONBOARDING.map(s => s.clave)
      expect(claves).toContain('historialEducativo')
      expect(claves).toContain('terapias')
      const totalCampos = SECCIONES_ONBOARDING.reduce((suma, s) => suma + s.campos.length, 0)
      expect(totalCampos).toBe(15)
    })
  })
})
