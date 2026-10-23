import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { GoogleGenAI } from '@google/genai'
import { ModeracionService } from './moderacion.service'

// ─── Mock de @google/genai ─────────────────────────────────────────────
jest.mock('@google/genai')

/** RESPUESTA de Gemini con texto plano. */
function geminiResponse(text: string) {
  return { candidates: [{ content: { parts: [{ text }], role: 'model' } }] }
}

/** ConfigService mockeado: `proyecto` simula GEMINI_PROJECT_ID (undefined = sin Gemini). */
function configMock(proyecto?: string) {
  return {
    get: jest.fn((key: string) => {
      if (key === 'GEMINI_PROJECT_ID') return proyecto
      if (key === 'GEMINI_MODEL') return 'gemini-3.1-flash-lite'
      return undefined
    }),
  } as unknown as ConfigService
}

async function crearServicio(config: ConfigService): Promise<ModeracionService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [ModeracionService, { provide: ConfigService, useValue: config }],
  }).compile()
  return module.get<ModeracionService>(ModeracionService)
}

describe('ModeracionService', () => {
  let mockGenerateContent: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    mockGenerateContent = jest.fn()
    ;(GoogleGenAI as unknown as jest.Mock).mockImplementation(() => ({
      models: { generateContent: mockGenerateContent },
    }))
  })

  // ═══════════════════════════════════════════════════════════════════
  // Fallback por reglas
  // ═══════════════════════════════════════════════════════════════════
  describe('moderarPorReglas', () => {
    let svc: ModeracionService

    beforeEach(async () => {
      svc = await crearServicio(configMock(undefined))
    })

    it('aprueba una experiencia personal de inclusión', () => {
      const r = svc.moderarPorReglas('Hoy mi hijo empezó la escuela con apoyo del USAER. ¡Gran logro para nuestra familia!')
      expect(r.aprobado).toBe(true)
      expect(r.fuente).toBe('reglas')
      expect(r.razon).toBeTruthy()
    })

    it('aprueba una duda respetuosa sobre trámites y conserva la categoría del usuario', () => {
      const r = svc.moderarPorReglas('¿Alguien sabe qué documentos piden en el CEDis para la constancia?', 'duda_tramite')
      expect(r.aprobado).toBe(true)
      expect(r.categoria).toBe('duda_tramite')
    })

    it('rechaza números de tarjeta (datos sensibles)', () => {
      const r = svc.moderarPorReglas('Mi tarjeta es 4111 1111 1111 1111 si alguien quiere cobrar el curso')
      expect(r.aprobado).toBe(false)
      expect(r.categoria).toBe('datos_sensibles')
      expect(r.sugerenciaMejora).toBeTruthy()
    })

    it('rechaza contraseñas escritas (datos sensibles)', () => {
      const r = svc.moderarPorReglas('contraseña: misegurito123 para que entren al sistema')
      expect(r.aprobado).toBe(false)
      expect(r.categoria).toBe('datos_sensibles')
    })

    it('rechaza lenguaje ofensivo/capacitista (lenguaje inapropiado)', () => {
      const r = svc.moderarPorReglas('Qué imbecilidad que esa gente estúpida salga a la calle, no deberían estar ahí')
      expect(r.aprobado).toBe(false)
      expect(r.categoria).toBe('lenguaje_inapropiado')
      expect(r.sugerenciaMejora).toBeTruthy()
    })

    it('rechaza remedios milagro (desinformación)', () => {
      const r = svc.moderarPorReglas('Este remedio milagro cura la discapacidad en un mes, escribanme por privado')
      expect(r.aprobado).toBe(false)
      expect(r.categoria).toBe('desinformacion')
    })

    it('rechaza cadenas y promesas de dinero fácil (spam)', () => {
      const r = svc.moderarPorReglas('Comparte esta cadena a 10 amigos y gana dinero rápido con esta inversión')
      expect(r.aprobado).toBe(false)
      expect(r.categoria).toBe('spam')
    })

    it('rechaza texto de relleno repetitivo (spam)', () => {
      const r = svc.moderarPorReglas('aaaaaaaaaaaaaaaaaa')
      expect(r.aprobado).toBe(false)
      expect(r.categoria).toBe('spam')
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Revisión con Gemini
  // ═══════════════════════════════════════════════════════════════════
  describe('con Gemini configurado', () => {
    it('normaliza una respuesta JSON válida de Gemini', async () => {
      const svc = await crearServicio(configMock('proyecto-1'))
      mockGenerateContent.mockResolvedValue(geminiResponse(JSON.stringify({
        aprobado: false,
        categoria: 'lenguaje_inapropiado',
        razon: 'Contiene un insulto hacia otra persona.',
        sugerencia_mejora: 'Reescribe sin insultos.',
      })))

      const r = await svc.moderarPublicacion('Contenido con insulto')
      expect(r.aprobado).toBe(false)
      expect(r.categoria).toBe('lenguaje_inapropiado')
      expect(r.razon).toBe('Contiene un insulto hacia otra persona.')
      // El contrato usa camelCase; el prompt pide snake_case.
      expect(r.sugerenciaMejora).toBe('Reescribe sin insultos.')
      expect(r.fuente).toBe('gemini')
    })

    it('tolera bloques ```json y campos faltantes', async () => {
      const svc = await crearServicio(configMock('proyecto-1'))
      mockGenerateContent.mockResolvedValue(geminiResponse(
        'Aquí está el análisis:\n```json\n{"aprobado": true, "categoria": "logro_personal"}\n```',
      ))

      const r = await svc.moderarPublicacion('Conseguí trabajo en una empresa inclusiva')
      expect(r.aprobado).toBe(true)
      expect(r.categoria).toBe('logro_personal')
      expect(r.razon).toBeTruthy()
      expect(r.sugerenciaMejora).toBeNull()
      expect(r.fuente).toBe('gemini')
    })

    it('usa la categoría del usuario cuando Gemini devuelve una inválida', async () => {
      const svc = await crearServicio(configMock('proyecto-1'))
      mockGenerateContent.mockResolvedValue(geminiResponse(JSON.stringify({
        aprobado: true, categoria: 'categoria_inexistente', razon: 'ok',
      })))

      const r = await svc.moderarPublicacion('Recurso útil sobre becas', 'recurso_util')
      expect(r.aprobado).toBe(true)
      expect(r.categoria).toBe('recurso_util')
    })

    it('cae a reglas cuando Gemini lanza error', async () => {
      const svc = await crearServicio(configMock('proyecto-1'))
      mockGenerateContent.mockRejectedValue(new Error('Gemini caído'))

      const r = await svc.moderarPublicacion('Mi tarjeta 4111 1111 1111 1111 para el pago')
      expect(r.fuente).toBe('reglas')
      expect(r.aprobado).toBe(false)
      expect(r.categoria).toBe('datos_sensibles')
    })

    it('cae a reglas cuando la respuesta no es JSON válido', async () => {
      const svc = await crearServicio(configMock('proyecto-1'))
      mockGenerateContent.mockResolvedValue(geminiResponse('Lo siento, no puedo evaluar esto.'))

      const r = await svc.moderarPublicacion('Contenido ordinario')
      expect(r.fuente).toBe('reglas')
      expect(r.aprobado).toBe(true)
    })

    it('cae a reglas cuando la respuesta está vacía', async () => {
      const svc = await crearServicio(configMock('proyecto-1'))
      mockGenerateContent.mockResolvedValue({ candidates: [] })

      const r = await svc.moderarPublicacion('Contenido ordinario')
      expect(r.fuente).toBe('reglas')
    })
  })

  describe('sin proyecto configurado', () => {
    it('no instancia Gemini y decide por reglas', async () => {
      const svc = await crearServicio(configMock(undefined))

      const r = await svc.moderarPublicacion('Comparte esta cadena a 10 amigos')
      expect(GoogleGenAI).not.toHaveBeenCalled()
      expect(r.fuente).toBe('reglas')
      expect(r.aprobado).toBe(false)
      expect(r.categoria).toBe('spam')
    })
  })
})
