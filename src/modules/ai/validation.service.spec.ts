import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { NotFoundException } from '@nestjs/common'
import { GoogleGenAI } from '@google/genai'
import { ValidationService } from './validation.service'
import { FIRESTORE } from '../../database/firebase.provider'
import type { PerfilDoc, DocumentoIdentidadDoc } from '../../common/interfaces/firestore-documents.interface'
import type { RegistroValidacionIa } from './validation.service'

// ─── Mock de @google/genai ─────────────────────────────────────────────
jest.mock('@google/genai')

// ─── Mock helpers ────────────────────────────────────────────────────────

function mockDoc(data: object | null, exists = true) {
  return { exists, id: 'mock-doc-id', data: () => data }
}

/** RESPUESTA de Gemini con texto plano. */
function geminiResponse(text: string) {
  return { candidates: [{ content: { parts: [{ text }], role: 'model' } }] }
}

interface DatosMock {
  perfil?: PerfilDoc | null
  perfilExtendido?: Record<string, unknown> | null
  documentos?: DocumentoIdentidadDoc[]
  institucion?: Record<string, unknown> | null
  /** Valores almacenados en la colección configuraciones (clave → valor) */
  configuraciones?: Record<string, string>
}

/**
 * Firestore mock que despacha por nombre de colección. Expone:
 *  - batch (set/update/commit) y sus llamadas registradas
 *  - registrosIa: documentos "seteados" en la colección validacionesIA
 */
function crearFirestoreMock(datos: DatosMock = {}) {
  const batch = {
    set: jest.fn(),
    update: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  }
  const registrosIa: unknown[] = []

  const coleccionValidaciones = () => ({
    doc: jest.fn(() => {
      const ref = { id: `reg-${registrosIa.length + 1}` }
      return ref
    }),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({
      empty: (datos.perfil ? [] : []).length === 0,
      docs: [],
      size: 0,
    }),
  })

  const db = {
    batch: jest.fn(() => batch),
    collection: jest.fn((nombre: string) => {
      switch (nombre) {
        case 'perfiles':
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDoc(datos.perfil ?? null, !!datos.perfil)),
            })),
          }
        case 'perfilesExtendidos':
          return {
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({
              empty: !datos.perfilExtendido,
              docs: datos.perfilExtendido ? [{ id: 'ext-1', data: () => datos.perfilExtendido }] : [],
              size: datos.perfilExtendido ? 1 : 0,
            }),
          }
        case 'documentosIdentidad':
          return {
            where: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({
              empty: (datos.documentos ?? []).length === 0,
              docs: (datos.documentos ?? []).map((d, i) => ({
                id: `doc-${i}`,
                data: () => d,
                ref: { id: `doc-${i}` },
              })),
              size: (datos.documentos ?? []).length,
            }),
          }
        case 'instituciones':
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue(mockDoc(datos.institucion ?? null, !!datos.institucion)),
            })),
          }
        case 'configuraciones': {
          const claves = datos.configuraciones ?? {}
          return {
            doc: jest.fn((clave: string) => ({
              get: jest.fn().mockResolvedValue(
                clave in claves
                  ? mockDoc({ clave, valor: claves[clave] })
                  : mockDoc(null, false),
              ),
            })),
          }
        }
        case 'validacionesIA':
          return coleccionValidaciones()
        default:
          return {
            doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) })),
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ empty: true, docs: [], size: 0 }),
          }
      }
    }),
  }

  return { db, batch, registrosIa }
}

/** Config con Vertex AI configurado (usa Gemini real mockeado). */
function configConVertex(): { get: jest.Mock } {
  return {
    get: jest.fn((key: string) => {
      const vars: Record<string, string> = {
        VERTEX_AI_PROJECT_ID: 'test-project',
        VERTEX_AI_LOCATION: 'us-central1',
        VERTEX_AI_MODEL: 'gemini-2.0-flash',
      }
      return vars[key]
    }),
  }
}

/** Config sin proyecto → la IA queda en null y se usa el fallback por reglas. */
function configSinVertex(): { get: jest.Mock } {
  return { get: jest.fn(() => undefined) }
}

/** Respuesta JSON típica de Gemini para validación. */
interface RespuestaGeminiMock {
  aprobado: boolean
  requiereRevisionManual: boolean
  confianza: number
  razonamiento: string
  detalles: {
    nombreCoherente: boolean
    emailCoherente: boolean
    curpCoherente: boolean
    rolCoherente: boolean
    institucionCoherente: boolean
    observaciones: string[]
  }
}

