/**
 * Seed masivo de usuarios de prueba (PRUEBAS DE CARGA / SIMULACIÓN).
 *
 * Crea tutores (rol `padre_tutor`) y personas con discapacidad (rol `pcd`)
 * vinculadas entre sí, replicando EXACTAMENTE el esquema que genera
 * `AuthService.register`:
 *
 *   1. Cuenta real en Firebase Auth (login funciona con la contraseña común).
 *   2. `perfiles/{uid}`            → perfil con features por defecto.
 *   3. `dependientes/{pcdUid}`     → relación canónica tutor ↔ PCD
 *      (id = pcdUid, esCuentaVinculada: true, igual que registrarDependienteVinculado).
 *   4. `perfilesExtendidos/{auto}` → perfil de necesidades de la PCD
 *      (campos con arrays serializados como JSON string, como hace
 *      UsersService.saveProfilingData).
 *
 * NO toca ninguna otra colección (instituciones, vacantes, comunidad...).
 * NO envía correos ni dispara validaciones IA (se escribe directo con
 * firebase-admin, no vía la API HTTP).
 *
 * UIDs determinísticos (`demo-tutor-001`, `demo-pcd-001`...): re-ejecutar el
 * script es idempotente (los usuarios que ya existen se omiten), y el modo
 * `--clean` puede borrar exactamente lo que este script creó.
 *
 * Modo de uso:
 *   npx ts-node scripts/seed-usuarios-masivo.ts                  # crea 300 + 700
 *   npx ts-node scripts/seed-usuarios-masivo.ts --dry-run        # solo imprime el plan
 *   npx ts-node scripts/seed-usuarios-masivo.ts --tutores=50 --pcds=100 --yes
 *   npx ts-node scripts/seed-usuarios-masivo.ts --clean          # elimina SOLO lo creado aquí
 *
 * Requisitos:
 *   - FIREBASE_PROJECT_ID en .env (o ADC configurada).
 *   - pnpm install
 *
 * ⚠️ Crea cuentas REALES de Firebase Auth en el proyecto configurado en .env.
 *    Las contraseñas son públicas (son datos de prueba): NO usar en prod real.
 */

import * as dotenv from 'dotenv'
import { join } from 'path'
import { createInterface } from 'readline'

dotenv.config({ path: join(__dirname, '..', '.env') })

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Firestore } from 'firebase-admin/firestore'

// ── Constantes del dominio (espejo de src/database/firestore.constants.ts) ──
const COLECCIONES = {
  perfiles: 'perfiles',
  perfilesExtendidos: 'perfilesExtendidos',
  dependientes: 'dependientes',
} as const

// Espejo de src/common/interfaces/feature-flags.interface.ts
const FEATURES_POR_DEFECTO = {
  chat: true,
  postulaciones: true,
  comunidad: true,
  resenas: true,
  descubrimiento: true,
  favoritos: true,
  multimedia: true,
} as const

const PREFIX_EMAIL = 'demo.'
const DOMINIO_EMAIL = 'raices.test' // TLD .test: nunca entregable, seguro para pruebas
const UID_TUTOR = (n: number) => `demo-tutor-${String(n).padStart(3, '0')}`
const UID_PCD = (n: number) => `demo-pcd-${String(n).padStart(3, '0')}`
const EMAIL_TUTOR = (n: number) => `${PREFIX_EMAIL}tutor${String(n).padStart(3, '0')}@${DOMINIO_EMAIL}`
const EMAIL_PCD = (n: number) => `${PREFIX_EMAIL}pcd${String(n).padStart(3, '0')}@${DOMINIO_EMAIL}`

