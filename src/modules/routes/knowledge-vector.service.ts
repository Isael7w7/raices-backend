import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GoogleGenAI } from '@google/genai'
import { Firestore, FieldValue } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { DiccionarioConsultasService } from '../ai/diccionario-consultas.service'

// ─── Tipos ──────────────────────────────────────────────────────────────

/**
 * Documento crudo del dataset de conocimiento oficial (CENETEC / SEP / OMS).
 * Los campos `practical_guidance` y `limitations_and_warnings` pueden venir
 * como string o como array de strings según el origen del documento.
 */
export interface DocumentoConocimiento {
  knowledge_id?: string
  title?: string
  content?: string
  practical_guidance?: string | string[]
  limitations_and_warnings?: string | string[]
  [clave: string]: unknown
}

/** Contexto recuperado, listo para inyectar en el prompt de Gemini. */
export interface ContextoRelevante {
  id: string
  title: string
  content: string
  practical_guidance: string
  limitations_and_warnings: string
}

/** Perfil de usuario usado para armar el texto de búsqueda vectorial. */
export interface PerfilBusquedaVectorial {
  discapacidad?: string
  etapaVida?: string
  metas?: string
  /**
   * Texto libre escrito por el usuario (metas, consulta del chat...). Se pasa
   * por el diccionario coloquial→técnico para expandir la consulta de búsqueda
   * con los términos oficiales (CENETEC / SEP / LGIPD) antes de vectorizarla.
   */
  consulta?: string
}

/** Resultado de la ingesta del dataset. */
export interface ResultadoIngesta {
  procesados: number
  ingestados: number
  fallidos: number
  errores: string[]
}

// ─── Servicio ───────────────────────────────────────────────────────────

/**
 * Pipeline RAG (Retrieval-Augmented Generation) del módulo de rutas:
 * 1. `ingestarDataset` convierte el dataset JSON oficial en embeddings
 *    (`text-embedding-004`) y los guarda en la colección `conocimientoClinico`.
 * 2. `buscarContextoRelevante` recupera los 3 documentos más afines al perfil
 *    del usuario (similitud de coseno en memoria; Firestore Vector Search
 *    nativo no está habilitado en el proyecto).
 * 3. Antes de vectorizar, la consulta se pasa por `DiccionarioConsultasService`
 *    para expandir lenguaje coloquial ("me cortaron el pie") a términos
 *    oficiales (amputación de miembro inferior / CEDis / CENETEC).
 */