function respuestaGemini(opts: {
  aprobado?: boolean
  requiereRevisionManual?: boolean
  confianza?: number
  razonamiento?: string
  detalles?: Partial<Pick<RespuestaGeminiMock['detalles'], 'nombreCoherente' | 'emailCoherente' | 'curpCoherente' | 'rolCoherente' | 'institucionCoherente'>>
  observaciones?: string[]
}): RespuestaGeminiMock {
  return {
    aprobado: opts.aprobado ?? false,
    requiereRevisionManual: opts.requiereRevisionManual ?? false,
    confianza: opts.confianza ?? 50,
    razonamiento: opts.razonamiento ?? 'Análisis de Gemini',
    detalles: {
      nombreCoherente: true,
      emailCoherente: true,
      curpCoherente: true,
      rolCoherente: true,
      institucionCoherente: true,
      observaciones: opts.observaciones ?? [],
      ...(opts.detalles ?? {}),
    },
  }
}

/** Perfil base coherente (permite calcular confianza alta en modo reglas). */
const PERFIL_BASE: PerfilDoc = {
  id: 'user-1',
  nombreCompleto: 'Juan Pérez López',
  email: 'juan.perez@correo.mx',
  rol: 'pcd',
  curp: 'GAPL800101HMCYRL09', // CURP válida (verificada en curp.validator)
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('ValidationService', () => {
  let svc: ValidationService
  let mockGenerateContent: jest.Mock
  let fs: ReturnType<typeof crearFirestoreMock>

  async function crearServicio(firestore: object, config: object) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidationService,
        { provide: FIRESTORE, useValue: firestore },
        { provide: ConfigService, useValue: config },
      ],
    }).compile()
    return module.get<ValidationService>(ValidationService)
  }

  beforeEach(async () => {
    jest.clearAllMocks()

    mockGenerateContent = jest.fn()
    ;(GoogleGenAI as jest.Mock).mockImplementation(() => ({
      models: { generateContent: mockGenerateContent },
    }))

    fs = crearFirestoreMock({ perfil: { ...PERFIL_BASE } })
    svc = await crearServicio(fs.db, configConVertex())
  })

  // ── validarUsuario: reglas de decisión ──────────────────────────────────

  describe('validarUsuario — reglas de decisión', () => {
    it('confianza >= 80 y criterios clave pasan → aprobado: true, sin revisión manual', async () => {
      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify(respuestaGemini({ confianza: 92, aprobado: true }))),
      )

      const res = await svc.validarUsuario('user-1')

      expect(res.fuente).toBe('gemini')
      expect(res.confianza).toBe(92)
      expect(res.aprobado).toBe(true)
      expect(res.requiereRevisionManual).toBe(false)
    })

    it('confianza 50-79 (dudas menores) → aprobado: false con revisión manual (único caso que va al admin)', async () => {
      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify(respuestaGemini({ confianza: 65, aprobado: false, requiereRevisionManual: true }))),
      )

      const res = await svc.validarUsuario('user-1')

      expect(res.aprobado).toBe(false)
      expect(res.requiereRevisionManual).toBe(true)
    })

    it('confianza < 50 o problemas graves → rechazado sin revisión manual', async () => {
      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify(respuestaGemini({
          confianza: 30,
          detalles: { nombreCoherente: false, emailCoherente: false },
        }))),
      )

      const res = await svc.validarUsuario('user-1')

      expect(res.aprobado).toBe(false)
      expect(res.requiereRevisionManual).toBe(false)
    })

    it('criterio clave fallando con confianza alta → va a revisión manual (no se auto-aprueba)', async () => {
      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify(respuestaGemini({
          confianza: 90,
          aprobado: true,
          detalles: { curpCoherente: false }, // criterio clave falla
        }))),
      )

      const res = await svc.validarUsuario('user-1')

      expect(res.aprobado).toBe(false)
      expect(res.requiereRevisionManual).toBe(true)
    })

    it('problema grave determinista: CURP con formato inválido fija confianza <= 40 y rechaza aunque Gemini diga 95', async () => {
      fs = crearFirestoreMock({ perfil: { ...PERFIL_BASE, curp: 'GAPL800101HXXRLAA9' } }) // XX: entidad inválida
      svc = await crearServicio(fs.db, configConVertex())

      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify(respuestaGemini({ confianza: 95, aprobado: true }))),
      )

      const res = await svc.validarUsuario('user-1')

      expect(res.detalles.curpCoherente).toBe(false)
      expect(res.confianza).toBeLessThanOrEqual(40)
      expect(res.aprobado).toBe(false)
      expect(res.requiereRevisionManual).toBe(false)
    })

    it('parsea JSON envuelto en bloques ```json', async () => {
      mockGenerateContent.mockResolvedValue(
        geminiResponse('```json\n' + JSON.stringify(respuestaGemini({ confianza: 85 })) + '\n```'),
      )

      const res = await svc.validarUsuario('user-1')
      expect(res.fuente).toBe('gemini')
      expect(res.confianza).toBe(85)
    })

    it('parsea JSON dentro de un bloque ```json con texto antes y después (no anclado)', async () => {
      const json = JSON.stringify(respuestaGemini({ confianza: 88, aprobado: true }))
      mockGenerateContent.mockResolvedValue(
        geminiResponse('Aquí está el análisis:\n```json\n' + json + '\n```\nSaludos.'),
      )

      const res = await svc.validarUsuario('user-1')

      expect(res.fuente).toBe('gemini')
      expect(res.confianza).toBe(88)
      expect(res.aprobado).toBe(true)
    })

    it('confianza null de Gemini: usa la confianza por reglas (no la convierte en 0/rechazo)', async () => {
      // Perfil coherente → reglas calculan 75 (20+20+25+10). Antes Number(null)=0
      // lo convertía en rechazo pese a datos coherentes.
      const payload = respuestaGemini({ confianza: 88 }) as unknown as Record<string, unknown>
      payload.confianza = null
      mockGenerateContent.mockResolvedValue(geminiResponse(JSON.stringify(payload)))

      const res = await svc.validarUsuario('user-1')

      expect(res.fuente).toBe('gemini')
      expect(res.confianza).toBe(75)
      expect(res.aprobado).toBe(false)
      expect(res.requiereRevisionManual).toBe(true) // 75 cae en 50-79 → revisión manual
    })

    it('confianza como string numérico de Gemini se acepta ("90" → 90)', async () => {
      const payload = respuestaGemini({}) as unknown as Record<string, unknown>
      payload.confianza = '90'
      mockGenerateContent.mockResolvedValue(geminiResponse(JSON.stringify(payload)))

      const res = await svc.validarUsuario('user-1')

      expect(res.confianza).toBe(90)
      expect(res.aprobado).toBe(true)
    })

    it('recolecta los documentos de identidad y los expone en detalles', async () => {
      fs = crearFirestoreMock({
        perfil: { ...PERFIL_BASE },
        documentos: [{ tipo: 'curp', estado: 'pendiente' }, { tipo: 'identificacion_oficial', estado: 'pendiente' }],
      })
      svc = await crearServicio(fs.db, configConVertex())

      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify(respuestaGemini({ confianza: 95 }))),
      )

      const res = await svc.validarUsuario('user-1')

      expect(res.detalles.documentosPresentes).toEqual(expect.arrayContaining(['curp', 'identificacion_oficial']))
      expect(res.detalles.documentosFaltantes).toEqual(['certificado_discapacidad'])
    })

    it('incluye datos de institución cuando el rol es institucion', async () => {
      fs = crearFirestoreMock({
        perfil: { ...PERFIL_BASE, rol: 'institucion' },
        institucion: { nombre: 'Instituto Vida', categoria: 'funcional', ciudad: 'Mérida' },
      })
      svc = await crearServicio(fs.db, configConVertex())

      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify(respuestaGemini({ confianza: 90 }))),
      )

      const res = await svc.validarUsuario('user-1')

      expect(res.aprobado).toBe(true)
      // El prompt enviado a Gemini contiene los datos de la institución
      const prompt = mockGenerateContent.mock.calls[0][0].contents
      expect(prompt).toContain('Instituto Vida')
      expect(prompt).toContain('funcional')
    })

    it('lanza NotFoundException cuando el usuario no existe', async () => {
      fs = crearFirestoreMock({ perfil: null })
      svc = await crearServicio(fs.db, configConVertex())

      await expect(svc.validarUsuario('user-1')).rejects.toThrow(NotFoundException)
      expect(mockGenerateContent).not.toHaveBeenCalled()
    })
  })

  // ── Mecanismo de fallback: validarPorReglas ─────────────────────────────

  describe('fallback validarPorReglas', () => {
    it('usa reglas de código cuando Vertex AI no está configurado (fuente: reglas)', async () => {
      fs = crearFirestoreMock({ perfil: { ...PERFIL_BASE } })
      svc = await crearServicio(fs.db, configSinVertex())

      const res = await svc.validarUsuario('user-1')

      expect(res.fuente).toBe('reglas')
      expect(mockGenerateContent).not.toHaveBeenCalled()
    })

    it('usa reglas de código cuando Gemini falla (la app no se detiene)', async () => {
      mockGenerateContent.mockRejectedValue(new Error('Vertex AI down'))

      const res = await svc.validarUsuario('user-1')

      expect(res.fuente).toBe('reglas')
    })

    it('usa reglas de código cuando Gemini responde JSON malformado', async () => {
      mockGenerateContent.mockResolvedValue(geminiResponse('esto no es json {{{'))

      const res = await svc.validarUsuario('user-1')
      expect(res.fuente).toBe('reglas')
    })

    it('perfil completo con CURP válida y documentos → aprobado (confianza >= 80)', async () => {
      fs = crearFirestoreMock({
        perfil: { ...PERFIL_BASE },
        perfilExtendido: { usuarioId: 'user-1', etapaVida: 'adulto' },
        documentos: [{ tipo: 'curp', estado: 'pendiente' }],
      })
      svc = await crearServicio(fs.db, configSinVertex())

      const res = await svc.validarUsuario('user-1')

      // 20 nombre + 20 email + 25 curp + 10 rol + 15 documentos + 5 extendido = 95
      expect(res.confianza).toBeGreaterThanOrEqual(80)
      expect(res.aprobado).toBe(true)
      expect(res.requiereRevisionManual).toBe(false)
    })

    it('sin CURP ni documentos → confianza 50-79 → revisión manual (no se auto-aprueba)', async () => {
      fs = crearFirestoreMock({ perfil: { ...PERFIL_BASE, curp: undefined } })
      svc = await crearServicio(fs.db, configSinVertex())

      const res = await svc.validarUsuario('user-1')

      // 20 + 20 + 10 (sin curp) + 10 rol = 60
      expect(res.confianza).toBeGreaterThanOrEqual(50)
      expect(res.confianza).toBeLessThan(80)
      expect(res.aprobado).toBe(false)
      expect(res.requiereRevisionManual).toBe(true)
    })

    it('CURP inválida → rechazado (problema grave)', async () => {
      fs = crearFirestoreMock({ perfil: { ...PERFIL_BASE, curp: 'INVALIDA' } })
      svc = await crearServicio(fs.db, configSinVertex())

      const res = await svc.validarUsuario('user-1')

      expect(res.detalles.curpCoherente).toBe(false)
      expect(res.confianza).toBeLessThan(50)
      expect(res.aprobado).toBe(false)
      expect(res.requiereRevisionManual).toBe(false)
    })

    it('nombre sin apellido o con caracteres extraños → no se auto-aprueba', async () => {
      fs = crearFirestoreMock({ perfil: { ...PERFIL_BASE, nombreCompleto: 'Xx' } })
      svc = await crearServicio(fs.db, configSinVertex())

      const res = await svc.validarUsuario('user-1')

      expect(res.detalles.nombreCoherente).toBe(false)
      expect(res.aprobado).toBe(false)
    })

    it('email con formato inválido → no se auto-aprueba', async () => {
      fs = crearFirestoreMock({ perfil: { ...PERFIL_BASE, email: 'no-es-un-email' } })
      svc = await crearServicio(fs.db, configSinVertex())

      const res = await svc.validarUsuario('user-1')

      expect(res.detalles.emailCoherente).toBe(false)
      expect(res.aprobado).toBe(false)
    })
  })

  // ── validarYAplicar: aplicación atómica ──────────────────────────────────

  describe('validarYAplicar', () => {
    it('aprobado: guarda registro en validacionesIA y actualiza verificado=true en el mismo batch', async () => {
      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify(respuestaGemini({ confianza: 92, aprobado: true }))),
      )

      const registro = await svc.validarYAplicar('user-1')

      expect(registro).not.toBeNull()
      expect(registro!.aprobado).toBe(true)
      expect(registro!.tipo).toBe('automatica')
      expect(registro!.adminId).toBeNull()

      // Registro de auditoría seteado en validacionesIA
      expect(fs.batch.set).toHaveBeenCalledTimes(1)
      const setArgs = fs.batch.set.mock.calls[0]
      expect(setArgs[1].aprobado).toBe(true)
      expect(setArgs[1].usuarioId).toBe('user-1')

      // Perfil actualizado con verificado=true en el mismo batch
      expect(fs.batch.update).toHaveBeenCalledTimes(1)
      const updateArgs = fs.batch.update.mock.calls[0]
      expect(updateArgs[1].verificado).toBe(true)
      expect(updateArgs[1].metodoVerificacion).toBe('ia')

      // Todo committed atómicamente
      expect(fs.batch.commit).toHaveBeenCalledTimes(1)
    })

    it('aprobado con documentos pendientes: los aprueba en el mismo batch', async () => {
      fs = crearFirestoreMock({
        perfil: { ...PERFIL_BASE },
        documentos: [{ tipo: 'curp', estado: 'pendiente' }, { tipo: 'identificacion_oficial', estado: 'aprobado' }],
      })
      svc = await crearServicio(fs.db, configConVertex())
      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify(respuestaGemini({ confianza: 92, aprobado: true }))),
      )

      await svc.validarYAplicar('user-1')

      // 1 update de perfil + 1 update del documento pendiente
      expect(fs.batch.update).toHaveBeenCalledTimes(2)
      const updates = fs.batch.update.mock.calls.map(c => c[1])
      expect(updates.some(u => u.estado === 'aprobado' && u.revisadoPor === 'ia')).toBe(true)
      expect(updates.some(u => u.verificado === true)).toBe(true)
    })

    it('requiereRevisionManual: guarda el registro pero NO toca verificado', async () => {
      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify(respuestaGemini({ confianza: 65, requiereRevisionManual: true }))),
      )

      const registro = await svc.validarYAplicar('user-1')

      expect(registro!.aprobado).toBe(false)
      expect(registro!.requiereRevisionManual).toBe(true)

      const updateArgs = fs.batch.update.mock.calls[0]
      expect(updateArgs[1].verificado).toBeUndefined()
    })

    it('rechazado: verificado=false sin revisión manual', async () => {
      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify(respuestaGemini({
          confianza: 20,
          detalles: { nombreCoherente: false, emailCoherente: false },
        }))),
      )

      const registro = await svc.validarYAplicar('user-1')

      expect(registro!.aprobado).toBe(false)
      expect(registro!.requiereRevisionManual).toBe(false)
      expect(fs.batch.update.mock.calls[0][1].verificado).toBe(false)
      // En rechazo NO debe existir fecha/método de verificación (cuenta sin verificar)
      expect(fs.batch.update.mock.calls[0][1].fechaVerificacion).toBeUndefined()
      expect(fs.batch.update.mock.calls[0][1].metodoVerificacion).toBeUndefined()
    })

    it('usa tipo "fallback" cuando la fuente son las reglas (IA caída)', async () => {
      svc = await crearServicio(fs.db, configSinVertex())

      const registro = await svc.validarYAplicar('user-1')

      expect(registro!.tipo).toBe('fallback')
      expect(registro!.fuente).toBe('reglas')
    })

    it('devuelve null sin tocar Firestore cuando validacionIAHabilitada=false', async () => {
      fs = crearFirestoreMock({
        perfil: { ...PERFIL_BASE },
        configuraciones: { validacionIAHabilitada: 'false' },
      })
      svc = await crearServicio(fs.db, configConVertex())

      const registro = await svc.validarYAplicar('user-1')

      expect(registro).toBeNull()
      expect(mockGenerateContent).not.toHaveBeenCalled()
      expect(fs.batch.set).not.toHaveBeenCalled()
      expect(fs.batch.commit).not.toHaveBeenCalled()
    })

    it('continúa habilitado cuando la configuración no existe (default true)', async () => {
      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify(respuestaGemini({ confianza: 90 }))),
      )

      const registro = await svc.validarYAplicar('user-1')
      expect(registro).not.toBeNull()
    })
  })

  // ── overrideValidacion ───────────────────────────────────────────────────

  describe('overrideValidacion', () => {
    it('admin aprueba: verificado=true y registro tipo override con adminId', async () => {
      const registro = await svc.overrideValidacion('user-1', true, 'admin-1', 'Revisado a mano')

      expect(registro.tipo).toBe('override')
      expect(registro.aprobado).toBe(true)
      expect(registro.fuente).toBe('admin')
      expect(registro.adminId).toBe('admin-1')
      expect(registro.razonamiento).toBe('Revisado a mano')

      expect(fs.batch.update.mock.calls[0][1].verificado).toBe(true)
      expect(fs.batch.update.mock.calls[0][1].metodoVerificacion).toBe('admin')
      expect(fs.batch.commit).toHaveBeenCalledTimes(1)
    })

    it('admin rechaza: verificado=false', async () => {
      const registro = await svc.overrideValidacion('user-1', false, 'admin-1')

      expect(registro.aprobado).toBe(false)
      expect(registro.razonamiento).toBe('Rechazado manualmente por un administrador')
      expect(fs.batch.update.mock.calls[0][1].verificado).toBe(false)
    })

    it('override con documentos pendientes: aprueba los docs con revisadoPor=admin, no "ia" (auditoría)', async () => {
      fs = crearFirestoreMock({
        perfil: { ...PERFIL_BASE },
        documentos: [{ tipo: 'curp', estado: 'pendiente' }],
      })
      svc = await crearServicio(fs.db, configConVertex())

      const registro = await svc.overrideValidacion('user-1', true, 'admin-1', 'Doc revisado a mano')

      expect(registro.aprobado).toBe(true)
      const updates = fs.batch.update.mock.calls
      // 1 update de perfil + 1 update del documento pendiente
      expect(updates).toHaveLength(2)
      const updateDoc = updates.find(c => c[1].estado === 'aprobado')
      expect(updateDoc).toBeDefined()
      expect(updateDoc![1].revisadoPor).toBe('admin-1')
    })

    it('validación automática aprobada con documentos pendientes: revisadoPor="ia"', async () => {
      fs = crearFirestoreMock({
        perfil: { ...PERFIL_BASE },
        documentos: [{ tipo: 'curp', estado: 'pendiente' }],
      })
      svc = await crearServicio(fs.db, configConVertex())
      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify(respuestaGemini({ confianza: 92, aprobado: true }))),
      )

      await svc.validarYAplicar('user-1')

      const updateDoc = fs.batch.update.mock.calls.find(c => c[1].estado === 'aprobado')
      expect(updateDoc).toBeDefined()
      expect(updateDoc![1].revisadoPor).toBe('ia')
    })

    it('lanza NotFoundException cuando el usuario no existe', async () => {
      fs = crearFirestoreMock({ perfil: null })
      svc = await crearServicio(fs.db, configConVertex())

      await expect(svc.overrideValidacion('user-1', true, 'admin-1')).rejects.toThrow(NotFoundException)
    })
  })

  // ── obtenerHistorial ─────────────────────────────────────────────────────

  describe('obtenerHistorial', () => {
    it('devuelve los registros ordenados del más reciente al más antiguo', async () => {
      const registros: Array<Partial<RegistroValidacionIa>> = [
        { id: 'r1', usuarioId: 'user-1', aprobado: true, fechaValidacion: '2026-09-01T10:00:00.000Z' },
        { id: 'r2', usuarioId: 'user-1', aprobado: false, fechaValidacion: '2026-09-05T10:00:00.000Z' },
      ]
      fs.db.collection = jest.fn((nombre: string) => {
        if (nombre === 'validacionesIA') {
          return {
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({
              empty: false,
              docs: registros.map(r => ({ id: r.id, data: () => r })),
              size: registros.length,
            }),
          }
        }
        if (nombre === 'perfiles') {
          return {
            doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDoc({ ...PERFIL_BASE })) })),
          }
        }
        return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) })) }
      })
      svc = await crearServicio(fs.db, configConVertex())

      const historial = await svc.obtenerHistorial('user-1')

      expect(historial).toHaveLength(2)
      expect(historial[0].id).toBe('r2') // más reciente primero
      expect(historial[1].id).toBe('r1')
    })

    it('lanza NotFoundException cuando el usuario no existe', async () => {
      fs = crearFirestoreMock({ perfil: null })
      svc = await crearServicio(fs.db, configConVertex())

      await expect(svc.obtenerHistorial('user-1')).rejects.toThrow(NotFoundException)
    })
  })
})