// ── Catálogos de datos realistas ────────────────────────────────────────────
const NOMBRES = [
  'María', 'Juan', 'Ana', 'Pedro', 'Sofía', 'Carlos', 'Lucía', 'Miguel',
  'Valentina', 'Diego', 'Camila', 'Alejandro', 'Ximena', 'Ricardo', 'Renata',
  'Fernando', 'Isabella', 'Adrián', 'Daniela', 'Jorge', 'Paola', 'Luis',
  'Gabriela', 'Raúl', 'Mariana', 'Eduardo', 'Andrea', 'Héctor', 'Fernanda', 'Óscar',
]
const APELLIDOS = [
  'García', 'Hernández', 'López', 'Martínez', 'González', 'Rodríguez', 'Pérez',
  'Sánchez', 'Ramírez', 'Cruz', 'Flores', 'Gómez', 'Díaz', 'Reyes', 'Ortiz',
  'Torres', 'Vázquez', 'Mendoza', 'Jiménez', 'Ruiz', 'Álvarez', 'Castillo',
]
const CIUDADES: Array<{ ciudad: string; estado: string }> = [
  { ciudad: 'Mérida', estado: 'Yucatán' },
  { ciudad: 'Cancún', estado: 'Quintana Roo' },
  { ciudad: 'Valladolid', estado: 'Yucatán' },
  { ciudad: 'Tizimín', estado: 'Yucatán' },
  { ciudad: 'Progreso', estado: 'Yucatán' },
  { ciudad: 'Motul', estado: 'Yucatán' },
  { ciudad: 'México', estado: 'CDMX' },
  { ciudad: 'Guadalajara', estado: 'Jalisco' },
  { ciudad: 'Monterrey', estado: 'Nuevo León' },
  { ciudad: 'Puebla', estado: 'Puebla' },
]
const TIPOS_DISCAPACIDAD = ['tea', 'motriz', 'visual', 'auditiva', 'intelectual', 'multiple']
const SEVERIDADES = ['leve', 'moderada', 'severa']
const ETAPAS_VIDA = ['infancia', 'adolescencia', 'joven_adulto', 'adulto', 'adulto_mayor']
const MODOS_COMUNICACION = ['verbal', 'no_verbal', 'lenguaje_señas', 'comunicacion_aumentativa', 'escrita']
const NECESIDADES_MOVILIDAD = ['sin_apoyo', 'baston', 'silla_ruedas', 'rampas', 'acompanante']
const ACCESO_TECNOLOGIA = ['smartphone', 'computadora', 'internet_casa', 'lector_pantalla', 'sin_acceso']
const NIVELES_APOYO = ['bajo', 'intermedio', 'alto']
const TONOS = ['formal', 'cercano', 'empatico', 'directo', 'infantil']
const PROFESIONES_TUTOR = ['Madre de familia', 'Padre de familia', 'Hermano/a mayor', 'Cuidador/a principal', 'Abuelo/a']
const HISTORIAL_EDUCACION = ['educacion_regular', 'educacion_especial', 'inclusiva', 'escolarizado', 'no_escolarizado']
const HISTORIAL_TERAPIA = ['fisioterapia', 'terapia_lenguaje', 'terapia_ocupacional', 'ABA', 'psicologia', 'sin_terapia']

