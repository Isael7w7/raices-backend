/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Migración: cuentas 'empresa' → documento en 'instituciones' (Opción A)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Antes del cambio a la Opción A (subtipo en institución), el registro solo
 * creaba el documento en 'instituciones' para rol 'institucion'. Las cuentas
 * empresa registradas hasta entonces no tienen entidad, por lo que:
 *   - no pueden publicar vacantes (jobs exige entidad verificada),
 *   - no aparecen en el panel/administración de su propia entidad,
 *   - su nombre no se sincroniza al renombrarse, etc.
 *
 * Esta migración crea ese documento con la MISMA forma que
 * `AuthService.register` hoy (campo `tipo: 'empresa'`, `verificada: false`
 * para pasar por la cola de revisión del administrador) y vincula
 * `perfiles.institucionId`.
 *
 * Modo de uso:
 *   pnpm db:migrar-empresas              # migra
 *   pnpm db:migrar-empresas -- --dry-run # solo reporta, no escribe
 *   (o npx ts-node src/database/migrations/migrar-empresas.ts [--dry-run])
 *
 * Requisitos: FIREBASE_PROJECT_ID y FIREBASE_CREDENTIALS (o
 * FIREBASE_SERVICE_ACCOUNT) en .env.
 *
 * Garantías:
 *   - Idempotente: re-ejecutar no duplica ni sobrescribe nada.
 *   - No borra datos: solo crea el doc de institución y llena institucionId.
 *   - Resuelve la entidad como auth.me/getProfile: primero el canónico
 *     (id = UID) y, si no existe, uno legado por `creadoPor`.
 *
 * ⚠️ NOTA: las empresas que adjuntaron CSF en el registro antiguo perdieron
 *    su URL (solo se persistía dentro del documento de 'instituciones', que
 *    aún no existía para ellas). Esas cuentas deben re-enviar la CSF o ser
 *    verificadas manualmente desde el panel del administrador.
 */
import { Firestore } from 'firebase-admin/firestore'
import { COLECCIONES } from '../firestore.constants'

/** Campos del perfil que usa la migración (todos opcionales en datos reales). */
export interface PerfilEmpresa {
  nombreCompleto?: string
  email?: string
  ciudad?: string | null
  estado?: string | null
  telefonoContacto?: string | null
  fechaCreacion?: string | null
  institucionId?: string | null
}

export interface ResultadoMigracionEmpresas {
  dryRun: boolean
  /** Cuentas con rol 'empresa' encontradas en Firestore. */
  encontradas: number
  /** Documentos creados en 'instituciones' (planificados, en dry-run). */
  documentosCreados: number
  /** Perfiles que recibieron/actualizaron institucionId. */
  perfilesVinculados: number
  /** Cuentas que ya tenían documento y vínculo: no se tocó nada. */
  omitidas: number
  errores: { uid: string; error: string }[]
}

/**
 * Documento espejo del que `AuthService.register` crea para las empresas
 * nuevas, para que las entidades migradas y las nativas sean indistinguibles
 * para todos los consumidores (directorio, jobs, admin, validación IA…).
 */
export function construirDocumentoEmpresa(
  uid: string,
  perfil: PerfilEmpresa,
  fechaMigracion: string,
): Record<string, unknown> {
  return {
    id: uid,
    nombre: perfil.nombreCompleto ?? perfil.email ?? 'Empresa',
    tipo: 'empresa',
    emailContacto: perfil.email ?? null,
    ciudad: perfil.ciudad ?? null,
    estado: perfil.estado ?? null,
    // La categoría NO es obligatoria para empresas (solo para instituciones).
    categoria: null,
    descripcion: '',
    telefono: perfil.telefonoContacto ?? '',
    tiposDiscapacidad: [],
    activa: true,
    // Entra a la cola de verificación del administrador (revisión de CSF).
    verificada: false,
    calificacionPromedio: 0,
    cantidadCalificaciones: 0,
    creadoPor: uid,
    usuarioId: uid,
    // Se conserva la fecha real de la cuenta; la de migración es respaldo.
    fechaCreacion: perfil.fechaCreacion ?? fechaMigracion,
  }
}

/**
 * Crea el documento de 'instituciones' de cada cuenta empresa que no tenga
 * uno y le vincula `institucionId` al perfil. Idempotente y seguro de
 * re-ejecutar. Con `dryRun` solo calcula y reporta; no escribe.
 */
