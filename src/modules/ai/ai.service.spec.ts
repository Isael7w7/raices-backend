import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { NotFoundException } from '@nestjs/common'
import { GoogleGenAI } from '@google/genai'
import { AiService } from './ai.service'
import { FIRESTORE } from '../../database/firebase.provider'

// ─── Mock de @google/genai ─────────────────────────────────────────────
jest.mock('@google/genai')

// ─── Mock helpers ────────────────────────────────────────────────────────

function mockDoc(data: Record<string, any> | null, exists = true) {
  return { exists, id: 'mock-doc-id', data: () => data }
}

function mockCollection(docResult: any, empty = false, docs: any[] = []) {
  return {
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(docResult),
      set: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    }),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ empty, docs, size: docs.length }),
  }
}

function geminiResponse(text: string) {
  return {
    candidates: [{
      content: {
        parts: [{ text }],
        role: 'model',
      },
    }],
  }
}

function emptyGeminiResponse() {
  return { candidates: [] }
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('AiService', () => {
  let svc: AiService
  let firestoreMock: Record<string, any>
  let configMock: Record<string, any>

  // Shared mocks para Google Gen AI — se reinician en cada test
  let mockSendMessage: jest.Mock
  let mockChatsCreate: jest.Mock
  let mockGenerateContent: jest.Mock
  let mockGoogleGenAIInstance: any

  beforeEach(async () => {
    jest.clearAllMocks()

    // Crear mocks frescos
    mockSendMessage = jest.fn()
    mockGenerateContent = jest.fn()
    mockChatsCreate = jest.fn().mockResolvedValue({
      sendMessage: mockSendMessage,
    })

    mockGoogleGenAIInstance = {
      chats: { create: mockChatsCreate },
      models: { generateContent: mockGenerateContent },
    }

    // Configurar el mock del constructor de GoogleGenAI
    ;(GoogleGenAI as jest.Mock).mockImplementation(() => mockGoogleGenAIInstance)

    firestoreMock = { collection: jest.fn() }
    configMock = {
      get: jest.fn((key: string) => {
        const vars: Record<string, string> = {
          VERTEX_AI_PROJECT_ID: 'test-project',
          VERTEX_AI_LOCATION: 'us-central1',
          VERTEX_AI_MODEL: 'gemini-2.0-flash',
        }
        return vars[key]
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: FIRESTORE, useValue: firestoreMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile()

    svc = module.get<AiService>(AiService)
  })

  // ── Inicialización ───────────────────────────────────────────────────────

  describe('inicialización', () => {
    it('debe inicializar GoogleGenAI con las config correctas', () => {
      expect(GoogleGenAI).toHaveBeenCalledWith({
        vertexai: true,
        project: 'test-project',
        location: 'us-central1',
      })
    })

    it('debe usar FIREBASE_PROJECT_ID como fallback cuando VERTEX_AI_PROJECT_ID no existe', async () => {
      const configNoVertex: Record<string, any> = {
        get: jest.fn((key: string) => {
          if (key === 'VERTEX_AI_PROJECT_ID') return undefined
          if (key === 'FIREBASE_PROJECT_ID') return 'fallback-project'
          if (key === 'VERTEX_AI_LOCATION') return 'us-central1'
          if (key === 'VERTEX_AI_MODEL') return 'gemini-2.0-flash'
          return undefined
        }),
      }

      await Test.createTestingModule({
        providers: [
          AiService,
          { provide: FIRESTORE, useValue: firestoreMock },
          { provide: ConfigService, useValue: configNoVertex },
        ],
      }).compile()

      expect(GoogleGenAI).toHaveBeenCalledWith(
        expect.objectContaining({ project: 'fallback-project' }),
      )
    })

    it('debe caer en modo mock cuando no hay project configurado', async () => {
      const configSinProject: Record<string, any> = {
        get: jest.fn(() => undefined),
      }

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: FIRESTORE, useValue: firestoreMock },
          { provide: ConfigService, useValue: configSinProject },
        ],
      }).compile()

      const svc = module.get<AiService>(AiService)
      // El nuevo módulo NO debe llamar a GoogleGenAI (el 1.er call es del beforeEach)
      expect(GoogleGenAI).toHaveBeenCalledTimes(1)

      // chat() debe devolver mock
      firestoreMock.collection.mockReturnValue(
        mockCollection(null, true),
      )
      const result: any = await svc.chat('user1', 'Hola')
      expect(result.simulado).toBe(true)
    })

    it('debe manejar errores de inicialización de Vertex AI', async () => {
      ;(GoogleGenAI as jest.Mock).mockImplementationOnce(() => {
        throw new Error('GCP credentials not found')
      })

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: FIRESTORE, useValue: firestoreMock },
          { provide: ConfigService, useValue: configMock },
        ],
      }).compile()

      const svc = module.get<AiService>(AiService)
      firestoreMock.collection.mockReturnValue(
        mockCollection(null, true),
      )
      const result: any = await svc.chat('user1', 'Hola')
      expect(result.simulado).toBe(true)
    })

    it('debe usar gemini-2.0-flash como default cuando VERTEX_AI_MODEL no está definido', async () => {
      const configSinModel: Record<string, any> = {
        get: jest.fn((key: string) => {
          if (key === 'VERTEX_AI_PROJECT_ID') return 'test-project'
          if (key === 'VERTEX_AI_LOCATION') return 'us-central1'
          return undefined
        }),
      }

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: FIRESTORE, useValue: firestoreMock },
          { provide: ConfigService, useValue: configSinModel },
        ],
      }).compile()

      // With the new SDK, the model name is stored internally and used at call time
      // Verify the constructor was called with valid project/location (model default is internal)
      expect(GoogleGenAI).toHaveBeenCalledTimes(2)
      expect(GoogleGenAI).toHaveBeenLastCalledWith(
        expect.objectContaining({ project: 'test-project', location: 'us-central1' }),
      )
    })

    it('debe usar us-central1 como default cuando VERTEX_AI_LOCATION no está definido', async () => {
      const configSinLocation: Record<string, any> = {
        get: jest.fn((key: string) => {
          if (key === 'VERTEX_AI_PROJECT_ID') return 'test-project'
          if (key === 'VERTEX_AI_MODEL') return 'gemini-2.0-flash'
          return undefined
        }),
      }

      await Test.createTestingModule({
        providers: [
          AiService,
          { provide: FIRESTORE, useValue: firestoreMock },
          { provide: ConfigService, useValue: configSinLocation },
        ],
      }).compile()

      expect(GoogleGenAI).toHaveBeenCalledWith(
        expect.objectContaining({ location: 'us-central1' }),
      )
    })
  })

  // ── chat() ───────────────────────────────────────────────────────────────

  describe('chat', () => {
    it('debe devolver mock cuando el cliente AI no está disponible', async () => {
      const configNoVertex: Record<string, any> = {
        get: jest.fn(() => undefined),
      }
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: FIRESTORE, useValue: firestoreMock },
          { provide: ConfigService, useValue: configNoVertex },
        ],
      }).compile()
      const svc = module.get<AiService>(AiService)

      firestoreMock.collection.mockReturnValue(mockCollection(null, true))

      const result: any = await svc.chat('user1', 'Hola, ¿qué servicios ofrecen?')
      expect(result.simulado).toBe(true)
      expect(typeof result.respuesta).toBe('string')
      expect(result.respuesta.length).toBeGreaterThan(0)
    })

    it('debe llamar a Google Gen AI chat cuando el modelo está disponible', async () => {
      const perfil = {
        usuarioId: 'user1',
        tiposDiscapacidad: '["tea"]',
        etapaVida: 'adulto',
        nivelApoyo: 'medio',
      }
      firestoreMock.collection.mockReturnValueOnce(
        mockCollection(null, false, [{ data: () => perfil }]),
      )
      mockSendMessage.mockResolvedValue(
        geminiResponse('Hola, puedo ayudarte con eso.'),
      )

      const result: any = await svc.chat('user1', '¿Qué es Raíces?')

      expect(result.respuesta).toBe('Hola, puedo ayudarte con eso.')
      expect(result.simulado).toBe(false)
      expect(mockChatsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            systemInstruction: expect.stringContaining('Raíces'),
          }),
        }),
      )
    })

    it('debe incluir el historial (últimos 6 mensajes) en el chat', async () => {
      firestoreMock.collection.mockReturnValueOnce(mockCollection(null, true))
      const historial = [
        { role: 'user', content: 'msg1' },
        { role: 'assistant', content: 'resp1' },
        { role: 'user', content: 'msg2' },
        { role: 'assistant', content: 'resp2' },
      ]
      mockSendMessage.mockResolvedValue(geminiResponse('Respuesta'))

      await svc.chat('user1', 'msg3', historial)

      expect(mockChatsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          history: [
            { role: 'user', parts: [{ text: 'msg1' }] },
            { role: 'model', parts: [{ text: 'resp1' }] },
            { role: 'user', parts: [{ text: 'msg2' }] },
            { role: 'model', parts: [{ text: 'resp2' }] },
          ],
        }),
      )
    })

    it('debe limitar el historial a los últimos 6 mensajes', async () => {
      firestoreMock.collection.mockReturnValueOnce(mockCollection(null, true))
      const historial = Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `msg${i}`,
      }))
      mockSendMessage.mockResolvedValue(geminiResponse('OK'))

      await svc.chat('user1', 'msg10', historial)

      const historyArg = mockChatsCreate.mock.calls[0][0].history
      expect(historyArg).toHaveLength(6)
      expect(historyArg[0].parts[0].text).toBe('msg4')
      expect(historyArg[5].parts[0].text).toBe('msg9')
    })

    it('debe caer en mock cuando Vertex AI chat falla', async () => {
      firestoreMock.collection.mockReturnValueOnce(mockCollection(null, true))
      mockSendMessage.mockRejectedValue(new Error('Quota exceeded'))

      const result: any = await svc.chat('user1', 'Hola')
      expect(result.simulado).toBe(true)
    })

    it('debe devolver mock cuando la respuesta de Gemini viene vacía', async () => {
      firestoreMock.collection.mockReturnValueOnce(mockCollection(null, true))
      mockSendMessage.mockResolvedValue(emptyGeminiResponse())

      const result: any = await svc.chat('user1', 'Hola')
      expect(result.simulado).toBe(true)
    })

    it('debe incluir perfil del usuario en el system prompt', async () => {
      const perfil = {
        usuarioId: 'user1',
        tiposDiscapacidad: '["autismo","discapacidad_visual"]',
        etapaVida: 'infancia',
      }
      firestoreMock.collection.mockReturnValueOnce(
        mockCollection(null, false, [{ data: () => perfil }]),
      )
      mockSendMessage.mockResolvedValue(geminiResponse('OK'))

      await svc.chat('user1', 'Hola')

      const configArg = mockChatsCreate.mock.calls[0][0].config
      expect(configArg.systemInstruction).toContain('infancia')
      expect(configArg.systemInstruction).toContain('autismo')
      expect(configArg.systemInstruction).toContain('discapacidad_visual')
    })

    it('debe manejar perfil sin tiposDiscapacidad', async () => {
      const perfil = { usuarioId: 'user1' }
      firestoreMock.collection.mockReturnValueOnce(
        mockCollection(null, false, [{ data: () => perfil }]),
      )
      mockSendMessage.mockResolvedValue(geminiResponse('OK'))

      await svc.chat('user1', 'Hola')

      const configArg = mockChatsCreate.mock.calls[0][0].config
      expect(configArg.systemInstruction).toContain('no especificadas')
    })
  })

  // ── recommend() ──────────────────────────────────────────────────────────

  // Helper compartido entre describe('recommend') y describe('parseJsonResponse')
  function setupRecommendMocks(opts: {
    perfil?: Record<string, any> | null
    registroUsuario?: Record<string, any>
    favoritos?: any[]
    publicaciones?: number
    postulaciones?: number
  } = {}) {
    const perfil = opts.perfil ?? {
      usuarioId: 'user1',
      tiposDiscapacidad: '["tea"]',
      etapaVida: 'adulto',
      nivelApoyo: 'medio',
      metasActuales: '["mejorar_comunicacion"]',
      areasApoyo: '["familia"]',
      areasInteres: '["empleo"]',
      preocupacionesActuales: 'ansiedad',
      viabilidadEconomica: 'media',
      preferenciaFormato: 'visual',
      escalasVida: { autonomia: 3, independencia: 4, comunicacion: 3, comprension: 4, energia: 3, movilidad: 4, social: 3, emocional: 4 },
    }
    const registroUsuario = opts.registroUsuario ?? {
      nombreCompleto: 'Test User', ciudad: 'CDMX', estado: 'Mexico', rol: 'pcd',
    }
    const favoritos = opts.favoritos ?? []
    const numPublicaciones = opts.publicaciones ?? 2
    const numPostulaciones = opts.postulaciones ?? 1

    const perfilSnap = perfil
      ? mockCollection(null, false, [{ data: () => perfil }])
      : mockCollection(null, true)

    const registroSnap = mockDoc(registroUsuario)

    const favoritosSnap = {
      docs: favoritos.map(f => ({
        data: () => ({ institucionId: f.id }),
      })),
      empty: favoritos.length === 0,
    }

    const publicacionesSnap = { size: numPublicaciones }
    const postulacionesSnap = { size: numPostulaciones }

    firestoreMock.collection
      .mockReturnValueOnce(perfilSnap)
      .mockReturnValueOnce({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(registroSnap) }),
      })
      .mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(favoritosSnap),
      })
      .mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(publicacionesSnap),
      })
      .mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(postulacionesSnap),
      })

    for (const f of favoritos) {
      firestoreMock.collection.mockReturnValueOnce({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(
            mockDoc({ nombre: f.nombre, categoria: f.categoria, ciudad: f.ciudad }),
          ),
        }),
      })
    }

    return { perfil, registroUsuario }
  }

  describe('recommend', () => {
    it('debe devolver mock cuando el cliente AI no está disponible', async () => {
      const configNoVertex: Record<string, any> = {
        get: jest.fn(() => undefined),
      }
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: FIRESTORE, useValue: firestoreMock },
          { provide: ConfigService, useValue: configNoVertex },
        ],
      }).compile()
      const svc = module.get<AiService>(AiService)

      firestoreMock.collection
        .mockReturnValueOnce(mockCollection(null, true))
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }),
        })
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [], empty: true }),
        })
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ size: 0 }),
        })
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ size: 0 }),
        })

      const result: any = await svc.recommend('user1')
      expect(result.simulado).toBe(true)
      expect(result.proximosPasos).toBeDefined()
      expect(result.proximosPasos.length).toBe(3)
    })

    it('debe devolver mock cuando no hay perfil', async () => {
      firestoreMock.collection
        .mockReturnValueOnce(mockCollection(null, true))
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }),
        })
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [], empty: true }),
        })
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ size: 0 }),
        })
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ size: 0 }),
        })

      const result: any = await svc.recommend('user1')
      expect(result.simulado).toBe(true)
    })

    it('debe llamar a Google Gen AI para generar recomendaciones personalizadas', async () => {
      setupRecommendMocks()
      const geminiResult = {
        proximosPasos: ['Paso 1', 'Paso 2', 'Paso 3'],
        razonamiento: 'Basándome en tu perfil...',
        sugerenciasInstitucion: [{ categoria: 'Terapia', razon: 'Evaluación' }],
      }
      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify(geminiResult)),
      )

      const result: any = await svc.recommend('user1')
      expect(result.simulado).toBe(false)
      expect(result.proximosPasos).toEqual(['Paso 1', 'Paso 2', 'Paso 3'])
      expect(result.razonamiento).toBe('Basándome en tu perfil...')
      expect(result.sugerenciasInstitucion).toEqual([{ categoria: 'Terapia', razon: 'Evaluación' }])
    })

    it('debe generar recomendaciones diferentes para usuario sin diagnóstico', async () => {
      setupRecommendMocks({
        perfil: {
          usuarioId: 'user1',
          tiposDiscapacidad: [],
          etapaVida: 'adulto',
          nivelApoyo: 'medio',
          metasActuales: '[]',
          areasApoyo: '[]',
          areasInteres: '[]',
          preocupacionesActuales: 'ninguna',
          viabilidadEconomica: 'no especificada',
          preferenciaFormato: 'no especificado',
        },
      })

      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify({
          proximosPasos: ['Agenda evaluación', 'Completa perfil', 'Explora comunidad'],
          razonamiento: 'Sin diagnóstico...',
        })),
      )

      const result: any = await svc.recommend('user1')
      expect(result.simulado).toBe(false)
      expect(result.proximosPasos).toEqual(['Agenda evaluación', 'Completa perfil', 'Explora comunidad'])
    })

    it('debe incluir favoritos en el prompt de Gemini', async () => {
      setupRecommendMocks({
        favoritos: [
          { id: 'inst1', nombre: 'Centro Terapia', categoria: 'funcional', ciudad: 'CDMX' },
        ],
      })
      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify({
          proximosPasos: ['P1', 'P2', 'P3'],
          razonamiento: 'ok',
        })),
      )

      await svc.recommend('user1')

      const prompt = mockGenerateContent.mock.calls[0][0].contents
      expect(prompt).toContain('Centro Terapia')
      expect(prompt).toContain('funcional')
    })

    it('debe caer en fallback cuando Vertex AI recommend falla', async () => {
      setupRecommendMocks()
      mockGenerateContent.mockRejectedValue(new Error('Rate limit'))

      const result: any = await svc.recommend('user1')
      expect(result.simulado).toBe(true)
      expect(result.proximosPasos.length).toBe(3)
    })
  })

  // ── recommendForDependent() ──────────────────────────────────────────────

  describe('recommendForDependent', () => {
    it('debe lanzar NotFoundException cuando el dependiente no existe', async () => {
      firestoreMock.collection.mockReturnValueOnce({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc(null, false)),
        }),
      })

      await expect(
        svc.recommendForDependent('user1', 'dep-nonexistent'),
      ).rejects.toThrow(NotFoundException)
    })

    it('debe lanzar NotFoundException cuando el dependiente pertenece a otro tutor', async () => {
      firestoreMock.collection.mockReturnValueOnce({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(
            mockDoc({ tutorId: 'other-user', nombreCompleto: 'Otra persona' }),
          ),
        }),
      })

      await expect(
        svc.recommendForDependent('user1', 'dep-other'),
      ).rejects.toThrow(NotFoundException)
    })

    it('debe devolver mock cuando el cliente AI no está disponible', async () => {
      const configNoVertex: Record<string, any> = {
        get: jest.fn(() => undefined),
      }
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: FIRESTORE, useValue: firestoreMock },
          { provide: ConfigService, useValue: configNoVertex },
        ],
      }).compile()
      const svc = module.get<AiService>(AiService)

      firestoreMock.collection.mockReturnValueOnce({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(
            mockDoc({
              tutorId: 'user1',
              nombreCompleto: 'María',
              datosPerfil: JSON.stringify({
                tiposDiscapacidad: ['tea'],
                etapaVida: 'infancia',
              }),
            }),
          ),
        }),
      })

      const result: any = await svc.recommendForDependent('user1', 'dep1')
      expect(result.simulado).toBe(true)
      expect(result.proximosPasos).toHaveLength(3)
    })

    it('debe generar recomendaciones para el dependiente via Google Gen AI', async () => {
      firestoreMock.collection.mockReturnValueOnce({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(
            mockDoc({
              tutorId: 'user1',
              nombreCompleto: 'Carlos',
              parentesco: 'hijo',
              datosPerfil: JSON.stringify({
                tiposDiscapacidad: ['tea', 'motriz'],
                etapaVida: 'infancia',
                notas: 'Requiere apoyo constante',
              }),
            }),
          ),
        }),
      })

      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify({
          proximosPasos: ['Buscar terapia', 'Unirse a grupo', 'Explorar escuelas'],
          razonamiento: 'Para Carlos...',
        })),
      )

      const result: any = await svc.recommendForDependent('user1', 'dep1')
      expect(result.simulado).toBe(false)
      expect(result.proximosPasos).toEqual(['Buscar terapia', 'Unirse a grupo', 'Explorar escuelas'])
    })

    it('debe aceptar dependienteDoc pre-cargado (guard)', async () => {
      const dependienteDoc = {
        tutorId: 'user1',
        nombreCompleto: 'Ana',
        parentesco: 'hija',
        datosPerfil: JSON.stringify({
          tiposDiscapacidad: ['visual'],
          etapaVida: 'adulto',
          notas: '',
        }),
      }

      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify({
          proximosPasos: ['P1', 'P2', 'P3'],
          razonamiento: 'ok',
        })),
      )

      const result: any = await svc.recommendForDependent('user1', 'dep1', dependienteDoc)
      expect(result.simulado).toBe(false)
      expect(firestoreMock.collection).not.toHaveBeenCalled()
    })

    it('debe manejar datosPerfil como JSON inválido', async () => {
      firestoreMock.collection.mockReturnValueOnce({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(
            mockDoc({
              tutorId: 'user1',
              nombreCompleto: 'Pedro',
              parentesco: 'hijo',
              datosPerfil: 'json-invalido{',
            }),
          ),
        }),
      })

      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify({
          proximosPasos: ['P1', 'P2', 'P3'],
          razonamiento: 'ok',
        })),
      )

      const result: any = await svc.recommendForDependent('user1', 'dep1')
      expect(result.simulado).toBe(false)
    })

    it('debe caer en fallback cuando Vertex AI falla', async () => {
      firestoreMock.collection.mockReturnValueOnce({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(
            mockDoc({
              tutorId: 'user1',
              nombreCompleto: 'Luis',
              datosPerfil: JSON.stringify({ tiposDiscapacidad: ['motriz'], etapaVida: 'infancia' }),
            }),
          ),
        }),
      })

      mockGenerateContent.mockRejectedValue(new Error('Service unavailable'))

      const result: any = await svc.recommendForDependent('user1', 'dep1')
      expect(result.simulado).toBe(true)
      expect(result.proximosPasos).toHaveLength(3)
    })
  })

  // ── generarResumen() ─────────────────────────────────────────────────────

  describe('generarResumen', () => {
    function setupResumenMocks(perfil: Record<string, any> | null, registro: Record<string, any> | null) {
      const perfilSnap = perfil
        ? mockCollection(null, false, [{ data: () => perfil }])
        : mockCollection(null, true)

      const registroDoc = registro ? mockDoc(registro) : mockDoc(null, false)

      firestoreMock.collection
        .mockReturnValueOnce(perfilSnap)
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(registroDoc) }),
        })
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [], empty: true }),
        })
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ size: 0 }),
        })
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ size: 0 }),
        })
    }

    it('debe devolver mock cuando el cliente AI no está disponible', async () => {
      const configNoVertex: Record<string, any> = {
        get: jest.fn(() => undefined),
      }
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: FIRESTORE, useValue: firestoreMock },
          { provide: ConfigService, useValue: configNoVertex },
        ],
      }).compile()
      const svc = module.get<AiService>(AiService)

      setupResumenMocks(null, null)

      const result: any = await svc.generarResumen('user1')
      expect(result.simulado).toBe(true)
      expect(result.resumenUnParrafo).toBeDefined()
      expect(result.resumenTresParrafos).toBeDefined()
    })

    it('debe devolver mock cuando no hay perfil', async () => {
      setupResumenMocks(null, null)

      const result: any = await svc.generarResumen('user1')
      expect(result.simulado).toBe(true)
    })

    it('debe generar resumen narrativo via Google Gen AI', async () => {
      const perfil = {
        usuarioId: 'user1',
        tiposDiscapacidad: '["tea"]',
        etapaVida: 'adulto',
        nivelApoyo: 'medio',
        metasActuales: '["empleo"]',
        areasApoyo: '["comunicacion"]',
        areasInteres: '["tecnologia"]',
        preocupacionesActuales: 'soledad',
        viabilidadEconomica: 'media',
        preferenciaFormato: 'texto',
        escalasVida: { autonomia: 3, independencia: 4, comunicacion: 2, comprension: 3, energia: 4, movilidad: 5, social: 2, emocional: 3 },
        historialEducacion: '["universidad"]',
        historialTerapia: '["psicologia"]',
        tieneDiagnostico: true,
        temporalidadOrigen: 'congenita',
      }
      const registro = {
        nombreCompleto: 'Ana López', ciudad: 'CDMX', estado: 'Mexico', rol: 'pcd',
      }

      setupResumenMocks(perfil, registro)

      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify({
          resumenUnParrafo: 'Ana es una mujer de 28 años con diagnóstico de tea...',
          resumenTresParrafos: {
            quienEres: 'Ana es una persona...',
            contexto: 'Vive en CDMX...',
            intereses: 'Le interesa la tecnología...',
          },
        })),
      )

      const result: any = await svc.generarResumen('user1')
      expect(result.simulado).toBe(false)
      expect(result.resumenUnParrafo).toBe('Ana es una mujer de 28 años con diagnóstico de tea...')
      expect(result.resumenTresParrafos.quienEres).toBe('Ana es una persona...')
      expect(result.resumenTresParrafos.contexto).toBe('Vive en CDMX...')
      expect(result.resumenTresParrafos.intereses).toBe('Le interesa la tecnología...')
    })

    it('debe incluir datos relevantes del usuario en el prompt', async () => {
      const perfil = {
        usuarioId: 'user1',
        tiposDiscapacidad: '["tea","visual"]',
        etapaVida: 'infancia',
        nivelApoyo: 'alto',
        tieneDiagnostico: false,
      }
      const registro = { nombreCompleto: 'Carlos', ciudad: 'GDL', rol: 'pcd' }

      setupResumenMocks(perfil, registro)

      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify({
          resumenUnParrafo: 'Resumen...',
          resumenTresParrafos: { quienEres: 'q', contexto: 'c', intereses: 'i' },
        })),
      )

      await svc.generarResumen('user1')

      const prompt = mockGenerateContent.mock.calls[0][0].contents
      expect(prompt).toContain('Carlos')
      expect(prompt).toContain('tea')
      expect(prompt).toContain('visual')
      expect(prompt).toContain('infancia')
      expect(prompt).toContain('GDL')
    })

    it('debe caer en fallback cuando Vertex AI falla', async () => {
      const perfil = { usuarioId: 'user1', tiposDiscapacidad: '["tea"]' }
      const registro = { nombreCompleto: 'Test' }

      setupResumenMocks(perfil, registro)

      mockGenerateContent.mockRejectedValue(new Error('Timeout'))

      const result: any = await svc.generarResumen('user1')
      expect(result.simulado).toBe(true)
      expect(result.resumenUnParrafo).toContain('No se pudo generar')
    })

    it('debe manejar JSON malformado de Gemini con fallback', async () => {
      const perfil = { usuarioId: 'user1' }
      const registro = { nombreCompleto: 'Test' }

      setupResumenMocks(perfil, registro)

      mockGenerateContent.mockResolvedValue(
        geminiResponse('esto no es json{{{'),
      )

      const result: any = await svc.generarResumen('user1')
      expect(result.simulado).toBe(true)
    })
  })

  // ── extractText() (probado indirectamente) ───────────────────────────────

  describe('extractText (a través de chat)', () => {
    it('debe extraer texto de una respuesta válida de Gemini', async () => {
      firestoreMock.collection.mockReturnValueOnce(mockCollection(null, true))
      mockSendMessage.mockResolvedValue(
        geminiResponse('Texto de prueba'),
      )

      const result: any = await svc.chat('user1', 'Hola')
      expect(result.respuesta).toBe('Texto de prueba')
    })

    it('debe manejar respuesta sin candidatos', async () => {
      firestoreMock.collection.mockReturnValueOnce(mockCollection(null, true))
      mockSendMessage.mockResolvedValue({ })

      const result: any = await svc.chat('user1', 'Hola')
      expect(result.simulado).toBe(true)
    })

    it('debe concatenar múltiples parts en una sola respuesta', async () => {
      firestoreMock.collection.mockReturnValueOnce(mockCollection(null, true))
      const multiPartResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Hola ' }, { text: 'mundo' }],
            role: 'model',
          },
        }],
      }
      mockSendMessage.mockResolvedValue(multiPartResponse)

      const result: any = await svc.chat('user1', 'Hola')
      expect(result.respuesta).toBe('Hola mundo')
    })
  })

  // ── parseJsonResponse() (probado indirectamente) ─────────────────────────

  describe('parseJsonResponse (a través de recommend)', () => {
    it('debe parsear JSON válido directamente', async () => {
      setupRecommendMocks()
      const data = { proximosPasos: ['P1', 'P2', 'P3'], razonamiento: 'ok' }
      mockGenerateContent.mockResolvedValue(
        geminiResponse(JSON.stringify(data)),
      )

      const result: any = await svc.recommend('user1')
      expect(result.proximosPasos).toEqual(['P1', 'P2', 'P3'])
    })

    it('debe parsear JSON envuelto en bloques ```json', async () => {
      setupRecommendMocks()
      const data = { proximosPasos: ['P1', 'P2', 'P3'], razonamiento: 'ok' }
      mockGenerateContent.mockResolvedValue(
        geminiResponse('```json\n' + JSON.stringify(data) + '\n```'),
      )

      const result: any = await svc.recommend('user1')
      expect(result.proximosPasos).toEqual(['P1', 'P2', 'P3'])
    })

    it('debe parsear JSON envuelto en bloques ``` sin lang tag', async () => {
      setupRecommendMocks()
      const data = { proximosPasos: ['P1', 'P2', 'P3'], razonamiento: 'ok' }
      mockGenerateContent.mockResolvedValue(
        geminiResponse('```\n' + JSON.stringify(data) + '\n```'),
      )

      const result: any = await svc.recommend('user1')
      expect(result.proximosPasos).toEqual(['P1', 'P2', 'P3'])
    })
  })
})
