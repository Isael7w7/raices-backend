/**
 * Script rapido para crear un documento en Firestore (perfiles)
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

// Config
const FIREBASE_UID = 'wNuOEV715KXPaZuCSTmIBivTloh2'

const DATOS_USUARIO = {
  email: 'isaelreyes427@gmail.com',
  nombreCompleto: 'Isael Ojeda',
  rol: 'pcd',
  ciudad: null,
  estado: null,
}

const projectId = process.env.FIREBASE_PROJECT_ID
if (!projectId) {
  console.error('FIREBASE_PROJECT_ID no esta definido en .env')
  process.exit(1)
}

if (getApps().length === 0) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT
  if (serviceAccountJson) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)), projectId })
    console.log('Firebase Admin inicializado con Service Account')
  } else {
    console.warn('No hay FIREBASE_SERVICE_ACCOUNT. Usando Application Default Credentials.')
    initializeApp({ projectId })
  }
}

const db = getFirestore()

async function main() {
  const ahora = new Date().toISOString()

  const docDatos = {
    id: FIREBASE_UID,
    email: DATOS_USUARIO.email,
    nombreCompleto: DATOS_USUARIO.nombreCompleto,
    rol: DATOS_USUARIO.rol,
    ciudad: DATOS_USUARIO.ciudad ?? null,
    estado: DATOS_USUARIO.estado ?? null,
    urlAvatar: null,
    activo: true,
    verificado: true,
    fechaCreacion: ahora,
  }

  const ref = db.collection('perfiles').doc(FIREBASE_UID)

  const existente = await ref.get()
  if (existente.exists) {
    console.log(`El documento ${FIREBASE_UID} ya existe en perfiles.`)
    console.log('Datos actuales:', JSON.stringify(existente.data(), null, 2))
    process.exit(0)
  }

  await ref.create(docDatos)
  console.log(`Documento creado exitosamente en perfiles/${FIREBASE_UID}`)
  console.log(JSON.stringify(docDatos, null, 2))

  process.exit(0)
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