@Injectable()
export class KnowledgeVectorService {
  private readonly logger = new Logger('KnowledgeVectorService')
  private ai: GoogleGenAI | null = null
  private embeddingModel = 'text-embedding-004'

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly config: ConfigService,
    private readonly diccionario: DiccionarioConsultasService,
  ) {
    this.initializeAi()
  }

  private initializeAi(): void {
    // Mismas variables que RoutesService (GEMINI_* con fallback legacy VERTEX_AI_*).
    const project = this.config.get<string>('GEMINI_PROJECT_ID')
      ?? this.config.get<string>('VERTEX_AI_PROJECT_ID')
      ?? this.config.get<string>('FIREBASE_PROJECT_ID')
    const location = this.config.get<string>('GEMINI_LOCATION')
      ?? this.config.get<string>('VERTEX_AI_LOCATION')
      ?? 'global'
    this.embeddingModel = this.config.get<string>('EMBEDDING_MODEL') ?? 'text-embedding-004'

    if (!project) {
      this.logger.warn('KnowledgeVectorService: embeddings no configurados (sin GEMINI_PROJECT_ID) — ingestación y grounding deshabilitados')
      return
    }

    try {
      this.ai = new GoogleGenAI({ vertexai: true, project, location })
      this.logger.log(`KnowledgeVectorService: embeddings disponibles (${this.embeddingModel})`)
    } catch (e: unknown) {
      this.logger.warn(`KnowledgeVectorService: embeddings no disponibles (${e instanceof Error ? e.message : String(e)})`)
      this.ai = null
    }
  }

  private col(nombre: string) { return this.db.collection(nombre) }

  /** Normaliza campos que pueden venir como string o array de strings. */
  private normalizarTexto(valor: string | string[] | undefined | null): string {
    if (Array.isArray(valor)) return valor.filter(v => typeof v === 'string' && v.trim() !== '').join('\n')
    return typeof valor === 'string' ? valor.trim() : ''
  }

  /**
   * Texto base para el embedding: `content` + `practical_guidance`
   * (unido por saltos de línea) + `limitations_and_warnings`.
   */
  construirTextoBase(doc: DocumentoConocimiento): string {
    return [
      this.normalizarTexto(typeof doc.content === 'string' ? doc.content : undefined),
      this.normalizarTexto(doc.practical_guidance),
      this.normalizarTexto(doc.limitations_and_warnings),
    ].filter(parte => parte !== '').join('\n')
  }

  /** Genera el vector de un texto con el modelo de embeddings de Vertex AI. */
  private async generarEmbedding(texto: string): Promise<number[]> {
    if (!this.ai) throw new Error('Modelos de embeddings no configurados (falta GEMINI_PROJECT_ID)')

    const result = await this.ai.models.embedContent({
      model: this.embeddingModel,
      contents: texto,
    })

    const vector = result?.embeddings?.[0]?.values
    if (!Array.isArray(vector) || vector.length === 0) {
      throw new Error('El modelo de embeddings no devolvió vector')
    }
    return vector
  }

  /**
   * Ingesta del dataset de conocimiento oficial:
   * genera el embedding de cada documento y lo guarda (idempotente por
   * `knowledge_id`) en la colección `conocimientoClinico`.
   */
  async ingestarDataset(data: DocumentoConocimiento[]): Promise<ResultadoIngesta> {
    if (!Array.isArray(data) || data.length === 0) {
      throw new BadRequestException('El body debe ser un array de documentos de conocimiento')
    }
    if (!this.ai) {
      throw new BadRequestException('Embeddings no configurados: define GEMINI_PROJECT_ID para habilitar la ingestación')
    }

    const coleccion = this.col(COLECCIONES.conocimientoClinico)
    const errores: string[] = []
    let ingestados = 0

    for (let i = 0; i < data.length; i++) {
      const doc = data[i]
      if (typeof doc !== 'object' || doc === null) {
        errores.push(`Documento #${i + 1}: no es un objeto válido`)
        continue
      }

      try {
        const textoBase = this.construirTextoBase(doc)
        if (textoBase === '') throw new Error('documento sin contenido (content/practical_guidance)')

        const embedding = await this.generarEmbedding(textoBase)
        const knowledgeId = typeof doc.knowledge_id === 'string' && doc.knowledge_id.trim() !== ''
          ? doc.knowledge_id.trim()
          : coleccion.doc().id // id estable ⇒ re-ingestar actualiza en vez de duplicar

        await coleccion.doc(knowledgeId).set({
          ...doc,
          textoBase,
          embedding,
          fechaIngesta: FieldValue.serverTimestamp(),
        })
        ingestados++
        this.logger.log(`Ingestado ${i + 1}/${data.length}: ${knowledgeId}`)
      } catch (e: unknown) {
        const detalle = e instanceof Error ? e.message : String(e)
        errores.push(`Documento #${i + 1} (${typeof doc.knowledge_id === 'string' ? doc.knowledge_id : 'sin id'}): ${detalle}`)
        this.logger.warn(`Fallo al ingestar documento #${i + 1}: ${detalle}`)
      }
    }

    if (ingestados === 0 && errores.length > 0) {
      throw new BadRequestException(`Ningún documento fue ingestado. Primer error: ${errores[0]}`)
    }

    return { procesados: data.length, ingestados, fallidos: errores.length, errores }
  }

  /** Similitud de coseno entre dos vectores (misma dimensión o truncada a la menor). */
  private similitudCoseno(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0) return 0
    const n = Math.min(a.length, b.length)
    let dot = 0
    let normaA = 0
    let normaB = 0
    for (let i = 0; i < n; i++) {
      dot += a[i] * b[i]
      normaA += a[i] * a[i]
      normaB += b[i] * b[i]
    }
    if (normaA === 0 || normaB === 0) return 0
    return dot / (Math.sqrt(normaA) * Math.sqrt(normaB))
  }

  /**
   * Recupera los 3 documentos de `conocimientoClinico` más relevantes para el
   * perfil del usuario. Best-effort: si la búsqueda falla devuelve `[]` para
   * no bloquear la generación de rutas.
   */
  async buscarContextoRelevante(perfil: PerfilBusquedaVectorial): Promise<ContextoRelevante[]> {
    try {
      if (!this.ai) return []

      const textoBase = `Ruta para discapacidad ${perfil.discapacidad ?? 'no especificada'} en ${perfil.etapaVida ?? 'no especificada'} con meta:${perfil.metas ?? 'no especificada'}`

      // ── Enriquecimiento RAG con el diccionario coloquial→técnico ──
      // Si el lenguaje del usuario coincide con una expresión/variante/palabra
      // clave del diccionario, se agregan al texto de búsqueda los términos
      // oficiales (clínico, legal/educativo y trámite) para que el embedding
      // recupere evidencia de CENETEC/SEP/LGIPD precisa y no solo literal.
      const textoLibre = [perfil.consulta, perfil.metas, perfil.discapacidad]
        .filter((parte): parte is string => typeof parte === 'string' && parte.trim() !== '')
        .join(' ')
      const enriquecida = this.diccionario.preprocesarConsulta(textoLibre)

      const textoBusqueda = enriquecida.textoExpansion
        ? `${textoBase}\n${enriquecida.textoExpansion}`
        : textoBase

      const embeddingConsulta = await this.generarEmbedding(textoBusqueda)

      const snap = await this.col(COLECCIONES.conocimientoClinico).limit(200).get()

      const documentos = snap.docs
        .map(d => ({ id: d.id, datos: d.data() as Record<string, unknown> }))
        .filter(({ datos }) => Array.isArray(datos.embedding))
        .map(({ id, datos }) => ({ id, datos, score: this.similitudCoseno(embeddingConsulta, datos.embedding as number[]) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)

      return documentos.map(({ id, datos }) => ({
        id,
        title: typeof datos.title === 'string' ? datos.title : 'Fuente oficial sin título',
        content: typeof datos.content === 'string' ? datos.content : '',
        practical_guidance: this.normalizarTexto(datos.practical_guidance as string | string[] | undefined),
        limitations_and_warnings: this.normalizarTexto(datos.limitations_and_warnings as string | string[] | undefined),
      }))
    } catch (e: unknown) {
      this.logger.warn(`buscarContextoRelevante falló: ${e instanceof Error ? e.message : String(e)}`)
      return []
    }
  }
}
