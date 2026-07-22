import * as dotenv from 'dotenv'
import { join } from 'path'
dotenv.config({ path: join(__dirname, '..', '.env') })

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const projectId = process.env.FIREBASE_PROJECT_ID
if (!projectId) { console.error('Missing FIREBASE_PROJECT_ID'); process.exit(1) }

if (getApps().length === 0) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT
  if (sa) initializeApp({ credential: cert(JSON.parse(sa)), projectId })
  else initializeApp({ projectId })
}

const db = getFirestore()
const uid = 'wNuOEV715KXPaZuCSTmIBivTloh2'

async function main() {
  await db.collection('perfiles').doc(uid).update({
    ciudad: 'Merida',
    estado: 'Yucatan',
  })
  console.log('ciudad y estado actualizados')

  const doc = await db.collection('perfiles').doc(uid).get()
  console.log('Perfil:', JSON.stringify(doc.data(), null, 2))
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
