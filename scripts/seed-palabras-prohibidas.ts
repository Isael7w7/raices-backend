/**
 * Carga inicial de la colección `palabras_prohibidas` para poder practicar la
 * moderación sin capturar término por término desde el panel.
 *
 * QUÉ HACE
 *   1. Normaliza cada término con `normalizarPalabra` (el mismo helper que usa
 *      el servicio), así lo guardado coincide con lo que compara la moderación.
 *   2. Descarta duplicados que colapsan al normalizar ("cabron" y "cabrón" son
 *      el mismo término).
 *   3. Escribe en lote con ids de documento deterministas
 *      (`<palabra-normalizada>`): re-ejecutar el script sobrescribe, no duplica.
 *
 * IMPORTANTE — el caché del backend
 *   `PalabrasProhibidasService` carga la lista en memoria al arrancar
 *   (`onModuleInit`). Lo que escribe este script NO aplica hasta que reinicies
 *   el backend. Para altas en caliente usa `POST /api/admin/palabras-prohibidas`.
 *
 * La lista es un PUNTO DE PARTIDA editable: bórrala o ajústala desde el panel
 * (`DELETE /api/admin/palabras-prohibidas/:id`). Son insultos genéricos del
 * español de México, sin inventario exhaustivo; agregar la familia completa
 * (femenino, plural) importa porque la comparación exige la palabra exacta.
 *
 * Modo de uso:
 *   npm run db:seed-palabras               # escribe en Firestore
 *   npm run db:seed-palabras -- --dry-run  # solo imprime el plan
 *
 * Requisitos: FIREBASE_PROJECT_ID y FIREBASE_CREDENTIALS en `.env`
 * (o credenciales por defecto de la aplicación, ADC).
 */

import * as dotenv from 'dotenv'
import { join } from 'path'

dotenv.config({ path: join(__dirname, '..', '.env') })

// El servicio declara decoradores de Nest; el polyfill debe cargarse antes.
import 'reflect-metadata'

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { normalizarPalabra } from '../src/modules/admin/palabras-prohibidas.service'

/** Espejo de `src/database/firestore.constants.ts`. */
const COLECCION_PALABRAS = 'palabras_prohibidas'

/** Quién figura como autor de la carga inicial. */
const CREADO_POR = 'seed-inicial'

/**
 * Lista de arranque. Cada término se guarda normalizado, así que aquí va en
 * forma limpia: no agregues variantes leet ni con puntos, esas ya las cubre el
 * detector de evasiones. Las variantes de género y número SÍ van explícitas.
 */
const CATALOGO: ReadonlyArray<{ palabra: string; categoria: string }> = [
  // ── Insultos directos ──────────────────────────────────────────────
  { palabra: 'pendejo', categoria: 'insulto' },
  { palabra: 'pendeja', categoria: 'insulto' },
  { palabra: 'pendejos', categoria: 'insulto' },
  { palabra: 'pendejas', categoria: 'insulto' },
  { palabra: 'pendejada', categoria: 'insulto' },
  { palabra: 'pendejadas', categoria: 'insulto' },
  { palabra: 'estupido', categoria: 'insulto' },
  { palabra: 'estupida', categoria: 'insulto' },
  { palabra: 'estupidos', categoria: 'insulto' },
  { palabra: 'estupidas', categoria: 'insulto' },
  { palabra: 'idiota', categoria: 'insulto' },
  { palabra: 'idiotas', categoria: 'insulto' },
  { palabra: 'imbecil', categoria: 'insulto' },
  { palabra: 'imbeciles', categoria: 'insulto' },
  { palabra: 'tarado', categoria: 'insulto' },
  { palabra: 'tarada', categoria: 'insulto' },
  { palabra: 'mamon', categoria: 'insulto' },
  { palabra: 'mamona', categoria: 'insulto' },
  { palabra: 'culero', categoria: 'insulto' },
  { palabra: 'culera', categoria: 'insulto' },
  { palabra: 'ojete', categoria: 'insulto' },

  // ── Groserías y albures ────────────────────────────────────────────
  { palabra: 'puta', categoria: 'groseria' },
  { palabra: 'puto', categoria: 'groseria' },
  { palabra: 'putas', categoria: 'groseria' },
  { palabra: 'putos', categoria: 'groseria' },
  { palabra: 'mierda', categoria: 'groseria' },
  { palabra: 'cabron', categoria: 'groseria' },
  { palabra: 'cabrona', categoria: 'groseria' },
  { palabra: 'verga', categoria: 'groseria' },
  { palabra: 'vergas', categoria: 'groseria' },
  { palabra: 'chingada', categoria: 'groseria' },
  { palabra: 'chingadera', categoria: 'groseria' },
  { palabra: 'zorra', categoria: 'groseria' },
  { palabra: 'perra', categoria: 'groseria' },

  // ── Discriminación: capacidades, orientación, origen ───────────────
  { palabra: 'retrasado', categoria: 'discriminacion' },
  { palabra: 'retrasada', categoria: 'discriminacion' },
  { palabra: 'mongolico', categoria: 'discriminacion' },
  { palabra: 'mongolica', categoria: 'discriminacion' },
  { palabra: 'maricon', categoria: 'discriminacion' },
  { palabra: 'joto', categoria: 'discriminacion' },
  { palabra: 'indio', categoria: 'discriminacion' },
  { palabra: 'india', categoria: 'discriminacion' },

  // ── Modismos locales (revisar: algunos son de uso cotidiano) ───────
  { palabra: 'güey', categoria: 'modismo_local' },
  { palabra: 'naco', categoria: 'modismo_local' },
  { palabra: 'naca', categoria: 'modismo_local' },
]

