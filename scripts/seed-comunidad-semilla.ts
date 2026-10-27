/**
 * Seed de la colección `publicaciones` con la SEMILLA APROBADA por moderación.
 *
 * Fuentes de datos:
 *   1. `scripts/moderacion_comunidad_reporte.json` → dictamen del moderador
 *      (aprobado / rechazado + categoría + justificación) sobre las 38 publicaciones.
 *   2. `scripts/comunidad_raices_filtrada_*.json` → textos originales.
 *
 * REGLAS DE LIMPIEZA APLICADAS (obligatorias):
 *   1. Solo se procesan las publicaciones APROBADAS (34). Las 4 rechazadas
 *      (política, xenofobia, religión) jamás llegan a Firestore.
 *   2. Se descartan fragmentos truncados ("… Ver más") cuando existe la
 *      versión completa entre las aprobadas, y se deduplican textos repetidos
 *      comparando una forma normalizada (sin acentos, puntuación ni mayúsculas).
 *   3. Los teléfonos se reemplazan por `[Teléfono protegido]` (regex).
 *   4. Nombres de personas concretas → `[Nombre protegido]`; el texto se
 *      reescribe en Lectura Fácil (Accesibilidad Cognitiva) conservando el
 *      tono humano; se asigna título (≤100 caracteres), categoría válida y
 *      etiquetas.
 *
 * ESCRITURA: lote (`WriteBatch`) sobre `publicaciones` con la estructura:
 *   { titulo, contenido, categoria, etiquetas, autorId, cantidadMeGustas: 0,
 *     estado: 'publicado', esSemilla: true, fechaCreacion: ISO actual }
 *   · `autorId`: cuenta demo existente en `perfiles` (reparto round-robin), para
 *     que el feed muestre un nombre real en lugar de "Usuario no disponible".
 *   · `cantidadMeGustas: 0`: evita `undefined` en la respuesta del feed.
 *
 * Ids de documento deterministas (`semilla-<archivo>-<indice>`): re-ejecutar
 * el script es idempotente (sobrescribe, no duplica).
 *
 * Modo de uso:
 *   npx ts-node scripts/seed-comunidad-semilla.ts            # escribe en Firestore
 *   npx ts-node scripts/seed-comunidad-semilla.ts --dry-run  # solo imprime el plan
 *
 * Requisitos: FIREBASE_PROJECT_ID en .env (o ADC configurada).
 */

import * as dotenv from 'dotenv'
import { join } from 'path'
import { readdirSync, readFileSync } from 'fs'

dotenv.config({ path: join(__dirname, '..', '.env') })

import { initializeApp, getApps, cert, ServiceAccount } from 'firebase-admin/app'
import { getFirestore, Firestore } from 'firebase-admin/firestore'

// ── Constantes ──────────────────────────────────────────────────────────────

/** Espejo de `src/database/firestore.constants.ts`. */
const COLECCION_PUBLICACIONES = 'publicaciones'
const COLECCION_PERFILES = 'perfiles'

const CATEGORIAS_VALIDAS: readonly string[] = [
  'testimonio',
  'duda_tramite',
  'empleo',
  'comunidad',
]

const CATEGORIA_POR_DEFECTO = 'comunidad'

/** Marca de contenido cortado por el scraping ("… Ver más"). */
const MARCA_VER_MAS = /(?:\.{3}|…)\s*Ver m[áa]s\s*$/i

/** Teléfonos: formato mexicano con separadores, runs largos de dígitos, +52… */
const REGEX_TELEFONOS: RegExp[] = [
  /\b\d{2}[-.\s]\d{4}[-.\s]\d{4}\b/g, // 98-6110-9997 / 55 1234 5678
  /\b\d{10,}\b/g, // 5512345678 / 5219861109997
  /\+\d{1,3}[\s.-]?\d{2,4}(?:[\s.-]?\d{3,4}){1,2}/g, // +52 986 110 9997
]

/** Nombres propios detectados en la revisión de la semilla. */
const NOMBRES_PROTEGIDOS: readonly string[] = [
  'Rene Ledesma Abdala',
  'Luz S L D Marquez',
]

const MARCA_NOMBRE = '[Nombre protegido]'
const MARCA_TELEFONO = '[Teléfono protegido]'

