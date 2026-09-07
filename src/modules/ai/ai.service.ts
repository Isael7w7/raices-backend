import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GoogleGenAI } from '@google/genai'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { parsearTiposDiscapacidad, parsearCampoJson } from '../../common/utils/firestore-helpers'
import type { PerfilDoc, PerfilExtendidoDoc, InstitucionDoc, DependienteDoc } from '../../common/interfaces/firestore-documents.interface'

const RESPUESTAS_MOCK = [
  'Entiendo tu consulta. Basándome en tu perfil, te recomiendo explorar las instituciones de la categoría funcional en tu ciudad. ¿Quieres que te muestre opciones específicas?',
  'Hay varias opciones que podrían ayudarte. En Raíces tenemos instituciones verificadas con experiencia en tu situación. ¿Te gustaría explorar el mapa?',
  'Gracias por compartir eso. Es un paso importante. Muchas familias en situaciones similares han encontrado apoyo en los grupos de comunidad. ¿Quieres unirte a alguno?',
  'Entiendo la preocupación. Lo más importante es dar el primer paso. ¿Has revisado ya las instituciones disponibles en tu zona?',
  'Eso es muy valioso saberlo. Basándote en tu etapa de vida, el siguiente paso recomendado sería conectar con un especialista. ¿Quieres ver opciones?',
]

// ─── Tipos del contrato interno del servicio ────────────────────────────

/** Mensaje del historial de conversación (mismo formato que ChatIaDto.historial). */
interface MensajeChat {
  role: string
  content: string
}

interface RespuestaChatIa {
  respuesta: string
  simulado: boolean
}

/** Sugerencia de institución que acompaña a las recomendaciones. */
interface SugerenciaInstitucion {
  categoria: string
  razon: string
}

interface RespuestaRecomendacionesIa {
  proximosPasos: string[]
  razonamiento: string
  sugerenciasInstitucion: SugerenciaInstitucion[]
  simulado: boolean
}

interface RespuestaRecomendacionDependienteIa {
  proximosPasos: string[]
  razonamiento: string
  simulado: boolean
}

interface RespuestaResumenIa {
  resumenUnParrafo: string
  resumenTresParrafos: { quienEres: string; contexto: string; intereses: string }
  simulado: boolean
}

/** Favorito resumido del usuario (solo los campos usados en los prompts). */
interface FavoritoResumido {
  nombre?: string
  categoria?: string
  ciudad?: string
}

/** Historial de actividad del usuario usado para contextualizar los prompts. */
interface HistorialUsuario {
  favoritos: FavoritoResumido[]
  cantidadPublicaciones: number
  cantidadPostulaciones: number
}

/** Estructura esperada del JSON de Gemini. Campos opcionales: el modelo puede omitirlos. */
interface RespuestaGemini {
  proximosPasos?: unknown
  razonamiento?: unknown
  sugerenciasInstitucion?: unknown
  resumenUnParrafo?: unknown
  resumenTresParrafos?: unknown
}

