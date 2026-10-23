import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GoogleGenAI } from '@google/genai'
import type { ThinkingLevel } from '@google/genai'

/** Categorías de moderación permitidas (contrato estricto con el frontend). */
export const CATEGORIAS_MODERACION = [
  'comunidad',
  'duda_tramite',
  'logro_personal',
  'recurso_util',
  'spam',
  'lenguaje_inapropiado',
  'desinformacion',
  'datos_sensibles',
] as const

export type CategoriaModeracion = (typeof CATEGORIAS_MODERACION)[number]

/** Resultado de la revisión automática de una publicación. */
export interface ResultadoModeracion {
  aprobado: boolean
  categoria: CategoriaModeracion
  /** Explicación breve (1-2 oraciones) del por qué se aprobó o rechazó. */
  razon: string
  /** Recomendación constructiva en Lectura Fácil (solo rechazos, cuando aplica). */
  sugerenciaMejora: string | null
  /** gemini: revisión con IA | reglas: mecanismo de respaldo de código. */
  fuente: 'gemini' | 'reglas'
  fecha: string
}

/** JSON que se espera de Gemini. Campos opcionales: el modelo puede omitirlos. */
interface RespuestaGeminiModeracion {
  aprobado?: unknown
  categoria?: unknown
  razon?: unknown
  /** El prompt pide `sugerencia_mejora`; se tolera también `sugerenciaMejora`. */
  sugerenciaMejora?: unknown
  sugerencia_mejora?: unknown
}

/**
 * Nivel de thinking para modelos Gemini 3.x (mismo criterio que
 * `ValidationService`/`AiService`): el thinking dinámico consume
 * maxOutputTokens y truncaría/vaciaría el JSON de salida.
 */
const NIVEL_THINKING = 'MINIMAL' as unknown as ThinkingLevel

/** Palabras/ofensivas groseras en español (insultos, capacitismo, burla). */
const PATRONES_ODIO = [
  /\bpendej/,
  /\bidiota/,
  /\bimbecil\b|\bimbécil\b/,
  /\bestupid/,
  /\binutil\b|\binútil\b/,
  /\bretardad/,
  /\bmongol/,
  /\bmal nacid/,
  /hijo de (tu |la )?put/,
  /\blastima\b.*\bdiscapacitad/,
  /no deber(i|í)an (salir|estar)/,
  /discapacitad\w* de mierda/,
]

/** Promesas médicas falsas / remedios milagro peligrosos. */
const PATRONES_DESINFORMACION = [
  /(cura|sanar|elimin|recuperar)[^.!?]{0,40}(discapacidad|autismo|par[áa]lisis|paraplejia|cegera|sordera)/i,
  /(remedio|medicina|tratamiento|terapia)\s+milagros?\w*/i,
  /cura\s+milagrosa/i,
  /vacun[^\n]{0,30}causa[^\n]{0,30}autismo/i,
]

/** Spam, cadenas, esquemas piramidales y publicidad engañosa. */
const PATRONES_SPAM = [
  /(comparte|reenv[íi]a|pasa)[^\n]{0,50}(cadena|10 personas|a todos|10 amigos)/i,
  /cadena de (texto|san[óo]n|suerte)/i,
  /gana(r)? (dinero )?(f[áa]cil|r[áa]pido)/i,
  /(esquema )?piramidal|ganancias garantizadas|multi[- ]?nivel/i,
  /inversi[óo]n con retorno garantizado/i,
]

/** Datos bancarios o credenciales expuestas. */
const PATRONES_DATOS_SENSIBLES = [
  // Tarjetas de 16 dígitos (con o sin espacios/guiones)
  /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/,
  // CVV / contraseñas escritas
  /\b(cvv|cvc)\b[:= ]?\d/i,
  /(contrase[ñn]a|password|pin)\s*[:=]\s*\S+/i,
]

