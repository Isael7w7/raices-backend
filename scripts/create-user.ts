/**
 * Script rápido para crear un documento en Firestore (u_profiles)
 * usando el UID real de Firebase Auth como Document ID.
 *
 * Modo de uso:
 *   cd backend
 *   npx ts-node scripts/create-user.ts
 *
 * Requisitos:
 *   - Tener FIREBASE_PROJECT_ID y FIREBASE_SERVICE_ACCOUNT en .env
 *   - Tener instaladas las dependencias (pnpm install)
 */

import * as dotenv from 'dotenv'
import { join } from 'path'
dotenv.config({ path: join(__dirname, '..', '.env') })

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// ── Config ───────────────────────────────────────────────────
const FIREBASE_UID = 'wNuOEV715KXPaZuCSTmIBivTloh2'

const USER_DATA = {
  email: 'isaelreyes427@gmail.com',
  full_name: 'Isael Ojeda',
  role: 'pcd',               // persona con discapacidad
  city: null,                 // ← cámbialo si quieres (ej: 'Mérida')
  state: null,                // ← cámbialo si quieres (ej: 'Yucatán')
}

// ── Firebase Admin init ──────────────────────────────────────
const projectId = process.env.FIREBASE_PROJECT_ID
if (!projectId) {
  console.error('❌ FIREBASE_PROJECT_ID no está definido en .env')
  process.exit(1)
}

if (getApps().length === 0) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT
  if (serviceAccountJson) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)), projectId })
    console.log('✅ Firebase Admin inicializado con Service Account')
  } else {
    console.warn('⚠️  No hay FIREBASE_SERVICE_ACCOUNT. Usando Application Default Credentials.')
    initializeApp({ projectId })
  }
}

const db = getFirestore()

// ── Crear documento ──────────────────────────────────────────
async function main() {
  const now = new Date().toISOString()

  const docData = {
    id: FIREBASE_UID,
    email: USER_DATA.email,
    full_name: USER_DATA.full_name,
    role: USER_DATA.role,
    city: USER_DATA.city ?? null,
    state: USER_DATA.state ?? null,
    avatar_url: null,
    is_active: true,
    is_verified: true,       // real desde Firebase Auth
    created_at: now,
  }

  const ref = db.collection('u_profiles').doc(FIREBASE_UID)

  // Verificar si ya existe
  const existing = await ref.get()
  if (existing.exists) {
    console.log(`⚠️  El documento ${FIREBASE_UID} ya existe en u_profiles.`)
    console.log('   Datos actuales:', JSON.stringify(existing.data(), null, 2))
    console.log('')
    console.log('   Para sobrescribir, usa ref.set() en vez de ref.create()')
    process.exit(0)
  }

  await ref.create(docData)
  console.log(`✅ Documento creado exitosamente en u_profiles/${FIREBASE_UID}`)
  console.log('')
  console.log('📄 Datos insertados:')
  console.log(JSON.stringify(docData, null, 2))
  console.log('')
  console.log('🎯 Ahora puedes consultar GET /api/users/profile con tu token real')

  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Error:', err)
  process.exit(1)
})
