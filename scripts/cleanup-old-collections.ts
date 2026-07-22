/**
 * Script de limpieza: Elimina colecciones antiguas con nombres en inglés
 * que ya no son utilizadas por el código (migrado a español).
 *
 * Modo de uso:
 *   cd backend
 *   npx ts-node scripts/cleanup-old-collections.ts
 *
 * Requisitos:
 *   - Tener FIREBASE_PROJECT_ID y FIREBASE_SERVICE_ACCOUNT en .env
 *   - Tener instaladas las dependencias (pnpm install)
 *
 * ⚠️ ADVERTENCIA: Este script ELIMINA DATOS permanentemente.
 *    Se recomienda hacer un backup de Firestore antes de ejecutarlo.
 */

import * as dotenv from 'dotenv'
import { join } from 'path'
dotenv.config({ path: join(__dirname, '..', '.env') })

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, Firestore } from 'firebase-admin/firestore'

// ── Colecciones actuales en español (usadas por el código) ──
const COLECCIONES_ACTUALES = new Set([
  'perfiles',
  'perfilesExtendidos',
  'dependientes',
  'favoritos',
  'resenas',
  'publicaciones',
  'comentarios',
  'meGustas',
  'grupos',
  'miembrosGrupo',
  'mensajesDirectos',
  'notificaciones',
  'postulaciones',
  'instituciones',
  'vacantes',
  'configuraciones',
  '_analiticas',
])

// ── Posibles nombres antiguos en inglés (los repositorios ya se eliminaron del código) ──
const POSIBLES_ANTIGUOS = new Set([
  // Posibles colecciones que pudieron existir antes de la migración
  'users',
  'profiles',
  'userProfiles',
  'profilesExtended',
  'dependents',
  'favorites',
  'reviews',
  'posts',
  'comments',
  'likes',
  'groups',
  'groupMembers',
  'messages',
  'directMessages',
  'notifications',
  'applications',
  'jobApplications',
  'institutions',
  'jobs',
  'vacancies',
  'settings',
  'analytics',
  '_analytics',
])

// ── Inicializar Firebase ──
const projectId = process.env.FIREBASE_PROJECT_ID
if (!projectId) {
  console.error('❌ FIREBASE_PROJECT_ID is required in .env')
  process.exit(1)
}

if (getApps().length === 0) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT
  if (serviceAccountJson) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)), projectId })
  } else {
    console.warn('⚠️  No FIREBASE_SERVICE_ACCOUNT found. Using application default credentials.')
    initializeApp({ projectId })
  }
}

const db: Firestore = getFirestore()

async function contarDocumentos(nombreColeccion: string): Promise<number> {
  try {
    const snap = await db.collection(nombreColeccion).limit(1000).get()
    return snap.size
  } catch {
    return 0
  }
}

async function eliminarColeccion(nombre: string) {
  const snap = await db.collection(nombre).get()
  if (snap.empty) return 0

  let eliminados = 0
  const lote = db.batch()
  let operaciones = 0

  for (const doc of snap.docs) {
    lote.delete(doc.ref)
    operaciones++
    eliminados++

    // Firestore batch max 500 operaciones
    if (operaciones >= 500) {
      await lote.commit()
      operaciones = 0
    }
  }

  if (operaciones > 0) {
    await lote.commit()
  }

  return eliminados
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║     🧹 LIMPIEZA - Colecciones antiguas en Firestore    ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log('')
  console.log(`📋 Project: ${projectId}`)
  console.log('')

  // 1. Listar todas las colecciones actuales en Firestore
  const coleccionesFirestore = await db.listCollections()
  const nombresFirestore = Array.from(coleccionesFirestore.map(c => c.id))
  const setNombresFirestore = new Set(nombresFirestore)

  console.log(`📁 Colecciones en Firestore: ${coleccionesFirestore.length}`)
  console.log('')

  // 2. Identificar colecciones antiguas (en Firestore pero NO en COLECCIONES_ACTUALES)
  const candidatas = nombresFirestore.filter(n => !COLECCIONES_ACTUALES.has(n))

  // Mostrar colecciones actuales en uso
  console.log('Colecciones actuales en uso:')
  const colsActuales = Array.from(COLECCIONES_ACTUALES).sort()
  for (const nombre of colsActuales) {
    if (setNombresFirestore.has(nombre)) {
      console.log(`   ✅ ${nombre}`)
    } else {
      console.log(`   ⬜ ${nombre} (vacía / no creada aún)`)
    }
  }

  if (candidatas.length === 0) {
    console.log('')
    console.log('✅ No se encontraron colecciones antiguas. Todo está en español.')
    process.exit(0)
  }

  // Listar candidatas con cantidad de documentos y clasificación
  console.log('')
  console.log('⚠️  Las siguientes colecciones NO están en uso por el código actual y serán eliminadas:')
  console.log('')
  const infoCandidatas: { nombre: string; docs: number; tipo: string }[] = []
  for (const nombre of candidatas) {
    const docs = await contarDocumentos(nombre)
    const tipo = POSIBLES_ANTIGUOS.has(nombre)
      ? '📛 nombre antiguo en inglés'
      : '❓ nombre desconocido'
    infoCandidatas.push({ nombre, docs, tipo })
    console.log(`   🗑️  ${nombre} → ${docs} documento(s) (${tipo})`)
  }

  console.log('')
  console.log('⚠️  ADVERTENCIA: Esta acción eliminará datos PERMANENTEMENTE.')
  console.log('   Presiona Ctrl+C ahora para cancelar, o Enter para continuar...')
  console.log('')

  // En un script ejecutable, usamos readline para confirmar
  const readline = await import('readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const respuesta = await new Promise<string>((resolve) => {
    rl.question('¿Eliminar todas las colecciones listadas arriba? (escribe "si" para confirmar): ', (r) => {
      rl.close()
      resolve(r.toLowerCase())
    })
  })

  if (respuesta !== 'si') {
    console.log('❌ Operación cancelada.')
    process.exit(0)
  }

  // 3. Eliminar las colecciones antiguas
  console.log('')
  console.log('🗑️  Eliminando colecciones...')
  console.log('')

  let totalEliminados = 0
  for (const nombre of candidatas) {
    const eliminados = await eliminarColeccion(nombre)
    totalEliminados += eliminados
    console.log(`   ✅ ${nombre}: ${eliminados} documento(s) eliminados`)
  }

  console.log('')
  console.log(`🎉 Limpieza completada.`)
  console.log(`   Total de documentos eliminados: ${totalEliminados}`)
  console.log(`   Colecciones limpiadas: ${candidatas.length}`)
  console.log('')
  console.log('✅ Ahora todas las colecciones en Firestore usan nombres en español.')

  process.exit(0)
}

main().catch((e) => {
  console.error('❌ Error:', e)
  process.exit(1)
})
