import { Injectable, Logger } from '@nestjs/common'
import diccionarioJson from './diccionario/diccionario-colloquial-tecnico-discapacidad.json'

/**
 * Una entrada del diccionario coloquial → técnico (clínico / legal / trámite).
 * Debe coincidir con `src/modules/ai/diccionario/diccionario-colloquial-tecnico-discapacidad.json`.
 */
export interface EntradaDiccionario {
  expresion_coloquial: string
  variantes: string[]
  termino_tecnico_clinico: string
  termino_legal_educativo: string
  norma_referencia: string
  palabras_clave_rag: string[]
  tramite_o_institucion_asociada: string
  ejemplo_en_corpus: string
  observaciones: string
}

/** Entrada del diccionario que coincidió con la consulta del usuario. */
export interface ExpansionTermino {
  expresion_coloquial: string
  termino_tecnico_clinico: string
  termino_legal_educativo: string
  tramite_o_institucion_asociada: string
  /** Términos del diccionario que dispararon la coincidencia (para trazabilidad). */
  coincidencias: string[]
}

/** Resultado del preprocesamiento de la consulta del usuario. */
export interface ConsultaEnriquecida {
  /** Texto tal como lo escribió el usuario. */
  consultaOriginal: string
  /** Forma normalizada (minúsculas, sin acentos ni puntuación). */
  consultaNormalizada: string
  /** Entradas del diccionario que aplican (máx. {@link MAX_EXPANSIONES}, mejor puntaje primero). */
  expansiones: ExpansionTermino[]
  /**
   * Bloque de texto listo para inyectar en el prompt de búsqueda vectorial y/o
   * en el prompt de Gemini. Vacío (`''`) cuando no hubo coincidencias.
   */
  textoExpansion: string
}

const DICCIONARIO: EntradaDiccionario[] = diccionarioJson as EntradaDiccionario[]

/** Tope de entradas inyectadas por consulta: evita ruido en el embedding. */
const MAX_EXPANSIONES = 5

/** Mínimo de caracteres para considerar una frase del diccionario. */
const MIN_FRASE = 3

/** Mínimo de caracteres de una palabra clave individual. */
const MIN_PALABRA = 5

/**
 * Palabras vacías y palabras genéricas del dominio que NO ayudan a decidir
 * qué entrada del diccionario aplica (evitan que cualquier consulta con
 * "discapacidad" o "certificado" active entradas ajenas al tema real).
 */
const PALABRAS_GENERICAS = new Set([
  // Funcionales
  'puedo', 'puede', 'quiero', 'necesito', 'tengo', 'tiene', 'tener', 'ser',
  'para', 'como', 'cuando', 'donde', 'desde', 'estoy', 'esta', 'este', 'esto',
  'todo', 'todos', 'mas', 'muy', 'hay', 'son', 'unos', 'unas', 'por', 'sobre',
  // Genéricas del dominio (por sí solas no identifican una entrada)
  'discapacidad', 'persona', 'personas', 'ayuda', 'ayudas', 'apoyo', 'apoyos',
  'tramite', 'inclusion', 'atencion', 'social', 'general', 'grado', 'requisito',
  'requisitos', 'certificado', 'certificados', 'constancia', 'documento',
  'documentos', 'solicitud', 'solicitudes', 'institucion', 'instituciones',
  'centro', 'centros', 'secretaria', 'registro', 'rehabilitacion', 'beneficiario',
  'beneficiarios', 'medico', 'medica', 'trabajo', 'empleo',
])