/** Prefijo de las cuentas creadas por scripts/seed-usuarios-masivo.ts y seed.ts. */
const PREFIJO_AUTOR_DEMO = 'demo-'
/** Respaldo si en `perfiles` no existe ninguna cuenta demo. */
const AUTOR_POR_DEFECTO = 'demo-pcd-001'

// ── Tipos ───────────────────────────────────────────────────────────────────

/** Elemento de `scripts/comunidad_raices_filtrada_*.json`. */
interface ItemFuente {
  contexto: string
  origen: string
}

/** Elemento de `scripts/moderacion_comunidad_reporte.json`. */
interface ItemModerado {
  archivo_origen: string
  contexto_original: string
  aprobado: boolean
  categoria: string
  justificacion: string
}

/** Reescritura en Lectura Fácil, indexada por `<timestamp>-<indice>`. */
interface LimpiezaCurada {
  titulo: string
  contenido: string
  categoria: string
  etiquetas: string[]
}

/** Documento final a insertar en `publicaciones`. */
interface PublicacionSemilla {
  titulo: string
  contenido: string
  categoria: string
  etiquetas: string[]
  /** Autor real: una cuenta demo existente, para que el feed muestre un nombre. */
  autorId: string
  /** Contador inicial de "me gusta" (evita `undefined` en la respuesta del feed). */
  cantidadMeGustas: number
  estado: 'publicado'
  esSemilla: true
  fechaCreacion: string
}

interface Descarte {
  clave: string
  motivo: string
}

// ── 4. Reescrituras curadas en Lectura Fácil ────────────────────────────────
// Clave = `<año-mes-dia-hora del archivo>-<indice del elemento en el array>`.
// Todas ≤100 caracteres de título, sin datos personales y con los acentos
// corregidos; conservan el sentido y el tono empático del texto original.