/**
 * Configuración de Gemini via Google Gen AI SDK (reemplaza @google-cloud/vertexai).
 * Los valores se leen de variables de entorno montadas desde GCP Secret Manager:
 *
 * - VERTEX_AI_PROJECT_ID  (fallback: FIREBASE_PROJECT_ID)
 * - VERTEX_AI_LOCATION    (default: us-central1)
 * - VERTEX_AI_MODEL       (default: gemini-2.0-flash)
 *
 * Autenticación: el SDK usa Application Default Credentials (ADC).
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger('AiService')
  private ai: GoogleGenAI | null = null
  private modelName: string = 'gemini-2.0-flash'

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly config: ConfigService,
  ) {
    this.initializeModel()
  }

  private initializeModel(): void {
    const project = this.config.get<string>('VERTEX_AI_PROJECT_ID') ?? this.config.get<string>('FIREBASE_PROJECT_ID')
    const location = this.config.get<string>('VERTEX_AI_LOCATION') ?? 'us-central1'
    this.modelName = this.config.get<string>('VERTEX_AI_MODEL') ?? 'gemini-2.0-flash'

    if (!project) {
      this.logger.warn('Vertex AI: VERTEX_AI_PROJECT_ID/FIREBASE_PROJECT_ID no configurado — usando respuestas mock')
      return
    }

    try {
      this.ai = new GoogleGenAI({ vertexai: true, project, location })
      this.logger.log(`✅ Vertex AI inicializado: project=${project}, location=${location}, model=${this.modelName}`)
    } catch (e: unknown) {
      this.logger.warn(`⚠️  Vertex AI no disponible (${mensajeError(e)}) — usando respuestas mock`)
      this.ai = null
    }
  }

  // ─── Utilidades de tipado/narrowing ────────────────────────────────────

  private esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
  }

  private esTexto(v: unknown): v is string {
    return typeof v === 'string'
  }

  private esArrayDeTextos(v: unknown): v is string[] {
    return Array.isArray(v) && v.every(x => typeof x === 'string')
  }

  /** Mensaje de error legible a partir de un valor desconocido (catch). */
  private mensajeError(e: unknown): string {
    return e instanceof Error ? e.message : String(e)
  }

  /**
   * Parsea un campo JSON que contiene un array de textos (metas, áreas,
   * historiales...). Siempre retorna un string[] válido, sin propagar `any`.
   */
  private listarValoresJson(valor: string | undefined | null): string[] {
    if (!valor) return []
    const parsed: unknown = parsearCampoJson(valor)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  }

  /** Normaliza la respuesta libre de Gemini a las recomendaciones tipadas. */
  private normalizarRecomendaciones(parsed: unknown): { proximosPasos: string[]; razonamiento: string; sugerenciasInstitucion: SugerenciaInstitucion[] } {
    const r = this.esObjeto(parsed) ? parsed : {}
    const sugerencias = Array.isArray(r.sugerenciasInstitucion)
      ? r.sugerenciasInstitucion
          .filter((s): s is { categoria: string; razon: string } =>
            this.esObjeto(s) && this.esTexto(s.categoria) && this.esTexto(s.razon))
          .map(s => ({ categoria: s.categoria, razon: s.razon }))
      : []
    return {
      proximosPasos: this.esArrayDeTextos(r.proximosPasos) ? r.proximosPasos : [],
      razonamiento: this.esTexto(r.razonamiento) ? r.razonamiento : '',
      sugerenciasInstitucion: sugerencias,
    }
  }

  /** Normaliza la respuesta libre de Gemini al resumen narrativo tipado. */
  private normalizarResumen(parsed: unknown): Omit<RespuestaResumenIa, 'simulado'> {
    const r = this.esObjeto(parsed) ? parsed : {}
    const tres = this.esObjeto(r.resumenTresParrafos) ? r.resumenTresParrafos : {}
    const texto = (v: unknown): string => (this.esTexto(v) ? v : '')
    return {
      resumenUnParrafo: texto(r.resumenUnParrafo),
      resumenTresParrafos: {
        quienEres: texto(tres.quienEres),
        contexto: texto(tres.contexto),
        intereses: texto(tres.intereses),
      },
    }
  }

  /** Extrae el texto de la respuesta de Gemini de forma segura. */
  private extractText(result: unknown): string {
    // New SDK: result.candidates[0].content.parts
    // Legacy SDK fallback: result.response.candidates[0].content.parts
    const r = this.esObjeto(result) ? result : {}
    const legacy = this.esObjeto(r.response) ? r.response : {}
    const candidates = r.candidates ?? legacy.candidates
    if (!Array.isArray(candidates) || candidates.length === 0) return ''

    const first = candidates[0]
    if (!this.esObjeto(first)) return ''
    const content = this.esObjeto(first.content) ? first.content : {}
    if (!Array.isArray(content.parts)) return ''

    return content.parts
      .filter((p): p is { text: string } => this.esObjeto(p) && this.esTexto(p.text))
      .map(p => p.text)
      .join('')
  }

  /** Parsea JSON de la respuesta de Gemini tolerando bloques ```json. */
  private parseJsonResponse(text: string): unknown {
    let cleaned = text.trim()
    const fence = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
    if (fence) cleaned = fence[1].trim()
    return JSON.parse(cleaned) as unknown
  }

  private async getUserProfile(usuarioId: string): Promise<PerfilExtendidoDoc | null> {
    const snap = await this.db.collection(COLECCIONES.perfilesExtendidos)
      .where('usuarioId', '==', usuarioId).limit(1).get()
    return snap.empty ? null : (snap.docs[0].data() as PerfilExtendidoDoc)
  }

  async chat(usuarioId: string, mensaje: string, historial: MensajeChat[] = []): Promise<RespuestaChatIa> {
    const perfil = await this.getUserProfile(usuarioId)

    if (!this.ai) {
      await new Promise((r) => setTimeout(r, 600))
      const respuesta = RESPUESTAS_MOCK[Math.floor(Math.random() * RESPUESTAS_MOCK.length)]
      return { respuesta, simulado: true }
    }

    const tiposDiscapacidad = perfil?.tiposDiscapacidad
      ? parsearTiposDiscapacidad(perfil.tiposDiscapacidad).join(', ')
      : 'no especificadas'

    const sistema = `Eres el asistente de Raíces para Florecer, ecosistema digital para personas con discapacidad en México.
Perfil del usuario: etapa=${perfil?.etapaVida ?? 'no especificada'}, discapacidades=${tiposDiscapacidad}.
NUNCA des diagnósticos médicos. Respuestas ≤150 palabras. Sé empático y directo.`

    try {
      const chat = await this.ai.chats.create({
        model: this.modelName,
        config: {
          maxOutputTokens: 300,
          systemInstruction: sistema,
        },
        history: historial.slice(-6).map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(m.content) }],
        })),
      })
      const result = await chat.sendMessage({ message: mensaje })
      const respuesta = this.extractText(result)
      if (!respuesta) throw new Error('Respuesta vacía de Vertex AI')
      return { respuesta, simulado: false }
    } catch (e: unknown) {
      this.logger.warn(`Vertex AI chat falló (${this.mensajeError(e)}) — usando respuestas mock`)
      await new Promise((r) => setTimeout(r, 600))
      const respuesta = RESPUESTAS_MOCK[Math.floor(Math.random() * RESPUESTAS_MOCK.length)]
      return { respuesta, simulado: true }
    }
  }

  private async getUserHistory(usuarioId: string): Promise<HistorialUsuario> {
    const [favSnap, postsSnap, appsSnap] = await Promise.all([
      this.db.collection(COLECCIONES.favoritos).where('usuarioId', '==', usuarioId).limit(10).get(),
      this.db.collection(COLECCIONES.publicaciones).where('autorId', '==', usuarioId).get(),
      this.db.collection(COLECCIONES.postulaciones).where('usuarioId', '==', usuarioId).get()
        .catch((): { size: number } => ({ size: 0 })),
    ])

    const favoritos: FavoritoResumido[] = []
    for (const fdoc of favSnap.docs) {
      const fav = fdoc.data() as { institucionId?: string }
      if (!fav.institucionId) continue
      const instDoc = await this.db.collection(COLECCIONES.instituciones).doc(fav.institucionId).get()
      if (instDoc.exists) {
        const inst = instDoc.data() as InstitucionDoc
        favoritos.push({ nombre: inst.nombre, categoria: inst.categoria, ciudad: inst.ciudad })
      }
    }

    return { favoritos, cantidadPublicaciones: postsSnap.size, cantidadPostulaciones: appsSnap.size }
  }

  async recommend(usuarioId: string): Promise<RespuestaRecomendacionesIa> {
    const [perfil, registroUsuario, historial] = await Promise.all([
      this.getUserProfile(usuarioId),
      this.db.collection(COLECCIONES.perfiles).doc(usuarioId).get(),
      this.getUserHistory(usuarioId),
    ])

    const tiposDiscapacidad = perfil?.tiposDiscapacidad
      ? parsearTiposDiscapacidad(perfil.tiposDiscapacidad)
      : []
    const sinDiagnostico = tiposDiscapacidad.length === 0
    const datosUsuario = registroUsuario.data() as PerfilDoc | undefined

    if (!this.ai || !perfil) {
      const pasos = sinDiagnostico ? [
        'Agenda una evaluación diagnóstica — visita una institución de Terapia en tu ciudad para obtener un diagnóstico formal',
        'Completa tu perfil con tus necesidades actuales para recibir recomendaciones más precisas',
        'Explora la sección Comunidad para conectar con otras personas en situación similar',
      ] : [
        `Busca instituciones de ${tiposDiscapacidad.join(' / ')} en ${datosUsuario?.ciudad ?? 'tu ciudad'}`,
        'Completa tu historial de terapia y educación para un análisis más profundo',
        'Únete al grupo de comunidad relacionado con tu perfil',
      ]
      return {
        proximosPasos: pasos,
        razonamiento: sinDiagnostico ? 'Sin diagnóstico registrado — prioridad: evaluación (modo demo)' : 'Recomendaciones generales (modo demo)',
        sugerenciasInstitucion: sinDiagnostico ? [{ categoria: 'Terapia', razon: 'Evaluación diagnóstica' }] : [],
        simulado: true,
      }
    }

    const resumenFavoritos = historial.favoritos.length > 0
      ? `Favoritos: ${historial.favoritos.map(f => `${f.nombre} (${f.categoria})`).join(', ')}.`
      : 'No tiene instituciones guardadas aún.'

    const prompt = `Eres el motor de análisis de Raíces para Florecer, plataforma de apoyo para personas con discapacidad en México.

PERFIL DEL USUARIO:
- Etapa de vida: ${perfil.etapaVida ?? 'no especificada'}
- Discapacidades: ${tiposDiscapacidad.length > 0 ? tiposDiscapacidad.join(', ') : 'sin diagnóstico registrado'}
- Ciudad: ${datosUsuario?.ciudad ?? 'no especificada'}, ${datosUsuario?.estado ?? ''}
- Nivel de soporte: ${perfil.nivelApoyo ?? 'no especificado'}
- Metas actuales: ${this.listarValoresJson(perfil.metasActuales).join(', ') || 'no especificadas'}
- Áreas de soporte: ${this.listarValoresJson(perfil.areasApoyo).join(', ') || 'no especificadas'}
- Preocupaciones actuales: ${perfil.preocupacionesActuales ?? 'ninguna'}
- Escalas de vida: ${perfil.escalasVida ? `Autonomía=${perfil.escalasVida.autonomia}, Independencia=${perfil.escalasVida.independencia}, Comunicación=${perfil.escalasVida.comunicacion}, Comprensión=${perfil.escalasVida.comprension}, Energía=${perfil.escalasVida.energia}, Movilidad=${perfil.escalasVida.movilidad}, Social=${perfil.escalasVida.social}, Emocional=${perfil.escalasVida.emocional}` : 'no completadas'}
- Áreas de interés: ${this.listarValoresJson(perfil.areasInteres).join(', ') || 'no especificadas'}
- Formato preferido: ${perfil.preferenciaFormato ?? 'no especificado'}
- Viabilidad económica: ${perfil.viabilidadEconomica ?? 'no especificada'}

HISTORIAL DE ACTIVIDAD:
- ${resumenFavoritos}
- Publicaciones en comunidad: ${historial.cantidadPublicaciones}
- Solicitudes de empleo enviadas: ${historial.cantidadPostulaciones}

${sinDiagnostico ? 'IMPORTANTE: El usuario NO tiene diagnóstico registrado. Prioriza sugerencias para evaluación diagnóstica.' : ''}

Genera 3 próximos pasos concretos y accionables, personalizados para esta persona específica en México.
Si no hay diagnóstico, el primer paso DEBE ser buscar evaluación diagnóstica.
Responde SOLO con JSON válido: {"proximosPasos":["paso1","paso2","paso3"],"razonamiento":"explicación breve en español","sugerenciasInstitucion":[{"categoria":"Terapia|Educación|Empleo","razon":"por qué"}]}`

    try {
      const result = await this.ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: { maxOutputTokens: 800, responseMimeType: 'application/json' },
      })
      const text = this.extractText(result)
      return { ...this.normalizarRecomendaciones(this.parseJsonResponse(text)), simulado: false }
    } catch (e: unknown) {
      this.logger.warn(`Vertex AI recommend falló (${this.mensajeError(e)}) — mostrando sugerencias generales`)
      return {
        proximosPasos: ['Explora instituciones cercanas', 'Completa tu historial', 'Únete a la comunidad'],
        razonamiento: 'Error al procesar — mostrando sugerencias generales', sugerenciasInstitucion: [], simulado: true,
      }
    }
  }

  async recommendForDependent(usuarioId: string, dependienteId: string, dependienteDoc?: DependienteDoc): Promise<RespuestaRecomendacionDependienteIa> {
    // Si vino de DependientePropietarioGuard, ya viene validado y cargado (evita una lectura extra).
    let dep: DependienteDoc | undefined = dependienteDoc
    if (!dep) {
      const depDoc = await this.db.collection(COLECCIONES.dependientes).doc(dependienteId).get()
      if (!depDoc.exists || depDoc.data()?.tutorId !== usuarioId) {
        throw new NotFoundException('Dependiente no encontrado')
      }
      dep = depDoc.data() as DependienteDoc
    }

    // datosPerfil llega como string JSON: se parsea de forma segura.
    let datosPerfil: Record<string, unknown> = {}
    if (dep.datosPerfil) {
      try {
        const parsed: unknown = JSON.parse(dep.datosPerfil)
        if (this.esObjeto(parsed)) datosPerfil = parsed
      } catch {
        datosPerfil = {}
      }
    }

    const discapacidades = Array.isArray(datosPerfil.tiposDiscapacidad)
      ? datosPerfil.tiposDiscapacidad.filter((t): t is string => this.esTexto(t)).join(', ') || 'no especificadas'
      : 'no especificadas'
    const etapaVida = this.esTexto(datosPerfil.etapaVida) ? datosPerfil.etapaVida : 'no especificada'
    const notas = this.esTexto(datosPerfil.notas) ? datosPerfil.notas : ''

    if (!this.ai) {
      return {
        proximosPasos: [
          `Buscar instituciones especializadas en ${discapacidades} para ${dep.nombreCompleto}`,
          `Explorar terapias adecuadas para la etapa de vida: ${etapaVida}`,
          'Revisar grupos de apoyo para familias cuidadoras',
        ],
        razonamiento: `Recomendaciones para ${dep.nombreCompleto} (modo demo)`, simulado: true,
      }
    }

    const prompt = `Persona bajo cuidado: ${dep.nombreCompleto}, relación con el tutor: ${dep.parentesco}.
Perfil: discapacidades=${discapacidades}, etapa de vida=${etapaVida}.
Notas del cuidador: ${notas || 'ninguna'}.
Genera 3 próximos pasos concretos y accionables para apoyar a esta persona específica en México.
Responde SOLO con JSON válido: {"proximosPasos":["paso1","paso2","paso3"],"razonamiento":"explicación breve"}`

    try {
      const result = await this.ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: { maxOutputTokens: 800, responseMimeType: 'application/json' },
      })
      const text = this.extractText(result)
      const parsed: unknown = this.parseJsonResponse(text)
      const r = this.esObjeto(parsed) ? parsed : {}
      return {
        proximosPasos: this.esArrayDeTextos(r.proximosPasos) ? r.proximosPasos : [],
        razonamiento: this.esTexto(r.razonamiento) ? r.razonamiento : '',
        simulado: false,
      }
    } catch (e: unknown) {
      this.logger.warn(`Vertex AI recommendForDependent falló (${this.mensajeError(e)}) — mostrando sugerencias generales`)
      return {
        proximosPasos: [
          `Busca instituciones de ${discapacidades} cerca de ti`,
          'Completa el historial de necesidades del familiar',
          'Consulta el grupo de familias cuidadoras en la comunidad',
        ],
        razonamiento: 'Error al procesar — mostrando sugerencias generales', simulado: true,
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Resúmenes narrativos (Spec MVP Raíces: 1 párrafo y 3 párrafos)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Genera un resumen narrativo del perfil del usuario:
   * - 1 párrafo: historia interpretativa basada estrictamente en datos
   * - 3 párrafos: (1) Quién eres, (2) Tu contexto, (3) Tus intereses/aspiraciones
   *
   * RESTRICCIÓN: El prompt instruye al LLM usar SOLO los datos proporcionados.
   * Si falta un dato, se indica "no especificado". No se permite inventar información.
   */
  async generarResumen(usuarioId: string): Promise<RespuestaResumenIa> {
    const [perfil, registro, historial] = await Promise.all([
      this.getUserProfile(usuarioId),
      this.db.collection(COLECCIONES.perfiles).doc(usuarioId).get(),
      this.getUserHistory(usuarioId),
    ])

    const datosUsuario = registro.data() as PerfilDoc | undefined

    // Construir datos para el prompt (solo campos necesarios, sin datos sensibles)
    const tiposDiscapacidad = perfil?.tiposDiscapacidad
      ? parsearTiposDiscapacidad(perfil.tiposDiscapacidad)
      : []
    const escalasVida = perfil?.escalasVida ?? null
    const metasActuales = this.listarValoresJson(perfil?.metasActuales)
    const areasApoyo = this.listarValoresJson(perfil?.areasApoyo)
    const areasInteres = this.listarValoresJson(perfil?.areasInteres)
    const viabilidadEconomica = perfil?.viabilidadEconomica ?? 'no especificada'
    const preferenciaFormato = perfil?.preferenciaFormato ?? 'no especificada'
    const tieneDiagnostico = perfil?.tieneDiagnostico ?? false
    const temporalidadOrigen = perfil?.temporalidadOrigen ?? 'no especificada'

    const datosParaPrompt = `
DATOS DEL USUARIO (usar EXCLUSIVAMENTE estos datos, NO inventar información):
- Nombre: ${datosUsuario?.nombreCompleto ?? 'no especificado'}
- Rol: ${datosUsuario?.rol ?? 'no especificado'}
- Ciudad: ${datosUsuario?.ciudad ?? 'no especificada'}, ${datosUsuario?.estado ?? ''}
- Etapa de vida: ${perfil?.etapaVida ?? 'no especificada'}
- Discapacidades: ${tiposDiscapacidad.length > 0 ? tiposDiscapacidad.join(', ') : 'no especificadas'}
- Diagnóstico formal: ${tieneDiagnostico ? 'Sí' : 'No'}
- Temporalidad/Origen: ${temporalidadOrigen}
- Escalas de vida: ${escalasVida ? JSON.stringify(escalasVida) : 'no completadas'}
- Nivel de apoyo: ${perfil?.nivelApoyo ?? 'no especificado'}
- Metas actuales: ${metasActuales.length > 0 ? metasActuales.join(', ') : 'no especificadas'}
- Áreas de apoyo: ${areasApoyo.length > 0 ? areasApoyo.join(', ') : 'no especificadas'}
- Áreas de interés: ${areasInteres.length > 0 ? areasInteres.join(', ') : 'no especificadas'}
- Preocupaciones: ${perfil?.preocupacionesActuales ?? 'ninguna'}
- Viabilidad económica: ${viabilidadEconomica}
- Preferencia de formato: ${preferenciaFormato}
- Publicaciones en comunidad: ${historial.cantidadPublicaciones}
- Solicitudes de empleo: ${historial.cantidadPostulaciones}
- Favoritos guardados: ${historial.favoritos.length}
- Historial educativo: ${this.listarValoresJson(perfil?.historialEducacion).join(', ') || 'no especificado'}
- Historial de terapia: ${this.listarValoresJson(perfil?.historialTerapia).join(', ') || 'no especificado'}
`

    if (!this.ai || !perfil) {
      return {
        resumenUnParrafo: 'Datos insuficientes para generar un resumen personalizado. Completa tu perfil para obtener un resumen detallado.',
        resumenTresParrafos: {
          quienEres: 'Completa tu perfil para generar un resumen personalizado.',
          contexto: '',
          intereses: '',
        },
        simulado: true,
      }
    }

    const prompt = `Genera un resumen narrativo sobre esta persona basándote EXCLUSIVAMENTE en los datos proporcionados.

REGLAS ESTRICTAS:
1. Usa SOLO la información listada en los datos del usuario.
2. NO inventes datos no proporcionados.
3. Si un dato falta, indica "no especificado" o "no ha proporcionado esta información".
4. El tono debe ser empático, respetuoso y positivo.
5. Adapta el lenguaje al contexto de la plataforma Raíces (apoyo a personas con discapacidad).
6. El resumen de 1 párrafo debe tener entre 80 y 150 palabras.
7. Cada párrafo del resumen de 3 párrafos debe tener entre 40 y 80 palabras.

${datosParaPrompt}

Responde SOLO con JSON válido:
{
  "resumenUnParrafo": "historia interpretativa en 1 párrafo",
  "resumenTresParrafos": {
    "quienEres": "primer párrafo: quién es esta persona",
    "contexto": "segundo párrafo: su contexto y situación actual",
    "intereses": "tercer párrafo: sus intereses, metas y aspiraciones"
  }
}`

    try {
      const result = await this.ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: { maxOutputTokens: 800, responseMimeType: 'application/json' },
      })
      const text = this.extractText(result)
      return { ...this.normalizarResumen(this.parseJsonResponse(text)), simulado: false }
    } catch (e: unknown) {
      this.logger.warn(`generarResumen falló (${this.mensajeError(e)}) — usando respuesta genérica`)
      return {
        resumenUnParrafo: 'No se pudo generar el resumen en este momento. Intenta de nuevo más tarde.',
        resumenTresParrafos: {
          quienEres: 'No se pudo generar el resumen.',
          contexto: '',
          intereses: '',
        },
        simulado: true,
      }
    }
  }
}

/** Mensaje de error legible a partir de un valor desconocido (uso libre del módulo). */
function mensajeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
