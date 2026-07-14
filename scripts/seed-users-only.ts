/**
 * Seed SEGURO: Solo inserta los 3 usuarios demo en Firestore production
 * NO limpia ninguna colección - verifica si el usuario ya existe antes de crearlo
 * 
 * Uso: pnpm tsx scripts/seed-users-only.ts
 */

import * as dotenv from 'dotenv'
dotenv.config()

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import * as bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'

// ── Firebase Admin initialization ──────────────────────────────
const projectId = process.env.FIREBASE_PROJECT_ID || 'raices-499122'
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT

if (getApps().length === 0) {
  if (serviceAccountJson) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)), projectId })
  } else {
    // Use Application Default Credentials (ADC) - works in Cloud Run with service account
    initializeApp({ projectId })
  }
}

const db = getFirestore()

// ── Usuarios demo a insertar ──────────────────────────────────
const demoUsers = [
  {
    email: 'admin@raices.mx',
    password: 'Admin1234',
    role: 'admin',
    full_name: 'Admin Raíces',
    city: 'Mérida',
    state: 'Yucatán',
  },
  {
    email: 'demo@raices.mx',
    password: 'Demo1234',
    role: 'tutor', // Usamos 'tutor' porque es un rol válido
    full_name: 'Luis Hernández',
    city: 'Mérida',
    state: 'Yucatán',
  },
  {
    email: 'tutor@raices.mx',
    password: 'Tutor1234',
    role: 'tutor',
    full_name: 'Ana García',
    city: 'Mérida',
    state: 'Yucatán',
  },
]

async function seedUsersOnly() {
  const t0 = Date.now()
  console.log('🌱 Seed SEGURO: Insertando solo usuarios demo...\n')

  let created = 0
  let skipped = 0
  let errors = 0

  for (const userData of demoUsers) {
    try {
      // Verificar si el usuario ya existe
      const existing = await db.collection('u_profiles')
        .where('email', '==', userData.email)
        .limit(1)
        .get()

      if (!existing.empty) {
        console.log(`⏭️  ${userData.email} ya existe (id: ${existing.docs[0].id}) - omitiendo`)
        skipped++
        continue
      }

      // Crear el usuario
      const id = uuid()
      const password_hash = await bcrypt.hash(userData.password, 10)
      const now = new Date().toISOString()

      await db.collection('u_profiles').doc(id).set({
        id,
        email: userData.email,
        password_hash,
        role: userData.role,
        full_name: userData.full_name,
        city: userData.city,
        state: userData.state,
        is_active: true,
        is_verified: true,
        created_at: now,
      })

      console.log(`✅ ${userData.email} creado (id: ${id}, role: ${userData.role})`)
      created++
    } catch (err: any) {
      console.error(`❌ Error creando ${userData.email}:`, err.message)
      errors++
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\n📊 Resumen en ${elapsed}s:`)
  console.log(`   ✅ Creados: ${created}`)
  console.log(`   ⏭️  Omitidos (ya existían): ${skipped}`)
  console.log(`   ❌ Errores: ${errors}`)
  console.log('\n🔑 Usuarios disponibles para login:')
  for (const u of demoUsers) {
    console.log(`   ${u.email} / ${u.password} (rol: ${u.role})`)
  }

  process.exit(0)
}

seedUsersOnly().catch((e) => {
  console.error('❌ Error durante el seed:', e)
  process.exit(1)
})