const CONTENIDO_CURADO: Record<string, LimpiezaCurada> = {
  // ── comunidad_raices_filtrada_1793006664307.json ──
  '1793006664307-1': {
    titulo: 'Vivo sola después de la amputación de la pierna',
    contenido:
      'Nadie me pregunta cómo estoy. Soy persona con discapacidad. Me operaron y me amputaron la pierna por encima de la rodilla. Vivo sola y casi nadie me visita. La soledad me pesa mucho.',
    categoria: 'testimonio',
    etiquetas: ['testimonio', 'discapacidad_fisica', 'soledad'],
  },
  '1793006664307-2': {
    titulo: 'Necesito una silla de ruedas y no sé cómo pedirla',
    contenido:
      'Hola, buenas tardes. Les hago una pregunta sobre la silla de ruedas. Tengo neuropatía diabética desde hace dos años y no puedo caminar sola. Tengo que pedir favores todo el tiempo y eso me resulta muy incómodo. ¿Cómo puedo conseguir una silla de ruedas?',
    categoria: 'duda_tramite',
    etiquetas: ['silla_de_ruedas', 'tramite', 'movilidad'],
  },
  '1793006664307-5': {
    titulo: 'La Tarjeta de Bienestar no es del DIF: qué hacer',
    contenido:
      'La Tarjeta de Bienestar no tiene relación con el DIF. Mañana temprano ve al banco Bienestar y explica lo que pasó. Si todavía tienes el comprobante de la tarjeta, llévalo junto con tu INE y tu CURP.',
    categoria: 'duda_tramite',
    etiquetas: ['bienestar', 'tarjeta', 'tramite'],
  },
  '1793006664307-6': {
    titulo: 'Duda sobre los requisitos de la ayuda por vulnerabilidad',
    contenido:
      'No entiendo por qué dices que eres 100% vulnerable. ¿No puedes moverte un poco? ¿Tu familia te apoya con tu discapacidad? En Querétaro la ayuda por discapacidad solo llega hasta los 29 años. Creo que tu petición no está muy clara.',
    categoria: 'comunidad',
    etiquetas: ['ayudas', 'requisitos', 'duda'],
  },
  '1793006664307-7': {
    titulo: 'Pasos para tramitar el certificado de discapacidad',
    contenido:
      'Estos son los pasos para conseguir el apoyo:\n' +
      '1. Ve a un cibercafé y pide tu certificado de no pertenencia al IMSS o al ISSSTE. Lleva copia de tu credencial de elector.\n' +
      '2. Ve a un centro de salud con tu CURP, tu acta de nacimiento, un comprobante de domicilio, tu credencial de elector y, si la tienes, tu cartilla de salud. Pide el certificado médico de incapacidad permanente.\n' +
      '3. Lleva todo en original y copia a la oficina de Bienestar más cercana. Los documentos deben tener menos de 3 meses de antigüedad.\n' +
      'Consejo: tramita todo en enero. La convocatoria suele salir en febrero o marzo y los documentos pierden vigencia. Mucha fuerza para este trámite.',
    categoria: 'duda_tramite',
    etiquetas: ['bienestar', 'certificado_discapacidad', 'guia_tramite'],
  },
  '1793006664307-8': {
    titulo: 'Me sumo al grupo: tengo discapacidad intelectual y motriz',
    contenido:
      'Hola a todas y a todos. Tengo discapacidad intelectual y motriz. Quiero unirme al grupo. Yo también necesito amigos y amigas.',
    categoria: 'comunidad',
    etiquetas: ['presentacion', 'discapacidad_intelectual', 'comunidad'],
  },
  '1793006664307-10': {
    titulo: '¿La discapacidad congénita sí entra en el apoyo?',
    contenido:
      'Sí, entra. Es una discapacidad congénita: la persona nació con ella. Si la discapacidad se adquirió después del nacimiento, por ejemplo en un accidente, ese caso es distinto.',
    categoria: 'duda_tramite',
    etiquetas: ['discapacidad_congenita', 'elegibilidad', 'tramite'],
  },
  '1793006664307-11': {
    titulo: 'Mi cuenta de la ayuda está bloqueada: así la desbloqueé',
    contenido:
      'El problema no es la tarjeta: lo que está bloqueada es la cuenta. En agosto entregamos los papeles para desbloquearla. Las personas que llevaron la documentación ya la desbloquearon. La mía sigue bloqueada, pero me recomendaron llevar los papeles a la sucursal Aztecas, ahí la resuelven más rápido. Tardan de 15 a 20 días.',
    categoria: 'duda_tramite',
    etiquetas: ['bienestar', 'cuenta_bloqueada', 'tramite'],
  },
  '1793006664307-12': {
    titulo: '¿El síndrome de Lennox-Gastaut recibe apoyo?',
    contenido:
      'Mi hijo tiene síndrome de Lennox-Gastaut. Es una epilepsia avanzada. Él sí recibe apoyo por discapacidad.',
    categoria: 'duda_tramite',
    etiquetas: ['epilepsia', 'discapacidad', 'apoyo'],
  },
  '1793006664307-13': {
    titulo: 'El autismo sí da derecho a certificado de discapacidad',
    contenido:
      'El autismo sí entra. Mi hijo tiene autismo y le dieron su certificado de discapacidad permanente.',
    categoria: 'duda_tramite',
    etiquetas: ['autismo', 'certificado_discapacidad', 'tramite'],
  },
  '1793006664307-14': {
    titulo: 'Diferencia entre discapacidad y enfermedad crónica',
    contenido:
      '[Nombre protegido], no es una confusión. Lo que está en la lista de arriba no es una discapacidad. Una discapacidad limita tus actividades diarias y te mantiene con restricciones. Por eso hay que saber distinguir una discapacidad de una enfermedad crónica degenerativa.',
    categoria: 'duda_tramite',
    etiquetas: ['discapacidad', 'enfermedad_cronica', 'informacion'],
  },
  '1793006664307-15': {
    titulo: '¿Un accidente de bala cuenta como discapacidad?',
    contenido:
      '¿Dónde se entregan esos papeles? Por cierto, ¿saben si un accidente de bala cuenta como discapacidad? No me dan trabajo por esa razón.',
    categoria: 'duda_tramite',
    etiquetas: ['discapacidad', 'empleo', 'tramite'],
  },

  // ── comunidad_raices_filtrada_1793007109307.json ──
  '1793007109307-0': {
    titulo: 'Soy sordo y mi solicitud de discapacidad no avanza',
    contenido:
      'Soy persona sorda y uso lengua de señas. Ya entregué mi solicitud hace tiempo y nadie me contesta. Necesito saber en qué estado está mi trámite de discapacidad.',
    categoria: 'duda_tramite',
    etiquetas: ['discapacidad_auditiva', 'solicitud', 'tramite'],
  },

  // ── comunidad_raices_filtrada_1793007970759.json ──
  '1793007970759-0': {
    titulo: '15 años en silla de ruedas: ya me adapté a mi vida',
    contenido:
      'Tengo 15 años en silla de ruedas y una lesión medular completa. No han sido años fáciles. Gracias a Dios ya me adapté a muchas cosas de mi vida y hoy me resultan más simples que al principio. ¡Ánimo!',
    categoria: 'testimonio',
    etiquetas: ['silla_de_ruedas', 'lesion_medular', 'testimonio', 'animo'],
  },
  '1793007970759-1': {
    titulo: 'El recuerdo de la última vez que llegué a la playa',
    contenido:
      'Elegí esta foto. Es la última vez que acampé en Cala Mondragón para ver las lágrimas de San Lorenzo, como cada verano. Hace 5 años que no puedo volver: la silla de ruedas no me deja bajar la escalinata hacia la playa. Es un recuerdo bonito y a la vez un poco triste. Soy piscis y viviría en el mar.',
    categoria: 'testimonio',
    etiquetas: ['testimonio', 'playa', 'accesibilidad', 'movilidad'],
  },
  '1793007970759-4': {
    titulo: 'Depender de otros cuando tienes condición de movilidad',
    contenido:
      'Estoy de acuerdo. Tengo una condición de movilidad y es horrible depender de otras personas. No somos cargas para nuestras familias, pero ellos se cansan y nosotros sufrimos.',
    categoria: 'testimonio',
    etiquetas: ['movilidad', 'familia', 'testimonio'],
  },
  '1793007970759-5': {
    titulo: 'El dolor crónico se vive en silencio',
    contenido:
      'Estoy de total acuerdo. El dolor es terrible. Tengo varias condiciones y solo yo sé lo que cuesta enfrentarlas. Por eso apoyo totalmente la idea.',
    categoria: 'comunidad',
    etiquetas: ['dolor_cronico', 'condiciones', 'comunidad'],
  },
  '1793007970759-6': {
    titulo: 'Extraño jugar baloncesto desde que uso silla de ruedas',
    contenido:
      'Me encantaría volver a jugar al básquet. Desde que uso silla de ruedas no he vuelto a tocar un balón.',
    categoria: 'testimonio',
    etiquetas: ['deporte', 'silla_de_ruedas', 'testimonio'],
  },
  '1793007970759-7': {
    titulo: 'Pedimos empleos dignos para personas con discapacidad',
    contenido:
      'Buenos días a todos. Pedimos apoyo para que las empresas públicas y privadas ofrezcan empleos dignos, no solo trabajos que piden quinto de secundaria. Muchos somos profesionales. No queremos dinero del Estado: queremos trabajar. Les escribo desde Arequipa.',
    categoria: 'empleo',
    etiquetas: ['empleo', 'inclusion_laboral', 'peticion'],
  },

  // ── comunidad_raices_filtrada_1793008667338.json ──
  '1793008667338-0': {
    titulo: 'No te preocupes: a mí también me borraron una publicación',
    contenido:
      'Amigo, no te preocupes. Yo también publiqué un proyecto muy bonito en un grupo de discapacidad y me lo eliminaron. Así que no te mortifiques.',
    categoria: 'comunidad',
    etiquetas: ['comunidad', 'apoyo', 'moderacion'],
  },

  // ── comunidad_raices_filtrada_1793009582355.json ──
  '1793009582355-1': {
    titulo: 'Denuncia: me rechazaron en el trabajo por mi discapacidad',
    contenido:
      'Es una injusticia. Buscan personas con discapacidad que "se vean bien". Envié mi hoja de vida, vieron mi discapacidad, que no es leve, y nunca más me escribieron. No pierdan el tiempo ahí. Ahora que salió la nueva ley de discapacidad sí buscan, pero piden que el candidato "se vea bien". Es patético.',
    categoria: 'empleo',
    etiquetas: ['empleo', 'discriminacion_laboral', 'denuncia'],
  },
  '1793009582355-2': {
    titulo: 'Tengo discapacidad visual total: ¿puedo optar al trabajo?',
    contenido:
      'Consulta: tengo discapacidad visual del 100%. ¿Puedo optar a este trabajo o a alguno otro?',
    categoria: 'empleo',
    etiquetas: ['empleo', 'discapacidad_visual', 'consulta'],
  },
  '1793009582355-3': {
    titulo: '¿Qué hacen las instituciones por la inclusión real?',
    contenido:
      'Con la Convención y las leyes de discapacidad no deberíamos tener que pedir inclusión. ¿Qué hacen las instituciones por la organización, la atención y la protección de las personas con discapacidad?',
    categoria: 'comunidad',
    etiquetas: ['inclusion', 'convencion_discapacidad', 'instituciones'],
  },
  '1793009582355-4': {
    titulo: 'Casi a los 40 años y sin trabajo formal',
    contenido:
      'Mi discapacidad es física. Nunca he podido conseguir un trabajo formal. Me preocupa: casi cumplo los 40 años y no tengo nada para mi futuro ni para el de mi hijo. Aquí en México las puertas están muy cerradas. Con más estudios tampoco dan la oportunidad.',
    categoria: 'empleo',
    etiquetas: ['empleo', 'discapacidad_fisica', 'futuro'],
  },
  '1793009582355-5': {
    titulo: '¿En qué ciudad apoyan a personas con discapacidad con empleo?',
    contenido: 'Buenos días. ¿En qué ciudad pueden ayudar a personas con discapacidad a conseguir empleo?',
    categoria: 'empleo',
    etiquetas: ['empleo', 'orientacion', 'comunidad'],
  },

  // ── comunidad_raices_filtrada_1793010125669.json ──
  '1793010125669-0': {
    titulo: 'Ayuda: mi hijo de 15 años quedó con paraplejia',
    contenido:
      '¿Cómo inscribo a mi hijo? ¿Alguien puede ayudarnos? Acabamos de salir del hospital. Mi hijo tiene 15 años, una rotura de las vértebras T6, T7 y T8, y una lesión completa con paraplejia. Llevamos meses sin trabajar después de su accidente. Soy de Mérida, Yucatán. Mi teléfono es [Teléfono protegido]. Todo es comprobable. Si alguien puede ayudarme, le mando mis datos.',
    categoria: 'duda_tramite',
    etiquetas: ['paraplejia', 'ayuda', 'tramite', 'merida'],
  },
  '1793010125669-1': {
    titulo: '¿Hacen talleres para personas con discapacidad adquirida?',
    contenido:
      '¿Hacen talleres para personas con discapacidad adquirida? Por ejemplo, para aprender a vivir con dignidad después de la discapacidad.',
    categoria: 'duda_tramite',
    etiquetas: ['talleres', 'discapacidad_adquirida', 'orientacion'],
  },
  '1793010125669-2': {
    titulo: 'Asesoría en técnica de orientación y movilidad',
    contenido:
      'Deberías recibir asesoría en técnica de orientación y movilidad. Para eso están las Asesorías Certificadas y cada quien aporta su experiencia. Desde la Red Incluyente por la Discapacidad (RIDIS Yucatán) estamos para apoyar.',
    categoria: 'duda_tramite',
    etiquetas: ['orientacion_movilidad', 'asesoria', 'yucatan'],
  },
  '1793010125669-3': {
    titulo: 'La inclusión debe ser estructural y con voz propia',
    contenido:
      'Gracias por el espacio y por visibilizar lo que compartí al final de la sesión. La inclusión no puede quedarse en palabras bonitas: necesitamos que sea estructural, cotidiana y con voz propia. Cuenten conmigo para seguir trabajando desde la crítica constructiva, la propuesta y la acción.',
    categoria: 'comunidad',
    etiquetas: ['inclusion', 'comunidad', 'compromiso'],
  },
  '1793010125669-4': {
    titulo: '¿Dan seguimiento las trabajadoras sociales a los apoyos?',
    contenido:
      'Buenas tardes. ¿Las trabajadoras sociales dan seguimiento a los casos que ya recibieron apoyos? Saludos y excelente trabajo.',
    categoria: 'duda_tramite',
    etiquetas: ['seguimiento', 'trabajadora_social', 'apoyos'],
  },
  '1793010125669-5': {
    titulo: 'Felicitaciones por el trabajo conjunto por la inclusión',
    contenido:
      '[Nombre protegido], muchas gracias. Felicidades por su trabajo junto por la inclusión.',
    categoria: 'comunidad',
    etiquetas: ['agradecimiento', 'inclusion', 'comunidad'],
  },
}

