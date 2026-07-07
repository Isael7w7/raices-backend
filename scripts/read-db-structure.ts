import * as dotenv from 'dotenv'
import { join } from 'path'

dotenv.config({ path: join(__dirname, '..', '.env') })

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, Firestore } from 'firebase-admin/firestore'

// ── Initialize Firebase Admin ─────────────────────────────────
const projectId = process.env.FIREBASE_PROJECT_ID
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT

if (!projectId) {
  console.error('❌ FIREBASE_PROJECT_ID is required in .env')
  process.exit(1)
}

if (getApps().length === 0) {
  if (serviceAccountJson) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)), projectId })
  } else {
    console.warn('⚠️  No FIREBASE_SERVICE_ACCOUNT found. Using application default credentials.')
    initializeApp({ projectId })
  }
}

const db: Firestore = getFirestore()

// ── Schema inference ──────────────────────────────────────────
interface FieldInfo {
  type: string
  nullable: boolean
  example?: unknown
  isArray: boolean
  arrayElementTypes?: string[]
}

function inferType(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') {
    // Detect ISO dates
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return 'timestamp (ISO string)'
    return 'string'
  }
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'float'
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value)) return 'array'
  if (value instanceof Object) return 'map (object)'
  return typeof value
}

function analyzeField(value: unknown, fieldName: string): FieldInfo {
  const nullable = value === null || value === undefined
  const type = inferType(value)
  const info: FieldInfo = { type, nullable, example: nullable ? null : value, isArray: type === 'array' }

  if (Array.isArray(value) && value.length > 0) {
    const elementTypes = new Set(value.map(inferType))
    info.arrayElementTypes = [...elementTypes]
    info.example = value.slice(0, 3) // Show first 3 elements
  }

  if (type === 'map (object)' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    info.example = Object.keys(value as Record<string, unknown>)
  }

  return info
}

// ── Main scanner ──────────────────────────────────────────────
async function scanCollection(name: string, sampleSize: number = 20) {
  const colRef = db.collection(name)
  const countSnap = await colRef.count().get()
  const totalDocs = countSnap.data().count

  // Get sample documents for schema inference
  const sampleSnap = await colRef.limit(sampleSize).get()
  const fieldMap = new Map<string, FieldInfo>()

  for (const doc of sampleSnap.docs) {
    const data = doc.data()
    for (const [key, value] of Object.entries(data)) {
      if (fieldMap.has(key)) {
        const existing = fieldMap.get(key)!
        // Update nullable if we find a non-null value where we previously saw null
        if (existing.nullable && value !== null && value !== undefined) {
          existing.nullable = false
        }
      } else {
        fieldMap.set(key, analyzeField(value, key))
      }
    }
  }

  return { name, totalDocs, sampleCount: sampleSnap.size, fields: fieldMap }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║        🔍 RAÍCES - Firestore Database Structure        ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log('')
  console.log(`📋 Project: ${projectId}`)
  console.log(`🔐 Mode: ${serviceAccountJson ? 'Service Account' : 'Application Default Credentials'}`)
  console.log('')

  // List all collections
  const collections = await db.listCollections()
  console.log(`📁 Collections found: ${collections.length}`)
  console.log('─'.repeat(60))

  const results: Array<{
    name: string
    totalDocs: number
    fields: Map<string, FieldInfo>
  }> = []

  for (const col of collections) {
    const info = await scanCollection(col.id)
    results.push(info)
  }

  // Sort by name for consistent output
  results.sort((a, b) => a.name.localeCompare(b.name))

  for (const result of results) {
    console.log('')
    console.log(`  📂 ${result.name}`)
    console.log(`     Documents: ${result.totalDocs}`)
    console.log('')

    const fieldEntries = [...result.fields.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    for (const [fieldName, info] of fieldEntries) {
      const nullable = info.nullable ? ' (nullable)' : ''
      const typeStr = info.isArray
        ? `array<${info.arrayElementTypes?.join(' | ') ?? 'unknown'}>`
        : info.type

      let exampleStr = ''
      if (info.example !== null && info.example !== undefined) {
        const ex = JSON.stringify(info.example)
        exampleStr = ex.length > 80 ? ex.substring(0, 77) + '...' : ex
      }

      console.log(`     ├─ ${fieldName}: ${typeStr}${nullable}`)
      if (exampleStr) {
        console.log(`     │  Example: ${exampleStr}`)
      }
    }

    console.log(`     └─`)
  }

  // Summary
  console.log('')
  console.log('═'.repeat(60))
  console.log('📊 SUMMARY')
  console.log('─'.repeat(60))
  const totalDocs = results.reduce((sum, r) => sum + r.totalDocs, 0)
  console.log(`   Collections: ${results.length}`)
  console.log(`   Total documents: ${totalDocs}`)
  console.log('')

  // Group by prefix
  const prefixes = new Map<string, string[]>()
  for (const r of results) {
    const prefix = r.name.split('_')[0] ?? 'other'
    if (!prefixes.has(prefix)) prefixes.set(prefix, [])
    prefixes.get(prefix)!.push(r.name)
  }

  console.log('   By prefix:')
  for (const [prefix, cols] of [...prefixes.entries()].sort()) {
    console.log(`     ${prefix}_*: ${cols.join(', ')}`)
  }

  console.log('')
  console.log('✅ Scan complete.')
}

main().catch((e) => {
  console.error('❌ Error scanning database:', e)
  process.exit(1)
})