/** Rechazo si la publicación solo contiene secuencias repetitivas o MAYÚSCULAS. */
function esRelleno(texto: string): boolean {
  if (/(.)\1{9,}/.test(texto)) return true
  const letras = texto.replace(/[^a-záéíóúñü]/gi, '')
  return letras.length >= 40 && letras === letras.toUpperCase()
}

/**
 * Moderación automática de publicaciones de la comunidad (Gemini con
 * mecanismo de respaldo por reglas, misma filosofía que `ValidationService`).
 *
 * Objetivo: que el feed comunitario sea seguro, empático y relevante para
 * personas con discapacidad, familias, tutores y profesionales en México.
 *
 * - Intenta la revisión con Gemini (`GEMINI_*` vía ADC).
 * - Si la IA no está disponible o falla, `moderarPorReglas` decide con
 *   patrones de código para que la app nunca se detenga.
 */
@Injectable()
export class ModeracionService {
  private readonly logger = new Logger(ModeracionService.name)
  private ai: GoogleGenAI | null = null
  private modelName = 'gemini-3.1-flash-lite'

  constructor(private readonly config: ConfigService) {
    this.initializeModel()
  }

  /** Misma configuración que AiService/ValidationService: Gemini vía ADC. */
  private initializeModel(): void {
    const project = this.config.get<string>('GEMINI_PROJECT_ID')
      ?? this.config.get<string>('VERTEX_AI_PROJECT_ID')
      ?? this.config.get<string>('FIREBASE_PROJECT_ID')
    const location = this.config.get<string>('GEMINI_LOCATION')
      ?? this.config.get<string>('VERTEX_AI_LOCATION')
      ?? 'global'
    this.modelName = this.config.get<string>('GEMINI_MODEL')
      ?? this.config.get<string>('VERTEX_AI_MODEL')
      ?? 'gemini-3.1-flash-lite'

    if (!project) {
      this.logger.warn('Gemini: proyecto no configurado — moderación por reglas de respaldo')
      return
    }

    try {
      // `vertexai: true` = Gemini Enterprise Agent Platform (antes Vertex AI) con ADC.
      this.ai = new GoogleGenAI({ vertexai: true, project, location })
      this.logger.log(`✅ Moderación IA inicializada: project=${project}, location=${location}, model=${this.modelName}`)
    } catch (e: unknown) {
      this.logger.warn(`⚠️  Gemini no disponible para moderación (${this.mensajeError(e)}) — usando reglas de respaldo`)
      this.ai = null
    }
  }