// ── Reglas 2 y 3: normalización, truncados y enmascarado ────────────────────

function esTruncado(texto: string): boolean {
  return MARCA_VER_MAS.test(texto)
}

/** Forma canónica para comparar: sin marca "Ver más", acentos, puntuación ni mayúsculas. */
function normalizar(texto: string): string {
  return texto
    .replace(MARCA_VER_MAS, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function enmascararTelefonos(texto: string): string {
  return REGEX_TELEFONOS.reduce((acumulado, regex) => acumulado.replace(regex, MARCA_TELEFONO), texto)
}

function anonimizarNombres(texto: string): string {
  return NOMBRES_PROTEGIDOS.reduce(
    (acumulado, nombre) => acumulado.replace(new RegExp(nombre, 'gi'), MARCA_NOMBRE),
    texto,
  )
}

/** Correcciones ortográficas comunes del corpus original (fallback de la regla 4). */
const CORRECCIONES: ReadonlyArray<[RegExp, string]> = [
  [/\bnadien\b/gi, 'nadie'],
  [/\bdiscapasitad(a|o)s?\b/gi, 'discapacitad$1'],
  [/\bbibo\b/gi, 'vivo'],
  [/\bAh sido\b/g, 'ha sido'],
  [/\bsierto\b/gi, 'cierto'],
  [/\bAnigas\b/gi, 'amigas'],
  [/\btengi\b/gi, 'tengo'],
  [/\bDifícil\b/g, 'difícil'],
]

/** Redacción mínima de respaldo (solo se usa si falta una reescritura curada). */
function aplicarLecturaFacil(texto: string): string {
  const sinMarca = texto.replace(MARCA_VER_MAS, '').trim()
  const corregido = CORRECCIONES.reduce((acumulado, [patron, reemplazo]) => acumulado.replace(patron, reemplazo), sinMarca)
  const limpio = corregido.replace(/\s+/g, ' ').trim()
  return /[.!?…]$/.test(limpio) ? limpio : `${limpio}.`
}

/** Título automático de respaldo: primera idea, máximo 100 caracteres. */
function tituloAutomatico(contenido: string): string {
  const primeraOracion = contenido.split(/(?<=[.!?])\s+/)[0] ?? contenido
  const recortada = primeraOracion.length > 96 ? `${primeraOracion.slice(0, 96).trimEnd()}…` : primeraOracion
  return recortada.charAt(0).toUpperCase() + recortada.slice(1)
}

// ── Carga de datos ──────────────────────────────────────────────────────────

function cargarReporte(): ItemModerado[] {
  const ruta = join(__dirname, 'moderacion_comunidad_reporte.json')
  const crudo = JSON.parse(readFileSync(ruta, 'utf8')) as { resultados?: ItemModerado[] }
  if (!Array.isArray(crudo.resultados)) {
    throw new Error(`El reporte ${ruta} no contiene la clave "resultados"`)
  }
  return crudo.resultados
}

function cargarFuentes(): Map<string, string[]> {
  const mapa = new Map<string, string[]>()
  const archivos = readdirSync(__dirname).filter(
    (nombre) => /^comunidad_raices_filtrada_.*\.json$/.test(nombre),
  )
  if (archivos.length === 0) throw new Error('No se encontraron archivos comunidad_raices_filtrada_*.json en scripts/')
  for (const nombre of archivos) {
    const items = JSON.parse(readFileSync(join(__dirname, nombre), 'utf8')) as ItemFuente[]
    mapa.set(nombre, items.map((i) => i.contexto))
  }
  return mapa
}

/** `comunidad_raices_filtrada_1793006664307.json` → `1793006664307`. */
function idArchivo(nombre: string): string {
  return nombre.replace('comunidad_raices_filtrada_', '').replace('.json', '')
}

// ── Construcción de la semilla ──────────────────────────────────────────────

function construirSemillas(fechaCreacion: string): {
  semillas: PublicacionSemilla[]
  claves: string[]
  descartes: Descarte[]
} {
  const reporte = cargarReporte()
  const fuentes = cargarFuentes()
  const aprobadas = reporte.filter((r) => r.aprobado)

  const semillas: PublicacionSemilla[] = []
  const claves: string[] = []
  const descartes: Descarte[] = []
  const vistas = new Map<string, string>() // texto normalizado → clave que lo originó

  for (const item of aprobadas) {
    const lineas = fuentes.get(item.archivo_origen)
    if (!lineas) throw new Error(`No existe el archivo fuente ${item.archivo_origen}`)

    let indice = lineas.indexOf(item.contexto_original)
    if (indice < 0) {
      // Resiliencia ante pequeñas divergencias de transcripción en el reporte.
      const normBuscada = normalizar(item.contexto_original)
      indice = lineas.findIndex((linea) => normalizar(linea) === normBuscada)
    }
    if (indice < 0) throw new Error(`El texto aprobado no se encontró dentro de ${item.archivo_origen}`)

    const clave = `${idArchivo(item.archivo_origen)}-${indice}`
    const original = item.contexto_original
    const normalizado = normalizar(original)

    // Regla 2a: descartar truncado si la versión completa está entre las aprobadas.
    if (esTruncado(original)) {
      const completoExiste = aprobadas.some((otro) => {
        if (otro.contexto_original === original) return false
        const normOtro = normalizar(otro.contexto_original)
        return normOtro.length > normalizado.length && normOtro.startsWith(normalizado)
      })
      if (completoExiste) {
        descartes.push({ clave, motivo: 'truncado: existe versión completa aprobada' })
        continue
      }
    }

    // Regla 2b: deduplicar textos repetidos (comparación normalizada).
    const previa = vistas.get(normalizado)
    if (previa !== undefined) {
      descartes.push({ clave, motivo: `duplicado de ${previa}` })
      continue
    }
    vistas.set(normalizado, clave)

    // Regla 4: título, texto en Lectura Fácil, categoría y etiquetas.
    const curada = CONTENIDO_CURADO[clave]
    let titulo: string
    let contenido: string
    let categoria: string
    let etiquetas: string[]

    if (curada) {
      titulo = curada.titulo
      contenido = curada.contenido
      categoria = curada.categoria
      etiquetas = [...curada.etiquetas]
    } else {
      contenido = aplicarLecturaFacil(original)
      titulo = tituloAutomatico(contenido)
      categoria = CATEGORIAS_VALIDAS.includes(item.categoria) ? item.categoria : CATEGORIA_POR_DEFECTO
      etiquetas = [categoria, ...normalizar(contenido).split(' ').filter((p) => p.length > 7).slice(0, 3)]
      console.warn(`⚠️  Sin reescritura curada para ${clave}; se aplicó la limpieza automática.`)
    }

    // Reglas 3 y 4 (aplicadas al texto final, por si la curaduría dejó algo).
    contenido = anonimizarNombres(enmascararTelefonos(contenido))
    titulo = anonimizarNombres(enmascararTelefonos(titulo))

    // Validaciones de formato.
    if (titulo.length > 100) titulo = `${titulo.slice(0, 96).trimEnd()}…`
    if (!CATEGORIAS_VALIDAS.includes(categoria)) {
      throw new Error(`Categoría inválida "${categoria}" en ${clave}`)
    }

    semillas.push({
      titulo,
      contenido,
      categoria,
      etiquetas,
      autorId: AUTOR_POR_DEFECTO,
      cantidadMeGustas: 0,
      estado: 'publicado',
      esSemilla: true,
      fechaCreacion,
    })
    claves.push(clave)
  }

  return { semillas, claves, descartes }
}

// ── Firebase ────────────────────────────────────────────────────────────────

function inicializarFirebase(): Firestore {
  const projectId = process.env.FIREBASE_PROJECT_ID
  if (!projectId) {
    console.error('❌ FIREBASE_PROJECT_ID no está definido en .env')
    process.exit(1)
  }

  if (getApps().length === 0) {
    const serviceAccountJson = process.env.FIREBASE_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT
    if (serviceAccountJson) {
      try {
        const parsed = JSON.parse(serviceAccountJson) as ServiceAccount & { project_id?: string }
        initializeApp({ credential: cert(parsed), projectId: parsed.project_id || projectId })
      } catch {
        console.warn('⚠️  FIREBASE_CREDENTIALS no parseable. Usando Application Default Credentials.')
        initializeApp({ projectId })
      }
    } else {
      initializeApp({ projectId })
    }
  }
  return getFirestore()
}

/** Inserta en lotes de 400 (límite seguro de escrituras por batch de Firestore). */
async function escribirEnLotes(db: Firestore, semillas: PublicacionSemilla[], claves: string[]): Promise<number> {
  const TAM_LOTE = 400
  let escritos = 0
  for (let i = 0; i < semillas.length; i += TAM_LOTE) {
    const lote = db.batch()
    for (let j = i; j < Math.min(i + TAM_LOTE, semillas.length); j++) {
      const ref = db.collection(COLECCION_PUBLICACIONES).doc(`semilla-${claves[j]}`)
      lote.set(ref, semillas[j])
    }
    await lote.commit()
    escritos += Math.min(TAM_LOTE, semillas.length - i)
  }
  return escritos
}

// ── Asignación de autores (cuentas demo existentes) ────────────────────────

/**
 * IDs de perfiles existentes con prefijo `demo-` (creados por los seeds del
 * proyecto). Solo se leen los ids (`select()` sin campos) para no traer payloads.
 */
async function resolverAutoresDemo(db: Firestore): Promise<string[]> {
  const snap = await db.collection(COLECCION_PERFILES).select().limit(2000).get()
  const autores = snap.docs.map((d) => d.id).filter((id) => id.startsWith(PREFIJO_AUTOR_DEMO)).sort()
  if (autores.length === 0 && (await db.collection(COLECCION_PERFILES).doc(AUTOR_POR_DEFECTO).get()).exists) {
    return [AUTOR_POR_DEFECTO]
  }
  return autores
}

/** Reparte las semillas entre los autores en round-robin (determinista e idempotente). */
function asignarAutores(semillas: PublicacionSemilla[], autores: string[]): void {
  semillas.forEach((semilla, i) => {
    semilla.autorId = autores[i % autores.length]
  })
}

// ── CLI / main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dryRun = process.argv.slice(2).includes('--dry-run')
  const fechaCreacion = new Date().toISOString()

  const { semillas, claves, descartes } = construirSemillas(fechaCreacion)

  console.log('── Resumen de la semilla de comunidad ──')
  console.log(`Publicaciones aprobadas por moderación: ${cargarReporte().filter((r) => r.aprobado).length}`)
  console.log(`Descartadas (truncados/duplicados):      ${descartes.length}`)
  for (const d of descartes) console.log(`   · ${d.clave}: ${d.motivo}`)
  console.log(`A insertar en "${COLECCION_PUBLICACIONES}": ${semillas.length}`)

  const porCategoria = new Map<string, number>()
  for (const s of semillas) porCategoria.set(s.categoria, (porCategoria.get(s.categoria) ?? 0) + 1)
  console.log('Por categoría:', Object.fromEntries(porCategoria))

  const largos = semillas.filter((s) => s.titulo.length > 100)
  if (largos.length > 0) throw new Error(`${largos.length} títulos superan los 100 caracteres`)

  if (dryRun) {
    console.log('\n🔎 --dry-run: no se escribió nada. Vista previa:\n')
    for (const s of semillas) {
      console.log(`• [${s.categoria}] ${s.titulo}\n  ${s.contenido.slice(0, 140)}${s.contenido.length > 140 ? '…' : ''}\n  #${s.etiquetas.join(' #')}\n`)
    }
    console.log('(autorId se resuelve con las cuentas demo existentes al momento de escribir)')
    return
  }

  if (claves.length !== semillas.length) {
    throw new Error(`Inconsistencia: ${claves.length} claves vs ${semillas.length} semillas`)
  }

  const db = inicializarFirebase()

  // Autor real: reparto entre las cuentas demo existentes (feed con nombre visible).
  const autores = await resolverAutoresDemo(db)
  if (autores.length === 0) {
    throw new Error('No se encontraron perfiles con prefijo "demo-" en Firestore y el respaldo tampoco existe')
  }
  asignarAutores(semillas, autores)
  const porAutor = new Map<string, number>()
  for (const s of semillas) porAutor.set(s.autorId, (porAutor.get(s.autorId) ?? 0) + 1)
  console.log(`Autores demo disponibles: ${autores.length} → reparto de ${semillas.length} semillas:`)
  for (const [autor, n] of porAutor) console.log(`   · ${autor}: ${n}`)

  const escritos = await escribirEnLotes(db, semillas, claves)
  console.log(`\n✅ ${escritos} publicaciones escritas en "${COLECCION_PUBLICACIONES}" (fechaCreacion=${fechaCreacion})`)
}

main().catch((error: unknown) => {
  console.error('❌ Error en el seed de comunidad:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