export async function migrarEmpresas(
  db: Firestore,
  opciones: { dryRun?: boolean } = {},
): Promise<ResultadoMigracionEmpresas> {
  const dryRun = opciones.dryRun ?? false
  const fechaMigracion = new Date().toISOString()
  const resultado: ResultadoMigracionEmpresas = {
    dryRun,
    encontradas: 0,
    documentosCreados: 0,
    perfilesVinculados: 0,
    omitidas: 0,
    errores: [],
  }

  const snap = await db.collection(COLECCIONES.perfiles).where('rol', '==', 'empresa').get()
  resultado.encontradas = snap.size

  for (const doc of snap.docs) {
    const uid = doc.id
    try {
      const perfil = doc.data() as PerfilEmpresa

      // 1) ¿Ya tiene entidad? Primero el canónico (id = UID) y, si no,
      //    un legado por creadoPor (mismo orden que auth.me/getProfile).
      const refCanonico = db.collection(COLECCIONES.instituciones).doc(uid)
      const snapCanonico = await refCanonico.get()

      let refEntidad = snapCanonico.exists ? refCanonico : null
      if (!refEntidad) {
        const porCreador = await db
          .collection(COLECCIONES.instituciones)
          .where('creadoPor', '==', uid)
          .limit(1)
          .get()
        if (!porCreador.empty) refEntidad = porCreador.docs[0].ref
      }

      const faltaDocumento = refEntidad === null
      const faltaVinculo = !perfil.institucionId

      // 2) Nada que hacer: ya estaba migrada.
      if (!faltaDocumento && !faltaVinculo) {
        resultado.omitidas++
        continue
      }

      if (dryRun) {
        if (faltaDocumento) resultado.documentosCreados++
        if (faltaVinculo) resultado.perfilesVinculados++
        continue
      }

      // 3) Escritura atómica: entidad nueva (si falta) + vínculo del perfil.
      const batch = db.batch()
      if (faltaDocumento) {
        batch.set(refCanonico, construirDocumentoEmpresa(uid, perfil, fechaMigracion))
      }
      if (faltaVinculo) {
        const entidadId = faltaDocumento ? uid : refEntidad!.id
        batch.update(db.collection(COLECCIONES.perfiles).doc(uid), { institucionId: entidadId })
      }
      await batch.commit()

      if (faltaDocumento) resultado.documentosCreados++
      if (faltaVinculo) resultado.perfilesVinculados++
    } catch (e: unknown) {
      // Una cuenta con error no detiene el resto; se reporta al final.
      resultado.errores.push({ uid, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return resultado
}

// ── CLI ───────────────────────────────────────────────────────────────────

async function main() {
  const dotenv = await import('dotenv')
  const { join } = await import('path')
  dotenv.config({ path: join(__dirname, '..', '..', '..', '.env') })

  const { initializeApp, getApps, cert } = await import('firebase-admin/app')
  const { getFirestore } = await import('firebase-admin/firestore')

  const projectId = process.env.FIREBASE_PROJECT_ID
  if (!projectId) {
    console.error('❌ FIREBASE_PROJECT_ID is required in .env')
    process.exit(1)
  }

  if (getApps().length === 0) {
    // FIREBASE_CREDENTIALS es el nombre canónico; FIREBASE_SERVICE_ACCOUNT queda como alias
    const serviceAccountJson = process.env.FIREBASE_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT
    if (serviceAccountJson) {
      initializeApp({ credential: cert(JSON.parse(serviceAccountJson)), projectId })
    } else {
      console.warn('⚠️  No FIREBASE_CREDENTIALS found. Using application default credentials.')
      initializeApp({ projectId })
    }
  }

  const dryRun = process.argv.includes('--dry-run')

  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║  🏢 Migración: cuentas empresa → instituciones          ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log('')
  console.log(`📋 Project: ${projectId}`)
  console.log(`🔍 Modo: ${dryRun ? 'SIMULACIÓN (--dry-run, no escribe)' : 'ESCRITURA'}`)
  console.log('')

  const resultado = await migrarEmpresas(getFirestore(), { dryRun })

  console.log(`🔎 Cuentas empresa encontradas: ${resultado.encontradas}`)
  console.log(`   🏗️  Documentos en 'instituciones' creados: ${resultado.documentosCreados}`)
  console.log(`   🔗 Perfiles con institucionId vinculado: ${resultado.perfilesVinculados}`)
  console.log(`   ⏭️  Omítidas (ya migradas): ${resultado.omitidas}`)

  if (resultado.errores.length > 0) {
    console.log('')
    console.log(`❌ Errores (${resultado.errores.length}):`)
    for (const err of resultado.errores) {
      console.log(`   - ${err.uid}: ${err.error}`)
    }
  }

  console.log('')
  if (dryRun) {
    console.log('✅ Dry-run completado: NO se escribió nada. Vuelve a ejecutar sin --dry-run para migrar.')
  } else if (resultado.errores.length === 0) {
    console.log('🎉 Migración completada. Las empresas nuevas están en la cola de verificación del admin.')
  } else {
    console.log('⚠️  Migración completada con errores (revisa arriba). El script es idempotente: puedes re-ejecutarlo.')
  }

  process.exit(resultado.errores.length > 0 ? 1 : 0)
}

if (require.main === module) {
  main().catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
}
