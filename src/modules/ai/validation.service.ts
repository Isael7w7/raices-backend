import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GoogleGenAI } from '@google/genai'
import { Firestore, DocumentData } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { esCurpValida } from '../../common/validators/curp.validator'
import { DetallesValidacionDto, ResultadoValidacionIaDto } from './dto/validacion-ia.dto'
import type { PerfilDoc, PerfilExtendidoDoc, InstitucionDoc, DocumentoIdentidadDoc } from '../../common/interfaces/firestore-documents.interface'

/** Detalle de criterios de coherencia evaluados por la validación. */
export type DetallesValidacion = DetallesValidacionDto

/** Resultado completo de una validación (IA, fallback por reglas o admin). */
export type ResultadoValidacion = ResultadoValidacionIaDto

/** Registro persistido en la colección `validacionesIA` (auditoría + historial). */
export interface RegistroValidacionIa extends ResultadoValidacion {
  id: string
  /** automatica: registro/subida de documento | fallback: reglas por caída de IA | override: decisión del admin */
  tipo: 'automatica' | 'fallback' | 'override'
  adminId: string | null
}

/** Datos recopilados de Firestore para analizar la coherencia del usuario. */
export interface DatosUsuario {
  perfil: PerfilDoc
  perfilExtendido: PerfilExtendidoDoc | null
  documentos: DocumentoIdentidadDoc[]
  institucion: InstitucionDoc | null
}

/** Campos que aplicarResultado escribe en el perfil del usuario. */
interface ActualizacionPerfilValidacion {
  fechaUltimaValidacionIA: string
  verificado?: boolean
  fechaVerificacion?: string
  metodoVerificacion?: 'ia' | 'admin'
  estadoValidacionIdentidad?: 'aprobado'
}

/** Estructura esperada del JSON de Gemini. Campos opcionales: el modelo puede omitirlos. */
interface RespuestaGeminiValidacion {
  confianza?: unknown
  razonamiento?: unknown
  detalles?: {
    nombreCoherente?: unknown
    emailCoherente?: unknown
    curpCoherente?: unknown
    rolCoherente?: unknown
    institucionCoherente?: unknown
    observaciones?: unknown
  }
}

const TIPOS_DOCUMENTO = ['curp', 'identificacion_oficial', 'certificado_discapacidad'] as const
const ROLES_VALIDOS = ['pcd', 'padre_tutor', 'tutor', 'institucion', 'especialista', 'empresa', 'institucional', 'admin']

/**
 * Validación automática de usuarios por IA (Vertex AI / Gemini).
 *
 * Objetivo: reducir al mínimo la intervención del administrador. Las cuentas
 * válidas se aprueban solas; la revisión humana es el ÚLTIMO recurso y solo
 * ocurre para casos dudosos o con baja confianza.
 *
 * Reglas de decisión — aplicadas de forma DETERMINISTA en código (el modelo
 * propone confianza y criterios, pero el backend decide):
 *  - Confianza >= 80% y criterios clave pasan → aprobado: true (verificado al instante)
 *  - Confianza 50-79% o dudas menores         → aprobado: false, requiereRevisionManual: true
 *  - Confianza < 50% o problemas graves       → aprobado: false, requiereRevisionManual: false
 *
 * Mecanismo de fallback (`validarPorReglas`): si Vertex AI no está disponible,
 * se valida con reglas de código (formato de nombre, email, presencia/validez
 * de CURP) para que la app nunca se detenga.
 */