// ── PRNG determinística (mulberry32): re-ejecuciones reproducibles ─────────
function crearRng(semilla: number): () => number {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = crearRng(20261014)

function elegir<T>(lista: readonly T[]): T {
  return lista[Math.floor(rng() * lista.length)]
}
function elegirVarios<T>(lista: readonly T[], max: number): T[] {
  const copia = [...lista]
  const n = 1 + Math.floor(rng() * max)
  const salida: T[] = []
  for (let i = 0; i < n && copia.length > 0; i++) {
    salida.push(copia.splice(Math.floor(rng() * copia.length), 1)[0])
  }
  return salida
}
function enteroEntre(min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}
/** Fecha ISO aleatoria dentro de los últimos `dias` días. */
function fechaRecienteIso(dias = 180): string {
  const ms = Date.now() - Math.floor(rng() * dias * 24 * 60 * 60 * 1000)
  return new Date(ms).toISOString()
}
function nombreAleatorio(): string {
  return `${elegir(NOMBRES)} ${elegir(APELLIDOS)} ${elegir(APELLIDOS)}`
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flag = (nombre: string) => args.includes(`--${nombre}`)
const opcion = (nombre: string, defecto: string) => {
  const encontrado = args.find((a) => a.startsWith(`--${nombre}=`))
  return encontrado ? encontrado.slice(nombre.length + 3) : defecto
}

const NUM_TUTORES = Math.max(0, parseInt(opcion('tutores', '300'), 10) || 300)
const NUM_PCD = Math.max(0, parseInt(opcion('pcds', '700'), 10) || 700)
const PASSWORD = opcion('password', 'Raices1234')
const LIMITE_DEPENDIENTES = (() => {
  const val = process.env.MAX_DEPENDIENTES_POR_TUTOR
  const parsed = val ? parseInt(val, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5
})()

if (flag('help')) {
  console.log(`
Uso: npx ts-node scripts/seed-usuarios-masivo.ts [opciones]

Opciones:
  --tutores=N      Número de tutores a crear (default 300)
  --pcds=N         Número de cuentas PCD a crear (default 700)
  --password=XXX   Contraseña común para todos (default Raices1234)
  --dry-run        Solo imprime el plan; no escribe nada
  --clean          Elimina SOLO los usuarios demo creados por este script
  --yes            No pregunta confirmación
  --help           Esta ayuda

Los usuarios usan UIDs y emails determinísticos (demo-tutor-NNN / demo-pcd-NNN),
por lo que re-ejecutar es idempotente y --clean borra exactamente lo creado.
`)
  process.exit(0)
}

// ── Plan de distribución: round-robin para que ningún tutor exceda el límite ─
function planificarAsignacion(): number[][] {
  // tutor i (0-based) recibe los PCD con índice j tal que j % NUM_TUTORES === i
  const asignacion: number[][] = Array.from({ length: NUM_TUTORES }, () => [])
  for (let j = 0; j < NUM_PCD; j++) {
    asignacion[j % NUM_TUTORES].push(j)
  }
  return asignacion
}

interface DatosGenerados {
  tutores: Array<{ uid: string; email: string; nombre: string; ciudad: string; estado: string }>
  pcds: Array<{
    uid: string
    email: string
    nombre: string
    ciudad: string
    estado: string
    tutorUid: string
    features: Record<string, boolean>
    fechaCreacion: string
    destinatarioRegistro: string
  }>
}

function generarDatos(): DatosGenerados {
  const asignacion = planificarAsignacion()

  const tutores = Array.from({ length: NUM_TUTORES }, (_, i) => {
    const n = i + 1
    const ubicacion = elegir(CIUDADES)
    return {
      uid: UID_TUTOR(n),
      email: EMAIL_TUTOR(n),
      nombre: nombreAleatorio(),
      ciudad: ubicacion.ciudad,
      estado: ubicacion.estado,
    }
  })

  const pcds: DatosGenerados['pcds'] = []
  for (let i = 0; i < NUM_TUTORES; i++) {
    for (const j of asignacion[i]) {
      const n = j + 1
      const ubicacion = elegir(CIUDADES)
      // 10% de las PCDs tienen alguna feature deshabilitada para ejercitar
      // la lógica de permisos del tutor en pruebas reales.
      const features: Record<string, boolean> = { ...FEATURES_POR_DEFECTO }
      if (rng() < 0.1) features[elegir(['chat', 'comunidad', 'postulaciones'])] = false
      pcds.push({
        uid: UID_PCD(n),
        email: EMAIL_PCD(n),
        nombre: nombreAleatorio(),
        ciudad: ubicacion.ciudad,
        estado: ubicacion.estado,
        tutorUid: tutores[i].uid,
        features,
        fechaCreacion: fechaRecienteIso(),
        destinatarioRegistro: elegir(['para_mi', 'para_hijo', 'para_familiar']),
      })
    }
  }
  return { tutores, pcds }
}

// ── Inicialización de Firebase (mismo patrón que src/database/seed/seed.ts) ─
function inicializarFirebase(): Firestore {
  const projectId = process.env.FIREBASE_PROJECT_ID
  if (!projectId) {
    console.error('❌ FIREBASE_PROJECT_ID no está definido en .env')
    process.exit(1)
  }

  if (getApps().length === 0) {
    const serviceAccountJson =
      process.env.FIREBASE_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT
    if (serviceAccountJson) {
      try {
        const parsed = JSON.parse(serviceAccountJson)
        initializeApp({ credential: cert(parsed), projectId: parsed.project_id || projectId })
      } catch {
        console.warn('⚠️  FIREBASE_CREDENTIALS no parseable. Usando Application Default Credentials.')
        initializeApp({ projectId })
      }
    } else {
      // Modo ADC (cuenta de servicio / gcloud auth application-default login)
      initializeApp({ projectId })
    }
  }
  return getFirestore()
}

function preguntar(pregunta: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((res) => rl.question(pregunta, (respuesta) => { rl.close(); res(respuesta.trim()) }))
}

/** Pool de concurrencia limitada para createUser (respeta cuotas de Identity Toolkit). */
async function conConcurrencia<T>(items: T[], limite: number, fn: (item: T) => Promise<void>): Promise<void> {
  let siguiente = 0
  const workers = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (siguiente < items.length) {
      const idx = siguiente++
      await fn(items[idx])
    }
  })
  await Promise.all(workers)
}

function errorCode(e: unknown): string | undefined {
  return (e as { code?: string })?.code
}

// ── Modo limpieza: borra SOLO lo creado por este script ─────────────────────
async function modoLimpieza(db: Firestore): Promise<void> {
  const auth = getAuth()
  const datos = generarDatos() // mismos UIDs determinísticos
  const todos = [...datos.tutores, ...datos.pcds]
  console.log(`\n🗑️  Modo limpieza: se eliminarán hasta ${todos.length} cuentas demo (si existen).`)

  let authBorrados = 0
  let authNoExistentes = 0
  await conConcurrencia(todos, 10, async (u) => {
    try {
      await auth.deleteUser(u.uid)
      authBorrados++
    } catch (e: unknown) {
      if (errorCode(e) === 'auth/user-not-found') authNoExistentes++
      else throw e
    }
  })

  // Docs de Firestore en lotes de 500 (límite de batch de Firestore)
  let borrados = 0
  let lote = db.batch()
  let opsEnLote = 0
  const flush = async () => {
    if (opsEnLote > 0) {
      await lote.commit()
      lote = db.batch()
      opsEnLote = 0
    }
  }
  const programar = (ref: FirebaseFirestore.DocumentReference) => {
    lote.delete(ref)
    opsEnLote++
    borrados++
    if (opsEnLote >= 500) return flush()
    return Promise.resolve()
  }

  for (const u of todos) {
    // perfiles/{uid}
    await programar(db.collection(COLECCIONES.perfiles).doc(u.uid))
    // perfilesExtendidos del usuario
    const ext = await db.collection(COLECCIONES.perfilesExtendidos)
      .where('usuarioId', '==', u.uid).get()
    for (const doc of ext.docs) await programar(doc.ref)
    // dependientes donde es tutor (pcd vinculada) o donde es la pcd vinculada
    const comoTutor = await db.collection(COLECCIONES.dependientes)
      .where('tutorId', '==', u.uid).get()
    for (const doc of comoTutor.docs) await programar(doc.ref)
    const comoPcd = await db.collection(COLECCIONES.dependientes)
      .where('pcdUserId', '==', u.uid).get()
    for (const doc of comoPcd.docs) await programar(doc.ref)
  }
  await flush()

  console.log(`\n✅ Limpieza completada:`)
  console.log(`   Firebase Auth eliminados: ${authBorrados} (no existían: ${authNoExistentes})`)
  console.log(`   Documentos Firestore eliminados: ${borrados}`)
}

// ── Modo creación ───────────────────────────────────────────────────────────
async function modoCreacion(db: Firestore): Promise<void> {
  const auth = getAuth()
  const datos = generarDatos()

  const maxPorTutor = Math.max(...planificarAsignacion().map((a) => a.length), 0)
  console.log(`\n🌱 Seed masivo de usuarios (proyecto: ${process.env.FIREBASE_PROJECT_ID})`)
  console.log(`   Tutores (padre_tutor): ${NUM_TUTORES}`)
  console.log(`   Cuentas PCD vinculadas: ${NUM_PCD} (máx. ${maxPorTutor} por tutor; límite del sistema: ${LIMITE_DEPENDIENTES})`)
  console.log(`   Contraseña común: ${PASSWORD}`)
  console.log(`   Emails: ${PREFIX_EMAIL}tutorNNN@${DOMINIO_EMAIL} / ${PREFIX_EMAIL}pcdNNN@${DOMINIO_EMAIL}`)
  if (maxPorTutor > LIMITE_DEPENDIENTES) {
    console.warn(`\n⚠️  ATENCIÓN: la distribución excede MAX_DEPENDIENTES_POR_TUTOR=${LIMITE_DEPENDIENTES}.`)
  }

  // 1) Cuentas Firebase Auth (UID determinístico → idempotente)
  console.log(`\n🔑 Creando cuentas en Firebase Auth...`)
  const creados = new Set<string>()
  let omitidos = 0
  let errores = 0
  const todos = [...datos.tutores.map((t) => ({ uid: t.uid, email: t.email, nombre: t.nombre })),
    ...datos.pcds.map((p) => ({ uid: p.uid, email: p.email, nombre: p.nombre }))]
  let procesados = 0
  await conConcurrencia(todos, 10, async (u) => {
    try {
      await auth.createUser({
        uid: u.uid,
        email: u.email,
        password: PASSWORD,
        displayName: u.nombre,
      })
      creados.add(u.uid)
    } catch (e: unknown) {
      if (errorCode(e) === 'auth/uid-already-exists' || errorCode(e) === 'auth/email-already-exists') {
        omitidos++ // re-ejecución: ya existía, se conserva
      } else {
        errores++
        console.error(`   ❌ ${u.email}: ${(e as Error).message}`)
      }
    }
    procesados++
    if (procesados % 200 === 0) console.log(`   ... ${procesados}/${todos.length}`)
  })
  console.log(`   Auth → creados: ${creados.size}, omitidos (ya existían): ${omitidos}, errores: ${errores}`)

  // 2) Firestore: perfiles de tutores
  console.log(`\n📝 Escribiendo documentos en Firestore...`)
  let escritos = 0
  let lote = db.batch()
  let opsEnLote = 0
  const flush = async () => {
    if (opsEnLote > 0) {
      await lote.commit()
      escritos += opsEnLote
      lote = db.batch()
      opsEnLote = 0
    }
  }
  const programarSet = (ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData) => {
    lote.set(ref, data)
    opsEnLote++
    if (opsEnLote >= 500) return flush()
    return Promise.resolve()
  }

  const ahora = new Date().toISOString()

  for (const tutor of datos.tutores) {
    if (!creados.has(tutor.uid)) continue // ya existía de una corrida previa
    await programarSet(db.collection(COLECCIONES.perfiles).doc(tutor.uid), {
      id: tutor.uid,
      email: tutor.email,
      nombreCompleto: tutor.nombre,
      rol: 'padre_tutor',
      activo: true,
      verificado: false,
      features: { ...FEATURES_POR_DEFECTO },
      fechaCreacion: fechaRecienteIso(),
      ciudad: tutor.ciudad,
      estado: tutor.estado,
      profesion: elegir(PROFESIONES_TUTOR),
      // Estado de acreditación: solo aplica a padres/tutores (como en register)
      estadoAcreditacionTutor: 'pendiente',
      destinatarioRegistro: 'para_familiar',
    })
  }

  // 3) Firestore: perfiles PCD + relación dependientes + perfilesExtendidos
  for (const pcd of datos.pcds) {
    if (!creados.has(pcd.uid)) continue
    const fechaCreacion = pcd.fechaCreacion

    // perfiles/{pcdUid} — con tutorId, como en register({ rol:'pcd', tutorId })
    await programarSet(db.collection(COLECCIONES.perfiles).doc(pcd.uid), {
      id: pcd.uid,
      email: pcd.email,
      nombreCompleto: pcd.nombre,
      rol: 'pcd',
      activo: true,
      verificado: false,
      features: pcd.features,
      fechaCreacion,
      ciudad: pcd.ciudad,
      estado: pcd.estado,
      tutorId: pcd.tutorUid,
      destinatarioRegistro: pcd.destinatarioRegistro,
    })

    // dependientes/{pcdUid} — registro canónico de la vinculación
    // (espejo de registrarDependienteVinculado: id del doc = pcdUid)
    await programarSet(db.collection(COLECCIONES.dependientes).doc(pcd.uid), {
      id: pcd.uid,
      tutorId: pcd.tutorUid,
      pcdUserId: pcd.uid,
      esCuentaVinculada: true,
      rol: 'pcd',
      nombreCompleto: pcd.nombre,
      parentesco: null,
      datosPerfil: '{}',
      features: { ...FEATURES_POR_DEFECTO },
      fechaCreacion,
    })

    // perfilesExtendidos — perfil de necesidades (arrays como JSON string,
    // mismo formato que UsersService.saveProfilingData)
    const refExt = db.collection(COLECCIONES.perfilesExtendidos).doc()
    await programarSet(refExt, {
      id: refExt.id,
      usuarioId: pcd.uid,
      tiposDiscapacidad: JSON.stringify(elegirVarios(TIPOS_DISCAPACIDAD, 2)),
      severidadDiscapacidad: elegir(SEVERIDADES),
      modosComunicacion: JSON.stringify(elegirVarios(MODOS_COMUNICACION, 2)),
      necesidadesMovilidad: JSON.stringify(elegirVarios(NECESIDADES_MOVILIDAD, 2)),
      accesoTecnologia: JSON.stringify(elegirVarios(ACCESO_TECNOLOGIA, 2)),
      zonasPreferidas: JSON.stringify([elegir(CIUDADES).ciudad]),
      necesidades: JSON.stringify(elegirVarios(['terapia', 'educacion', 'movilidad', 'comunicacion', 'social'], 2)),
      metasActuales: JSON.stringify(elegirVarios(['autonomia', 'inclusion_laboral', 'educacion', 'habilidades_sociales'], 2)),
      areasApoyo: JSON.stringify(elegirVarios(['educacion', 'salud', 'empleo', 'familia'], 2)),
      historialEducacion: JSON.stringify(elegirVarios(HISTORIAL_EDUCACION, 2)),
      historialTerapia: JSON.stringify(elegirVarios(HISTORIAL_TERAPIA, 2)),
      etapaVida: elegir(ETAPAS_VIDA),
      preocupacionesActuales: elegir(['inclusión laboral', 'acceso a terapias', 'autonomía diaria', 'integración escolar', 'comunicación']),
      nivelApoyo: elegir(NIVELES_APOYO),
      // Campos MVP (espejo del guardado real)
      historialInstituciones: JSON.stringify([]),
      tonoContextual: elegir(TONOS),
      escalasVida: null,
      tieneDiagnostico: rng() < 0.7,
      requiereEvaluacion: false,
      temporalidadOrigen: null,
      preferenciaFormato: null,
      areasInteres: JSON.stringify(elegirVarios(['terapia', 'educacion', 'empleo', 'deporte', 'social'], 2)),
      viabilidadEconomica: null,
      condiciones: JSON.stringify([]),
    })
  }
  await flush()

  // ── Resumen ───────────────────────────────────────────────────────────
  const creadosTutores = datos.tutores.filter((t) => creados.has(t.uid)).length
  const creadosPcds = datos.pcds.filter((p) => creados.has(p.uid)).length
  console.log(`\n========================================`)
  console.log(`  Resumen del seed`)
  console.log(`========================================`)
  console.log(`  Firebase Auth creados:        ${creados.size}`)
  console.log(`  Perfiles de tutor:            ${creadosTutores}`)
  console.log(`  Perfiles PCD:                 ${creadosPcds}`)
  console.log(`  Relaciones dependientes:      ${creadosPcds}`)
  console.log(`  PerfilesExtendidos (PCD):     ${creadosPcds}`)
  console.log(`  Documentos Firestore escritos: ${escritos}`)
  console.log(`========================================`)
  console.log(`\n🔑 Login de prueba: ${datos.pcds[0]?.email} / ${PASSWORD}`)
  console.log(`   (o ${datos.tutores[0]?.email} / ${PASSWORD})`)
  console.log(`\n🧹 Para deshacer: npx ts-node scripts/seed-usuarios-masivo.ts --clean --yes`)
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const limpiar = flag('clean')
  const dryRun = flag('dry-run')

  if (dryRun) {
    const datos = generarDatos()
    const asignacion = planificarAsignacion()
    const maxPorTutor = Math.max(...asignacion.map((a) => a.length), 0)
    console.log(`\n[Dry-run] No se escribirá nada.`)
    console.log(`  Proyecto objetivo: ${process.env.FIREBASE_PROJECT_ID ?? '(no definido)'}`)
    console.log(`  Tutores: ${NUM_TUTORES} | PCDs: ${NUM_PCD} | máx. por tutor: ${maxPorTutor} (límite sistema: ${LIMITE_DEPENDIENTES})`)
    console.log(`  Ejemplo tutor:    ${datos.tutores[0]?.uid} ${datos.tutores[0]?.email} "${datos.tutores[0]?.nombre}"`)
    console.log(`  Ejemplo PCD:      ${datos.pcds[0]?.uid} ${datos.pcds[0]?.email} "${datos.pcds[0]?.nombre}" → tutor ${datos.pcds[0]?.tutorUid}`)
    console.log(`  Total docs Firestore estimados: ${NUM_TUTORES + NUM_PCD * 3}`)
    process.exit(0)
  }

  if (!limpiar && !flag('yes')) {
    console.log(`\n⚠️  Esto creará ${NUM_TUTORES + NUM_PCD} cuentas REALES de Firebase Auth`)
    console.log(`    en el proyecto "${process.env.FIREBASE_PROJECT_ID}" con contraseña pública de prueba.`)
    const respuesta = await preguntar('¿Continuar? (escribe "si" para aceptar): ')
    if (respuesta.toLowerCase() !== 'si') {
      console.log('Cancelado. Usa --dry-run para ver el plan sin escribir.')
      process.exit(0)
    }
  }

  if (limpiar && !flag('yes')) {
    const respuesta = await preguntar('¿Eliminar TODOS los usuarios demo (emails demo.*@raices.test)? (escribe "si" para aceptar): ')
    if (respuesta.toLowerCase() !== 'si') {
      console.log('Cancelado.')
      process.exit(0)
    }
  }

  const db = inicializarFirebase()

  if (limpiar) {
    await modoLimpieza(db)
  } else {
    await modoCreacion(db)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error('❌ Error durante la ejecución:', e)
  process.exit(1)
})