/** Minúsculas, sin acentos, sin puntuación, espacios colapsados. */
export function normalizarConsulta(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Raíz tosca para empatar singular/plural ("apoyos" → "apoyo", "certificados"
 * → "certificado"). Solo se aplica a palabras sueltas, nunca a frases.
 */
function raiz(palabra: string): string {
  return palabra.length > 5 && palabra.endsWith('s') ? palabra.slice(0, -1) : palabra
}

function tokenize(normalizado: string): string[] {
  return normalizado.split(' ').filter(p => p.length >= MIN_PALABRA && !PALABRAS_GENERICAS.has(p))
}

/** ¿Es esta palabra clave del diccionario demasiado genérica para decidir por sí sola? */
function esGenerico(clave: string): boolean {
  return !clave.includes(' ') && PALABRAS_GENERICAS.has(clave)
}

/**
 * Preprocesa la consulta del usuario para el pipeline RAG.
 *
 * Detecta lenguaje coloquial (expresiones, variantes y palabras clave del
 * diccionario `coloquial → técnico`) y devuelve la equivalencia en términos
 * **clínicos, legales/educativos y de trámite** (CENETEC / SEP / LGIPD) para
 * enriquecer el texto que se vectoriza con Vertex AI (`text-embedding-004`)
 * y el prompt de Gemini.
 *
 * Uso típico:
 * ```ts
 * const enriquecida = this.diccionario.preprocesarConsulta(consultaUsuario)
 * const textoBusqueda = [textoBase, enriquecida.textoExpansion].filter(Boolean).join('\n')
 * ```
 */
@Injectable()
export class DiccionarioConsultasService {
  private readonly logger = new Logger(DiccionarioConsultasService.name)

  /** Índice in-memory construido una sola vez al arrancar (42 entradas). */
  private readonly indice: Array<{
    entrada: EntradaDiccionario
    frases: string[]
    claves: string[]
    raices: Set<string>
  }>

  constructor() {
    this.indice = DICCIONARIO.map(entrada => {
      const frases = [entrada.expresion_coloquial, ...entrada.variantes]
        .map(normalizarConsulta)
        .filter(f => f.length >= MIN_FRASE)
      const claves = entrada.palabras_clave_rag
        .map(normalizarConsulta)
        .filter(c => c.length >= MIN_FRASE)
      const raices = new Set([...tokenize([...frases, ...claves].join(' '))].map(raiz))
      return { entrada, frases, claves, raices }
    })
    this.logger.log(`Diccionario coloquial→técnico cargado: ${this.indice.length} entradas`)
  }

  /**
   * Punto de entrada: devuelve la consulta enriquecida con los términos
   * oficiales. Si no hay coincidencias, `textoExpansion` queda vacío y el
   * comportamiento del pipeline no cambia (best-effort, cero riesgo).
   */
  preprocesarConsulta(consulta: string): ConsultaEnriquecida {
    const consultaOriginal = typeof consulta === 'string' ? consulta : ''
    const consultaNormalizada = normalizarConsulta(consultaOriginal)
    if (!consultaNormalizada) {
      return { consultaOriginal, consultaNormalizada, expansiones: [], textoExpansion: '' }
    }

    const raicesConsulta = new Set(tokenize(consultaNormalizada).map(raiz))

    const candidatos: Array<{ entrada: EntradaDiccionario; score: number; coincidencias: string[] }> = []

    for (const item of this.indice) {
      let score = 0
      const coincidencias: string[] = []

      // Frases coloquiales (expresión del corpus y variantes): evidencia fuerte.
      for (const frase of item.frases) {
        if (this.contieneFrase(consultaNormalizada, frase)) {
          score += 3
          coincidencias.push(frase)
        }
      }
      // Palabras clave RAG: evidencia media (p. ej. "CEDis", "paraplejia").
      // Las claves genéricas por sí solas ("discapacidad", "certificado") no
      // cuentan: solo aportan las frases específicas o las palabras sueltas.
      for (const clave of item.claves) {
        if (esGenerico(clave)) continue
        if (this.contieneFrase(consultaNormalizada, clave)) {
          score += 2
          coincidencias.push(clave)
        }
      }
      // Palabras sueltas por raíz: cubre singular/plural y acentos.
      for (const raizItem of item.raices) {
        if (raicesConsulta.has(raizItem) && !coincidencias.includes(raizItem)) {
          score += raizItem.length >= 7 ? 2 : 1
          coincidencias.push(raizItem)
        }
      }

      if (score >= 2) candidatos.push({ entrada: item.entrada, score, coincidencias })
    }

    const top = candidatos.sort((a, b) => b.score - a.score).slice(0, MAX_EXPANSIONES)

    const expansiones: ExpansionTermino[] = top.map(({ entrada, coincidencias }) => ({
      expresion_coloquial: entrada.expresion_coloquial,
      termino_tecnico_clinico: entrada.termino_tecnico_clinico,
      termino_legal_educativo: entrada.termino_legal_educativo,
      tramite_o_institucion_asociada: entrada.tramite_o_institucion_asociada,
      coincidencias: coincidencias.slice(0, 6),
    }))

    if (expansiones.length > 0) {
      this.logger.debug(
        `Consulta enriquecida con ${expansiones.length} entrada(s) del diccionario: ` +
        expansiones.map(e => e.expresion_coloquial).join(' | '),
      )
    }

    return {
      consultaOriginal,
      consultaNormalizada,
      expansiones,
      textoExpansion: this.construirTextoExpansion(expansiones),
    }
  }

  /** Bloque de texto para inyectar en el prompt de búsqueda / de Gemini. */
  private construirTextoExpansion(expansiones: ExpansionTermino[]): string {
    if (expansiones.length === 0) return ''
    return [
      'TÉRMINOS OFICIALES DEL DICCIONARIO CLÍNICO/LEGAL (traducción del lenguaje cotidiano del usuario):',
      ...expansiones.map(e =>
        `- "${e.expresion_coloquial}" → CLÍNICO: ${e.termino_tecnico_clinico} | LEGAL/EDUCATIVO: ${e.termino_legal_educativo} | TRÁMITE/INSTITUCIÓN: ${e.tramite_o_institucion_asociada}`,
      ),
      'Usa estos términos oficiales (CENETEC, SEP, LGIPD) al buscar evidencia y al responder.',
    ].join('\n')
  }

  /** ¿Aparece `frase` completa en `texto`, separada por espacios o en los extremos? */
  private contieneFrase(texto: string, frase: string): boolean {
    let i = texto.indexOf(frase)
    while (i !== -1) {
      const inicioOk = i === 0 || texto[i - 1] === ' '
      const fin = i + frase.length
      const finOk = fin === texto.length || texto[fin] === ' '
      if (inicioOk && finOk) return true
      i = texto.indexOf(frase, i + 1)
    }
    return false
  }
}