const dryRun = process.argv.includes('--dry-run')
const projectId = process.env.FIREBASE_PROJECT_ID || 'raices-demo'
// Mismo criterio que `src/database/seed/seed.ts`.
const serviceAccountJson =
  process.env.FIREBASE_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT

function inicializarFirebase(): void {
  if (getApps().length > 0) return

  if (!serviceAccountJson) {
    initializeApp({ projectId })
    return
  }

  try {
    const parsed = JSON.parse(serviceAccountJson)
    initializeApp({
      credential: cert(parsed),
      projectId: parsed.project_id || projectId,
    })
  } catch {
    console.warn('⚠️ No se pudo parsear FIREBASE_CREDENTIALS; se usará ADC.')
    initializeApp({ projectId })
  }
}

/** Colapsa la lista del catálogo a términos únicos ya normalizados. */
function construirPlan(): Array<{ id: string; palabra: string; categoria: string }> {
  const unicos = new Map<string, string>()

  for (const { palabra, categoria } of CATALOGO) {
    const normalizada = normalizarPalabra(palabra)
    if (!normalizada) continue
    // El primero gana: el catálogo está ordenado por categoría.
    if (!unicos.has(normalizada)) unicos.set(normalizada, categoria.trim())
  }

  return Array.from(unicos, ([palabra, categoria]) => ({
    // Id determinista: una palabra ocupa siempre el mismo documento.
    id: palabra.replace(/\s+/g, '-'),
    palabra,
    categoria,
  }))
}

async function main(): Promise<void> {
  const plan = construirPlan()
  const porCategoria = new Map<string, number>()
  for (const { categoria } of plan) {
    porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + 1)
  }

  console.log(`Total de términos: ${plan.length}`)
  for (const [categoria, cantidad] of porCategoria) {
    console.log(`  · ${categoria}: ${cantidad}`)
  }

  if (dryRun) {
    console.log('\n[dry-run] Nada se escribió. Términos que se cargarían:')
    console.log(plan.map(p => p.palabra).join(', '))
    return
  }

  inicializarFirebase()
  const db = getFirestore()
  const lote = db.batch()
  const fechaCreacion = new Date().toISOString()

  for (const { id, palabra, categoria } of plan) {
    lote.set(db.collection(COLECCION_PALABRAS).doc(id), {
      palabra,
      categoria,
      activa: true,
      creadoPor: CREADO_POR,
      fechaCreacion,
    })
  }

  await lote.commit()
  console.log(`\n✅ ${plan.length} términos escritos en \`${COLECCION_PALABRAS}\`.`)
  console.log('   Reinicia el backend para que el caché de moderación los tome.')
}

main().catch((e: unknown) => {
  console.error('❌ Falló la carga:', e instanceof Error ? e.message : e)
  process.exit(1)
})
