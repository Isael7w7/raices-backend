import { Provider, Logger, InternalServerErrorException } from '@nestjs/common'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

export const FIRESTORE = 'FIRESTORE'
export const FIREBASE_AUTH = 'FIREBASE_AUTH'

const logger = new Logger('FirebaseProvider')

// ── Security: Required env vars ──────────────────────────────
const REQUIRED_VARS = ['FIREBASE_PROJECT_ID'] as const

function validateEnv(): void {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v])
  if (missing.length > 0) {
    const msg = `Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill in the values.`
    logger.error(`❌ ${msg}`)
    throw new InternalServerErrorException(msg)
  }
}

let initialized = false

function ensureApp() {
  if (initialized) return
  const existing = getApps()
  if (existing.length > 0) { initialized = true; return }

  validateEnv()

  const projectId = process.env.FIREBASE_PROJECT_ID!
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT

  // SECURITY: Validate service account JSON structure if provided
  if (serviceAccountJson) {
    try {
      const parsed = JSON.parse(serviceAccountJson)

      // Strict validation: service account must have these fields
      const requiredFields = ['type', 'project_id', 'private_key', 'client_email']
      const missingFields = requiredFields.filter((f) => !parsed[f])

      if (missingFields.length > 0) {
        const msg = `Invalid FIREBASE_SERVICE_ACCOUNT: missing fields: ${missingFields.join(', ')}`
        logger.error(`❌ ${msg}`)
        throw new InternalServerErrorException(msg)
      }

      if (parsed.type !== 'service_account') {
        const msg = `FIREBASE_SERVICE_ACCOUNT type must be 'service_account', got '${parsed.type}'`
        logger.error(`❌ ${msg}`)
        throw new InternalServerErrorException(msg)
      }

      if (parsed.project_id !== projectId) {
        const msg = `FIREBASE_SERVICE_ACCOUNT project_id (${parsed.project_id}) does not match FIREBASE_PROJECT_ID (${projectId})`
        logger.error(`❌ ${msg}`)
        throw new InternalServerErrorException(msg)
      }

      // SECURITY: Warn if private key looks suspicious
      if (parsed.private_key && !parsed.private_key.includes('-----BEGIN')) {
        logger.warn('⚠️  Private key does not appear to be in PEM format')
      }

      initializeApp({
        credential: cert({
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key,
        }),
        projectId,
      })

      logger.log(`✅ Firebase Admin initialized with service account for project: ${projectId}`)
    } catch (e: any) {
      if (e instanceof SyntaxError) {
        const msg = 'FIREBASE_SERVICE_ACCOUNT is not valid JSON. Paste the entire JSON content as a single line string.'
        logger.error(`❌ ${msg}`)
        throw new InternalServerErrorException(msg)
      }
      const msg = `Firebase initialization error: ${e.message}`
      logger.error(`❌ ${msg}`)
      throw new InternalServerErrorException(msg)
    }
  } else {
    // Fallback: Application Default Credentials (for local dev with gcloud CLI)
    logger.warn('⚠️  No FIREBASE_SERVICE_ACCOUNT set. Using Application Default Credentials.')
    logger.warn('   For production, set FIREBASE_SERVICE_ACCOUNT in .env')

    try {
      initializeApp({ projectId })
    } catch (e: any) {
      const msg = `Firebase initialization error: ${e.message}`
      logger.error(`❌ ${msg}`)
      throw new InternalServerErrorException(msg)
    }
  }

  initialized = true
}

// SECURITY: Log sensitive env var presence (NOT values) on startup
export function logSecurityConfig(): void {
  logger.log('🔒 Security config:')
  logger.log(`   FIREBASE_PROJECT_ID: ${process.env.FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Missing'}`)
  logger.log(`   FIREBASE_SERVICE_ACCOUNT: ${process.env.FIREBASE_SERVICE_ACCOUNT ? '✅ Set' : '⚠️  Not set (using ADC)'}`)
  logger.log(`   FIREBASE_API_KEY: ${process.env.FIREBASE_API_KEY ? '✅ Set' : '⚠️  Not set (Auth REST API will fail)'}`)
}

export const firestoreProvider: Provider = {
  provide: FIRESTORE,
  useFactory: () => {
    ensureApp()
    return getFirestore()
  },
}

export const firebaseAuthProvider: Provider = {
  provide: FIREBASE_AUTH,
  useFactory: () => {
    ensureApp()
    return getAuth()
  },
}
