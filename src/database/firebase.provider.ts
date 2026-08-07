import { Provider, Logger, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

export const FIRESTORE = 'FIRESTORE'
export const FIREBASE_AUTH = 'FIREBASE_AUTH'

const logger = new Logger('FirebaseProvider')

// ── Security: Required env vars ──────────────────────────────
const REQUIRED_VARS = ['FIREBASE_PROJECT_ID'] as const

/**
 * Variable canónica que contiene el JSON de la cuenta de servicio en una sola
 * línea (p. ej. montada como secreto desde GCP Secret Manager en Cloud Run).
 * FIREBASE_SERVICE_ACCOUNT se conserva como alias para no romper .env locales
 * existentes. El código NUNCA lee un archivo serviceAccount.json del disco.
 */
export const FIREBASE_CREDENTIALS_ENV = 'FIREBASE_CREDENTIALS'
export const FIREBASE_SERVICE_ACCOUNT_ENV = 'FIREBASE_SERVICE_ACCOUNT'

export function resolveCredentialsJson(config: ConfigService): string | undefined {
  return (
    config.get<string>(FIREBASE_CREDENTIALS_ENV) ??
    config.get<string>(FIREBASE_SERVICE_ACCOUNT_ENV)
  )
}

function validateEnv(config: ConfigService): void {
  const missing = REQUIRED_VARS.filter((v) => !config.get<string>(v))
  if (missing.length > 0) {
    const msg = `Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill in the values.`
    logger.error(`❌ ${msg}`)
    throw new InternalServerErrorException(msg)
  }
}

let initialized = false

function ensureApp(config: ConfigService) {
  if (initialized) return
  const existing = getApps()
  if (existing.length > 0) { initialized = true; return }

  validateEnv(config)

  const projectId = config.get<string>('FIREBASE_PROJECT_ID')!
  const serviceAccountJson = resolveCredentialsJson(config)
  // Nombre de la variable realmente usada, para mensajes de error precisos
  const credentialsVar = config.get<string>(FIREBASE_CREDENTIALS_ENV)
    ? FIREBASE_CREDENTIALS_ENV
    : FIREBASE_SERVICE_ACCOUNT_ENV

  // SECURITY: Validate service account JSON structure if provided
  if (serviceAccountJson) {
    try {
      const parsed = JSON.parse(serviceAccountJson)

      // Strict validation: service account must have these fields
      const requiredFields = ['type', 'project_id', 'private_key', 'client_email']
      const missingFields = requiredFields.filter((f) => !parsed[f])

      if (missingFields.length > 0) {
        const msg = `Invalid ${credentialsVar}: missing fields: ${missingFields.join(', ')}`
        logger.error(`❌ ${msg}`)
        throw new InternalServerErrorException(msg)
      }

      if (parsed.type !== 'service_account') {
        const msg = `${credentialsVar} type must be 'service_account', got '${parsed.type}'`
        logger.error(`❌ ${msg}`)
        throw new InternalServerErrorException(msg)
      }

      if (parsed.project_id !== projectId) {
        const msg = `${credentialsVar} project_id (${parsed.project_id}) does not match FIREBASE_PROJECT_ID (${projectId})`
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
        const msg = `${credentialsVar} is not valid JSON. Paste the entire JSON content as a single line string.`
        logger.error(`❌ ${msg}`)
        throw new InternalServerErrorException(msg)
      }
      const msg = `Firebase initialization error: ${e.message}`
      logger.error(`❌ ${msg}`)
      throw new InternalServerErrorException(msg)
    }
  } else {
    // Fallback: Application Default Credentials (local dev con gcloud CLI,
    // o cuenta de servicio adjunta al servicio de Cloud Run).
    logger.warn('⚠️  No FIREBASE_CREDENTIALS / FIREBASE_SERVICE_ACCOUNT set. Using Application Default Credentials.')
    logger.warn('   For production, mount the service account JSON via Secret Manager (FIREBASE_CREDENTIALS).')

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
export function logSecurityConfig(config: ConfigService): void {
  logger.log('🔒 Security config:')
  logger.log(`   FIREBASE_PROJECT_ID: ${config.get<string>('FIREBASE_PROJECT_ID') ? '✅ Set' : '❌ Missing'}`)
  logger.log(`   FIREBASE_CREDENTIALS: ${resolveCredentialsJson(config) ? '✅ Set' : '⚠️  Not set (using ADC)'}`)
  logger.log(`   FIREBASE_API_KEY: ${config.get<string>('FIREBASE_API_KEY') ? '✅ Set' : '⚠️  Not set (Auth REST API will fail)'}`)
}

export const firestoreProvider: Provider = {
  provide: FIRESTORE,
  useFactory: (config: ConfigService) => {
    ensureApp(config)
    return getFirestore()
  },
  inject: [ConfigService],
}

export const firebaseAuthProvider: Provider = {
  provide: FIREBASE_AUTH,
  useFactory: (config: ConfigService) => {
    ensureApp(config)
    return getAuth()
  },
  inject: [ConfigService],
}