  /**
   * Evalúa una publicación antes de hacerla visible en el feed.
   * Nunca lanza: si Gemini falla, decide con `moderarPorReglas`.
   */
  async moderarPublicacion(contenido: string, categoriaUsuario?: string): Promise<ResultadoModeracion> {
    if (!this.ai) return this.moderarPorReglas(contenido, categoriaUsuario)

    try {
      const result = await this.ai.models.generateContent({
        model: this.modelName,
        contents: this.construirPrompt(contenido, categoriaUsuario),
        config: {
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingLevel: NIVEL_THINKING },
          responseMimeType: 'application/json',
        },
      })
      const text = this.extractText(result)
      if (!text) throw new Error('Respuesta vacía de Gemini')
      return this.normalizarRespuesta(this.parseJsonResponse(text), categoriaUsuario)
    } catch (e: unknown) {
      this.logger.warn(`Moderación IA falló (${this.mensajeError(e)}) — usando reglas de respaldo`)
      return this.moderarPorReglas(contenido, categoriaUsuario)
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Prompt y normalización de la respuesta de Gemini
  // ═══════════════════════════════════════════════════════════════════

  private construirPrompt(contenido: string, categoriaUsuario?: string): string {
    return `Eres el sistema de Moderación Automática y Seguridad Comunitaria de "Raíces", una plataforma digital enfocada en la inclusión integral de Personas con Discapacidad (PCD), sus familias, tutores, profesionales y organizaciones en México.

Tu objetivo principal es evaluar cada publicación antes de que sea visible en el feed comunitario, garantizando que sea un espacio seguro, empático, relevante y de verdadero valor para la comunidad.

--- CRITERIOS DE EVALUACIÓN ---

1. PUBLICACIONES PERMITIDAS Y DE VALOR (APROBAR - "aprobado": true):
   - Experiencias personales, logros o testimonios sobre el proceso de inclusión (educativo, laboral, social, clínico).
   - Consultas o dudas respetuosas sobre trámites (CEDis, becas, programas del DIF, etc.), servicios, escuelas (CAM/USAER) o salud.
   - Compartir recursos útiles, guías, eventos inclusivos, talleres o vacantes laborales adaptadas.
   - Mensajes de apoyo, concientización, comunidad y acompañamiento positivo.

2. PUBLICACIONES RECHAZADAS (RECHAZAR - "aprobado": false):
   - Spam o Contenido Irrelevante: Memes fuera de contexto, cadenas de texto, mensajes repetitivos o contenido que no aporte valor a la comunidad.
   - Venta no autorizada y Publicidad Engañosa: Promoción de productos milagro, esquemas piramidales o ventas comerciales ajenas a la inclusión. (categoría: "spam")
   - Lenguaje de Odio, Discriminación o Acoso: Cualquier tipo de insulto, capacitismo, discriminación, burla o agresión verbal.
   - Desinformación Médica o Legal Grave: Promoción de tratamientos médicos peligrosos no científicos, remedios milagro o asesoría legal falsa.
   - Exposición de Datos Sensibles (Privacidad): Números de tarjetas bancarias, contraseñas, o direcciones exactas de personas vulnerables sin consentimiento.
   - Contenido Violento o Explícito: Cualquier tipo de imagen o texto violento, de odio o no apto para todo público. (categoría: "lenguaje_inapropiado")

--- FORMATO DE SALIDA (ESTRICTO JSON) ---

Responde ÚNICAMENTE con un objeto JSON válido con la siguiente estructura:

{
  "aprobado": true | false,
  "categoria": "comunidad" | "duda_tramite" | "logro_personal" | "recurso_util" | "spam" | "lenguaje_inapropiado" | "desinformacion" | "datos_sensibles",
  "razon": "Explicación breve de 1 o 2 oraciones sobre por qué se aprobó o rechazó la publicación.",
  "sugerencia_mejora": "En caso de rechazo por razones menores (ej. refrasear o aportar más detalle), proporciona una recomendación constructiva en Lectura Fácil para que el usuario pueda corregir su publicación. Si no aplica, deja el campo vacío."
}

--- ENTRADA DE LA PUBLICACIÓN ---
Título: (la publicación no tiene título; evalúa solo el contenido)
Contenido: ${contenido}
Etiquetas/Categoría seleccionada: ${categoriaUsuario ?? 'general'}`
  }

  /** Extrae el texto de la respuesta de Gemini de forma segura (mismo contrato que ValidationService). */
  private extractText(result: unknown): string {
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

  /** Parsea JSON tolerando bloques ```json. Devuelve unknown: el llamador hace narrowing. */
  private parseJsonResponse(text: string): unknown {
    let cleaned = text.trim()
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) cleaned = fence[1].trim()
    try {
      return JSON.parse(cleaned) as unknown
    } catch {
      throw new Error('Respuesta de Gemini no es JSON válido')
    }
  }

  /** Normaliza la salida libre de Gemini al contrato `ResultadoModeracion`, sin confiar en sus tipos. */
  private normalizarRespuesta(parsed: unknown, categoriaUsuario?: string): ResultadoModeracion {
    const obj: RespuestaGeminiModeracion = this.esObjeto(parsed) ? parsed : {}
    const aprobado = obj.aprobado === true
    const categoria = this.categoriaValida(obj.categoria) ?? (aprobado ? this.categoriaInicial(categoriaUsuario) : 'spam')
    const razon = this.esTexto(obj.razon) && obj.razon.trim()
      ? obj.razon.trim()
      : aprobado
        ? 'La publicación cumple las normas de la comunidad.'
        : 'La publicación no cumple las normas de la comunidad.'
    const sugerenciaBruta = this.esTexto(obj.sugerenciaMejora) ? obj.sugerenciaMejora : obj.sugerencia_mejora
    const sugerencia = this.esTexto(sugerenciaBruta) && sugerenciaBruta.trim()
      ? sugerenciaBruta.trim()
      : null

    return { aprobado, categoria, razon, sugerenciaMejora: sugerencia, fuente: 'gemini', fecha: new Date().toISOString() }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Fallback por reglas (Gemini no disponible o falló)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Revisión determinista con patrones de código. Orden: primero lo más
   * grave (datos sensibles, odio, desinformación) y, si nada coincide,
   * aprueba para no bloquear contenido legítimo de la comunidad.
   */
  moderarPorReglas(contenido: string, categoriaUsuario?: string): ResultadoModeracion {
    const texto = contenido ?? ''
    const base = { fuente: 'reglas' as const, fecha: new Date().toISOString() }

    const rechazar = (categoria: CategoriaModeracion, razon: string, sugerenciaMejora: string): ResultadoModeracion => ({
      aprobado: false, categoria, razon, sugerenciaMejora, ...base,
    })

    if (PATRONES_DATOS_SENSIBLES.some(p => p.test(texto))) {
      return rechazar(
        'datos_sensibles',
        'Tu publicación contiene datos personales sensibles (números de tarjetas o contraseñas), que no deben compartirse en la comunidad.',
        'Elimina los números de tarjeta o contraseñas. Si necesitas ayuda con un trámite financiero, describe la situación sin datos privados.',
      )
    }
    if (PATRONES_ODIO.some(p => p.test(texto))) {
      return rechazar(
        'lenguaje_inapropiado',
        'Tu publicación contiene lenguaje ofensivo o discriminatorio, que no está permitido en la comunidad.',
        'Reescribe con respeto. Puedes expresar tu enojo o frustración sin insultar a otras personas.',
      )
    }
    if (PATRONES_DESINFORMACION.some(p => p.test(texto))) {
      return rechazar(
        'desinformacion',
        'Tu publicación promueve tratamientos no científicos, lo cual puede poner en riesgo la salud de las personas.',
        'Comparte solo información respaldada por fuentes médicas. Si quieres recomendar algo, indica quién lo recomendó y qué profesional lo avala.',
      )
    }
    if (PATRONES_SPAM.some(p => p.test(texto)) || esRelleno(texto)) {
      return rechazar(
        'spam',
        'Tu publicación parece spam, una cadena o contenido sin valor para la comunidad.',
        'Comparte algo útil para la comunidad: una experiencia, una duda o un recurso sobre inclusión.',
      )
    }

    return {
      aprobado: true,
      categoria: this.categoriaInicial(categoriaUsuario),
      razon: 'La publicación cumple las normas de la comunidad.',
      sugerenciaMejora: null,
      ...base,
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Utilidades
  // ═══════════════════════════════════════════════════════════════════

  /** Categoría aprobada inicial: la del usuario si es válida, si no 'comunidad'. */
  private categoriaInicial(categoriaUsuario?: string): CategoriaModeracion {
    return this.categoriaValida(categoriaUsuario) ?? 'comunidad'
  }

  private categoriaValida(valor: unknown): CategoriaModeracion | null {
    return this.esTexto(valor) && (CATEGORIAS_MODERACION as readonly string[]).includes(valor)
      ? (valor as CategoriaModeracion)
      : null
  }

  private esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
  }

  private esTexto(v: unknown): v is string {
    return typeof v === 'string'
  }

  private mensajeError(e: unknown): string {
    return e instanceof Error ? e.message : String(e)
  }
}