@Injectable()
export class ValidationService {
  private readonly logger = new Logger('ValidationService')
  private ai: GoogleGenAI | null = null
  private modelName: string = 'gemini-2.0-flash'

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly config: ConfigService,
  ) {
    this.initializeModel()
  }

  /** Misma configuración que AiService: Gemini vía Application Default Credentials. */
  private initializeModel(): void {
    const project = this.config.get<string>('VERTEX_AI_PROJECT_ID') ?? this.config.get<string>('FIREBASE_PROJECT_ID')
    const location = this.config.get<string>('VERTEX_AI_LOCATION') ?? 'us-central1'
    this.modelName = this.config.get<string>('VERTEX_AI_MODEL') ?? 'gemini-2.0-flash'

    if (!project) {
      this.logger.warn('Vertex AI: VERTEX_AI_PROJECT_ID/FIREBASE_PROJECT_ID no configurado — validación de usuarios por reglas de respaldo')
      return
    }

    try {
      this.ai = new GoogleGenAI({ vertexai: true, project, location })
      this.logger.log(`✅ Validación IA inicializada: project=${project}, location=${location}, model=${this.modelName}`)
    } catch (e: unknown) {
      this.logger.warn(`⚠️  Vertex AI no disponible para validación (${this.mensajeError(e)}) — usando reglas de respaldo`)
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

  /** Mensaje de error legible a partir de un valor desconocido (catch). */
  private mensajeError(e: unknown): string {
    return e instanceof Error ? e.message : String(e)
  }

  // ═══════════════════════════════════════════════════════════════════
  // Recopilación de datos
  // ═══════════════════════════════════════════════════════════════════

  /** Recopila perfil, perfil extendido, documentos de identidad e institución. */
  private async recopilarDatos(usuarioId: string): Promise<DatosUsuario> {
    const perfilDoc = await this.db.collection(COLECCIONES.perfiles).doc(usuarioId).get()
    if (!perfilDoc.exists) throw new NotFoundException('Usuario no encontrado')
    const perfil = perfilDoc.data() as PerfilDoc

    const extSnap = await this.db.collection(COLECCIONES.perfilesExtendidos)
      .where('usuarioId', '==', usuarioId).limit(1).get()
    const perfilExtendido = extSnap.empty ? null : (extSnap.docs[0].data() as PerfilExtendidoDoc)

    const docsSnap = await this.db.collection(COLECCIONES.documentosIdentidad)
      .where('usuarioId', '==', usuarioId).get()
    const documentos = docsSnap.docs.map(d => d.data() as DocumentoIdentidadDoc)

    let institucion: InstitucionDoc | null = null
    if (perfil.rol === 'institucion') {
      const instDoc = await this.db.collection(COLECCIONES.instituciones).doc(usuarioId).get()
      if (instDoc.exists) institucion = instDoc.data() as InstitucionDoc
    }

    return { perfil, perfilExtendido, documentos, institucion }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Validación con Gemini
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Ejecuta la validación del usuario: intenta con Gemini y, si la IA no está
   * disponible o falla, cae al mecanismo de fallback `validarPorReglas`.
   */
  async validarUsuario(usuarioId: string): Promise<ResultadoValidacion> {
    const datos = await this.recopilarDatos(usuarioId)

    if (!this.ai) return this.validarPorReglas(datos, usuarioId)

    try {
      const result = await this.ai.models.generateContent({
        model: this.modelName,
        contents: this.construirPrompt(datos),
        config: { maxOutputTokens: 800, responseMimeType: 'application/json' },
      })
      const text = this.extractText(result)
      if (!text) throw new Error('Respuesta vacía de Vertex AI')
      return this.normalizarRespuestaIa(this.parseJsonResponse(text), datos, usuarioId)
    } catch (e: unknown) {
      this.logger.warn(`Validación IA falló para ${usuarioId} (${this.mensajeError(e)}) — usando reglas de respaldo`)
      return this.validarPorReglas(datos, usuarioId)
    }
  }

  /** Extrae el texto de la respuesta de Gemini de forma segura (mismo contrato que AiService). */
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

  /** Parsea JSON de la respuesta tolerando bloques ```json. Devuelve unknown: el llamador narrowing. */
  private parseJsonResponse(text: string): unknown {
    let cleaned = text.trim()
    const fence = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
    if (fence) cleaned = fence[1].trim()
    try {
      return JSON.parse(cleaned) as unknown
    } catch {
      throw new Error('Respuesta de Gemini no es JSON válido')
    }
  }

  /** Normaliza la salida libre de Gemini a la estructura esperada, sin confiar en sus tipos. */
  private extraerRespuestaGemini(parsed: unknown): RespuestaGeminiValidacion {
    if (!this.esObjeto(parsed)) return {}
    const detalles = this.esObjeto(parsed.detalles)
      ? (parsed.detalles as RespuestaGeminiValidacion['detalles'])
      : undefined
    return { confianza: parsed.confianza, razonamiento: parsed.razonamiento, detalles }
  }

  /** Prompt estructurado: análisis de coherencia + reglas de decisión obligatorias. */
  private construirPrompt(datos: DatosUsuario): string {
    const { perfil, perfilExtendido, documentos, institucion } = datos

    const documentosTexto = documentos.length > 0
      ? documentos
          .map(d => `- ${d.tipo ?? 'desconocido'} (estado: ${d.estado ?? 'desconocido'}${d.numeroCurp ? `, CURP escrita: ${d.numeroCurp}` : ''})`)
          .join('\n')
      : '- Sin documentos de identidad subidos'

    const institucionTexto = perfil.rol === 'institucion' && institucion
      ? `\nDATOS DE LA INSTITUCIÓN:\n- Nombre: ${institucion.nombre ?? 'no especificado'}\n- Categoría: ${institucion.categoria ?? 'no especificada'}\n- Ciudad: ${institucion.ciudad ?? 'no especificada'}\n- Email de contacto: ${institucion.emailContacto ?? 'no especificado'}\n- Verificada: ${institucion.verificada ? 'Sí' : 'No'}`
      : perfil.rol === 'institucion'
        ? '\nDATOS DE LA INSTITUCIÓN:\n- No existe el documento de institución asociado a esta cuenta'
        : ''

    return `Eres el validador automático de identidades de "Raíces para Florecer", plataforma mexicana de apoyo para personas con discapacidad.
Tu trabajo es decidir si esta cuenta es válida para verificarse sola, necesita revisión humana de un administrador, o debe rechazarse.

DATOS DEL PERFIL:
- Nombre completo: ${perfil.nombreCompleto ?? 'no especificado'}
- Email: ${perfil.email ?? 'no especificado'}
- CURP: ${perfil.curp ?? 'no registrada'}
- Rol: ${perfil.rol ?? 'no especificado'}
- Ciudad/Estado: ${perfil.ciudad ?? 'no especificada'}, ${perfil.estado ?? ''}
- Etapa de vida: ${perfilExtendido?.etapaVida ?? 'no especificada'}
- Discapacidades: ${perfilExtendido?.tiposDiscapacidad ?? 'no especificadas'}
- Fecha de nacimiento: ${perfil.fechaNacimiento ?? 'no especificada'}

DOCUMENTOS DE IDENTIDAD SUBIDOS:
${documentosTexto}${institucionTexto}

CRITERIOS A EVALUAR (devuelve un booleano por criterio):
1. nombreCoherente: parece un nombre real de persona u organización (nombre y apellido presentes, sin caracteres extraños ni secuencias aleatorias).
2. emailCoherente: formato válido y coherente con el nombre o la institución.
3. curpCoherente: la CURP registrada cumple el formato oficial mexicano de 18 caracteres y es consistente con el nombre y la fecha de nacimiento. Si NO hay CURP registrada, evalúa true salvo datos contradictorios.
4. rolCoherente: el rol es válido y consistente con el resto de los datos.
5. institucionCoherente: (solo si rol=institucion) la institución tiene datos básicos completos y coincidentes con el perfil. Para otros roles evalúa true.

REGLAS DE DECISIÓN OBLIGATORIAS (aplícalas exactamente):
- Confianza >= 80 y todos los criterios clave (nombre, email, rol y CURP si existe) pasan → aprobado: true, requiereRevisionManual: false.
- Confianza 50-79 o dudas menores → aprobado: false, requiereRevisionManual: true.
- Confianza < 50 o problemas graves (datos falsificados, incoherencias evidentes, CURP inválida) → aprobado: false, requiereRevisionManual: false.
- Si NO hay CURP ni documentos de identidad, la confianza NO debe superar 79: los datos no han sido verificados con documentos.

Responde SOLO con JSON válido:
{
  "aprobado": boolean,
  "requiereRevisionManual": boolean,
  "confianza": number,
  "razonamiento": "explicación breve en español",
  "detalles": {
    "nombreCoherente": boolean,
    "emailCoherente": boolean,
    "curpCoherente": boolean,
    "rolCoherente": boolean,
    "institucionCoherente": boolean,
    "observaciones": ["observación 1", "observación 2"]
  }
}`
  }

  // ═══════════════════════════════════════════════════════════════════
  // Decisión determinista (nunca se delega al criterio libre del modelo)
  // ═══════════════════════════════════════════════════════════════════

  /** Aplica las reglas de decisión del manual sobre confianza + criterios clave. */
  private decidir(confianza: number, detalles: DetallesValidacion, datos: DatosUsuario): DecisionValidacion {
    const tieneCurp = this.esTexto(datos.perfil.curp) && datos.perfil.curp.trim().length > 0
    const criteriosClave = detalles.nombreCoherente
      && detalles.emailCoherente
      && detalles.rolCoherente
      && (!tieneCurp || detalles.curpCoherente)

    if (confianza >= 80 && criteriosClave) return { aprobado: true, requiereRevisionManual: false }
    if (confianza >= 50) return { aprobado: false, requiereRevisionManual: true }
    return { aprobado: false, requiereRevisionManual: false }
  }

  /** Normaliza la salida libre de Gemini a un ResultadoValidacion determinista. */
  private normalizarRespuestaIa(parsed: unknown, datos: DatosUsuario, usuarioId: string): ResultadoValidacion {
    const base = this.criteriosPorReglas(datos)
    const respuesta = this.extraerRespuestaGemini(parsed)
    const pd = respuesta.detalles ?? {}

    /** El modelo puede omitir cualquier criterio: se usa el cálculo por reglas como respaldo. */
    const esBool = (v: unknown, respaldo: boolean): boolean => (typeof v === 'boolean' ? v : respaldo)

    const observacionesModelo = Array.isArray(pd.observaciones)
      ? pd.observaciones.filter((o): o is string => this.esTexto(o))
      : []

    const detalles: DetallesValidacion = {
      nombreCoherente: esBool(pd.nombreCoherente, base.nombreCoherente),
      emailCoherente: esBool(pd.emailCoherente, base.emailCoherente),
      curpCoherente: esBool(pd.curpCoherente, base.curpCoherente),
      rolCoherente: esBool(pd.rolCoherente, base.rolCoherente),
      institucionCoherente: esBool(pd.institucionCoherente, base.institucionCoherente),
      documentosPresentes: base.documentosPresentes,
      documentosFaltantes: base.documentosFaltantes,
      observaciones: [...base.observaciones, ...observacionesModelo],
    }

    const confianzaModelo = Number(respuesta.confianza)
    let confianza = Number.isFinite(confianzaModelo) ? confianzaModelo : base.confianza
    confianza = Math.min(100, Math.max(0, Math.round(confianza)))

    // Problema grave determinista: CURP registrada con formato inválido.
    // Se impone sobre la opinión del modelo y fuerza el rechazo (< 50).
    const curp = this.esTexto(datos.perfil.curp) ? datos.perfil.curp.trim().toUpperCase() : ''
    if (curp && !esCurpValida(curp)) {
      detalles.curpCoherente = false
      confianza = Math.min(confianza, 40)
      detalles.observaciones.push('CURP registrada con formato inválido (problema grave)')
    }

    const decision = this.decidir(confianza, detalles, datos)
    const razonamiento = this.esTexto(respuesta.razonamiento) && respuesta.razonamiento.trim()
      ? respuesta.razonamiento
      : 'Validación automática por IA (Gemini)'

    return {
      usuarioId,
      aprobado: decision.aprobado,
      requiereRevisionManual: decision.requiereRevisionManual,
      confianza,
      razonamiento,
      detalles,
      fuente: 'gemini',
      fechaValidacion: new Date().toISOString(),
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Fallback por reglas de código (Vertex AI caído o no configurado)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Mecanismo de fallback: valida con reglas de código (formato de nombre,
   * email, presencia/validez de CURP, documentos) para evitar que la app
   * se detenga cuando Vertex AI falla o no está disponible.
   */
  validarPorReglas(datos: DatosUsuario, usuarioId: string): ResultadoValidacion {
    const base = this.criteriosPorReglas(datos)
    const decision = this.decidir(base.confianza, base, datos)

    const razonamiento = base.observaciones.length > 0
      ? `Validación por reglas de respaldo (IA no disponible): ${base.observaciones.join(' ')}`
      : 'Validación por reglas de respaldo (IA no disponible): datos coherentes'

    return {
      usuarioId,
      aprobado: decision.aprobado,
      requiereRevisionManual: decision.requiereRevisionManual,
      confianza: base.confianza,
      razonamiento,
      detalles: {
        nombreCoherente: base.nombreCoherente,
        emailCoherente: base.emailCoherente,
        curpCoherente: base.curpCoherente,
        rolCoherente: base.rolCoherente,
        institucionCoherente: base.institucionCoherente,
        documentosPresentes: base.documentosPresentes,
        documentosFaltantes: base.documentosFaltantes,
        observaciones: base.observaciones,
      },
      fuente: 'reglas',
      fechaValidacion: new Date().toISOString(),
    }
  }

  /** Criterios y confianza calculados con reglas deterministas de código. */
  private criteriosPorReglas(datos: DatosUsuario): DetallesValidacion & { confianza: number } {
    const { perfil, perfilExtendido, documentos, institucion } = datos
    const observaciones: string[] = []
    let confianza = 0

    // Nombre (20 pts): al menos nombre y apellido, sin caracteres extraños.
    const nombre = perfil.nombreCompleto?.trim() ?? ''
    const nombreCoherente = nombre.length >= 5
      && nombre.split(/\s+/).length >= 2
      && /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]+$/.test(nombre)
    if (nombreCoherente) {
      confianza += 20
    } else {
      observaciones.push('El nombre no cumple el formato esperado (mínimo nombre y apellido)')
    }

    // Email (20 pts): formato básico válido.
    const email = perfil.email?.trim() ?? ''
    const emailCoherente = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
    if (emailCoherente) {
      confianza += 20
    } else {
      observaciones.push('El email no tiene un formato válido')
    }

    // CURP (25 pts si es válida; 10 si no existe; problema grave si es inválida).
    const curp = perfil.curp?.trim().toUpperCase() ?? ''
    let curpCoherente = true
    if (curp) {
      if (esCurpValida(curp)) {
        confianza += 25
      } else {
        curpCoherente = false
        observaciones.push('La CURP registrada no cumple el formato oficial')
      }
    } else {
      confianza += 10
      observaciones.push('Sin CURP registrada en el perfil')
    }

    // Rol (10 pts).
    const rolCoherente = ROLES_VALIDOS.includes(perfil.rol ?? '')
    if (rolCoherente) {
      confianza += 10
    } else {
      observaciones.push(`El rol "${perfil.rol ?? 'indefinido'}" no es un rol válido`)
    }

    // Documentos de identidad (15 pts si hay alguno).
    const tipos = new Set<string>(
      documentos.map(d => d.tipo ?? '').filter(t => t !== ''),
    )
    if (tipos.size > 0) {
      confianza += 15
    } else {
      observaciones.push('Sin documentos de identidad subidos')
    }

    // Perfil extendido (5 pts): más contexto de la persona.
    if (perfilExtendido) confianza += 5

    // Institución (10 pts, solo rol institucion): datos básicos completos.
    let institucionCoherente = true
    if (perfil.rol === 'institucion') {
      institucionCoherente = !!institucion && !!institucion.nombre && !!institucion.categoria
      if (institucionCoherente) {
        confianza += 10
      } else {
        observaciones.push('La institución asociada carece de datos básicos')
      }
    }

    confianza = Math.min(100, Math.max(0, confianza))

    // Problema grave: CURP inválida fija la confianza por debajo de 50.
    if (curp && !curpCoherente) {
      confianza = Math.min(confianza, 40)
      observaciones.push('CURP con formato inválido (problema grave)')
    }

    return {
      nombreCoherente,
      emailCoherente,
      curpCoherente,
      rolCoherente,
      institucionCoherente,
      documentosPresentes: [...tipos],
      documentosFaltantes: TIPOS_DOCUMENTO.filter(t => !tipos.has(t)),
      observaciones,
      confianza,
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Aplicación del resultado (atómica) y flujo completo
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Aplica un resultado de validación de forma atómica: guarda el registro en
   * `validacionesIA` y actualiza `verificado` en el perfil en el MISMO batch
   * (todo o nada). Solo toca `verificado` cuando NO requiere revisión manual.
   * Si se aprueba y hay documentos de identidad pendientes, se aprueban también
   * en el mismo lote (menos trabajo manual para el administrador).
   */
  async aplicarResultado(
    usuarioId: string,
    resultado: ResultadoValidacion,
    opciones?: { tipo?: RegistroValidacionIa['tipo']; adminId?: string },
  ): Promise<RegistroValidacionIa> {
    const perfilRef = this.db.collection(COLECCIONES.perfiles).doc(usuarioId)
    const perfilSnap = await perfilRef.get()
    if (!perfilSnap.exists) throw new NotFoundException('Usuario no encontrado')

    const docsSnap = await this.db.collection(COLECCIONES.documentosIdentidad)
      .where('usuarioId', '==', usuarioId).get()
    const docsPendientes = docsSnap.docs.filter(d => d.data()?.estado === 'pendiente')

    const fecha = new Date().toISOString()

    const batch = this.db.batch()

    // Registro de auditoría e historial en validacionesIA.
    const registroRef = this.db.collection(COLECCIONES.validacionesIA).doc()
    const registro: RegistroValidacionIa = {
      id: registroRef.id,
      usuarioId,
      tipo: opciones?.tipo ?? 'automatica',
      aprobado: resultado.aprobado,
      requiereRevisionManual: resultado.requiereRevisionManual,
      confianza: resultado.confianza,
      razonamiento: resultado.razonamiento,
      detalles: resultado.detalles,
      fuente: resultado.fuente,
      adminId: opciones?.adminId ?? null,
      fechaValidacion: fecha,
    }
    batch.set(registroRef, registro)

    // Actualización atómica del perfil (mismo batch que el registro).
    const perfilUpdate: ActualizacionPerfilValidacion = { fechaUltimaValidacionIA: fecha }
    if (!resultado.requiereRevisionManual) {
      perfilUpdate.verificado = resultado.aprobado
      perfilUpdate.fechaVerificacion = fecha
      perfilUpdate.metodoVerificacion = opciones?.tipo === 'override' ? 'admin' : 'ia'
    }
    if (resultado.aprobado && docsPendientes.length > 0) {
      perfilUpdate.estadoValidacionIdentidad = 'aprobado'
      for (const doc of docsPendientes) {
        batch.update(doc.ref, { estado: 'aprobado', fechaRevision: fecha, revisadoPor: 'ia' })
      }
    }
    batch.update(perfilRef, perfilUpdate)

    await batch.commit()
    return registro
  }

  /**
   * Flujo completo usado en background (registro y subida de documentos):
   * respeta la bandera `validacionIAHabilitada` de la configuración del admin,
   * valida y aplica el resultado de una sola vez. Devuelve null si la
   * validación automática está deshabilitada.
   */
  async validarYAplicar(usuarioId: string): Promise<RegistroValidacionIa | null> {
    if (!(await this.esValidacionHabilitada())) {
      this.logger.log(`Validación IA deshabilitada por configuración — se omite para ${usuarioId}`)
      return null
    }
    const resultado = await this.validarUsuario(usuarioId)
    const tipo: RegistroValidacionIa['tipo'] = resultado.fuente === 'gemini' ? 'automatica' : 'fallback'
    return this.aplicarResultado(usuarioId, resultado, { tipo })
  }

  /** Lee la bandera de configuración del admin (default: habilitada, como CONFIGURACION_POR_DEFECTO). */
  private async esValidacionHabilitada(): Promise<boolean> {
    try {
      const snap = await this.db.collection(COLECCIONES.configuraciones).doc('validacionIAHabilitada').get()
      if (snap.exists) {
        const datos = snap.data() as { valor?: string } | undefined
        return datos?.valor !== 'false'
      }
    } catch {
      // Ante un error de lectura se asume habilitada (comportamiento por defecto).
    }
    return true
  }

  /**
   * Override manual del administrador: aprueba o rechaza la cuenta sin pasar
   * por la IA. Queda registrado en `validacionesIA` con tipo 'override'.
   */
  async overrideValidacion(
    usuarioId: string,
    aprobado: boolean,
    adminId: string,
    motivo?: string,
  ): Promise<RegistroValidacionIa> {
    const perfilSnap = await this.db.collection(COLECCIONES.perfiles).doc(usuarioId).get()
    if (!perfilSnap.exists) throw new NotFoundException('Usuario no encontrado')

    const resultado: ResultadoValidacion = {
      usuarioId,
      aprobado,
      requiereRevisionManual: false,
      confianza: 100,
      razonamiento: motivo?.trim()
        || (aprobado ? 'Aprobado manualmente por un administrador' : 'Rechazado manualmente por un administrador'),
      detalles: {
        nombreCoherente: aprobado,
        emailCoherente: aprobado,
        curpCoherente: aprobado,
        rolCoherente: true,
        institucionCoherente: true,
        documentosPresentes: [],
        documentosFaltantes: [],
        observaciones: ['Override manual del administrador'],
      },
      fuente: 'admin',
      fechaValidacion: new Date().toISOString(),
    }
    return this.aplicarResultado(usuarioId, resultado, { tipo: 'override', adminId })
  }

  /** Historial de validaciones del usuario (más recientes primero). */
  async obtenerHistorial(usuarioId: string): Promise<RegistroValidacionIa[]> {
    const perfilSnap = await this.db.collection(COLECCIONES.perfiles).doc(usuarioId).get()
    if (!perfilSnap.exists) throw new NotFoundException('Usuario no encontrado')

    const snap = await this.db.collection(COLECCIONES.validacionesIA)
      .where('usuarioId', '==', usuarioId)
      .limit(50)
      .get()

    // Orden descendente en memoria (evita exigir un índice compuesto en Firestore).
    return snap.docs
      .map(d => d.data() as DocumentData & RegistroValidacionIa)
      .sort((a, b) => (b.fechaValidacion ?? '').localeCompare(a.fechaValidacion ?? ''))
  }
}

/** Decisión de la validación según las reglas del manual. */
interface DecisionValidacion {
  aprobado: boolean
  requiereRevisionManual: boolean
}
