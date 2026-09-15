import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuid } from 'uuid'
import { getStorage } from 'firebase-admin/storage'
import { Bucket } from '@google-cloud/storage'

const UPLOAD_DIR = path.join(process.cwd(), 'uploads')

/** Maximum number of retry attempts for transient GCS operations */
const MAX_RETRIES = 3

/** Base delay in ms for exponential backoff */
const BASE_RETRY_DELAY_MS = 500

@Injectable()
export class StorageService {
  private readonly logger = new Logger('StorageService')
  private readonly bucketName: string | null
  private bucket: Bucket | null = null

  constructor(private readonly config: ConfigService) {
    // ── 1. Autodetect bucket name ──────────────────────────────
    // SECURITY: se lee de ConfigService; si no se define, se deriva del
    // proyecto (${FIREBASE_PROJECT_ID}.appspot.com) sin hardcodear proyectos.
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID')
    const defaultBucket = projectId ? `${projectId}.appspot.com` : undefined
    const rawBucketName =
      this.config.get<string>('FIREBASE_STORAGE_BUCKET') || defaultBucket || ''

    // Clean gs:// prefix and trailing slashes if present
    const cleanBucketName = rawBucketName
      .replace(/^gs:\/\//, '')
      .replace(/\/$/, '')

    this.bucketName = cleanBucketName

    // ── 2. Local upload dir fallback ───────────────────────────
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true })
    }

    // ── 3. Initialize bucket if we have a name ─────────────────
    if (this.bucketName) {
      try {
        this.bucket = getStorage().bucket(this.bucketName)
        this.logger.log(`✅ Firebase Storage bucket configurado: ${this.bucketName}`)
      } catch (err: unknown) {
        this.logger.error(
          `❌ Error al inicializar bucket "${this.bucketName}": ${err instanceof Error ? err.message : String(err)}`,
        )
        this.logger.warn('⚠️  Fallback: se usará almacenamiento local.')
        // Intentionally NOT resetting bucketName so delete
        // still knows which bucket was intended
      }
    } else {
      this.logger.warn(
        '⚠️  FIREBASE_STORAGE_BUCKET no configurado. Usando almacenamiento local.',
      )
      this.logger.warn(
        '   Para usar Cloud Storage, define la variable FIREBASE_STORAGE_BUCKET ' +
          '(ej: "${FIREBASE_PROJECT_ID}.appspot.com")',
      )
    }
  }

  // ─── Upload ──────────────────────────────────────────────────

  /**
   * Upload a file to Firebase Storage (or local fallback).
   * Implements automatic retries with exponential backoff for transient errors.
   */
  async upload(file: Buffer, originalName: string, folder: string): Promise<string> {
    if (this.bucket && this.bucketName) {
      return this.uploadToGCS(file, originalName, folder)
    }
    return this.uploadLocal(file, originalName, folder)
  }

  /**
   * Upload to GCS with retry logic and exponential backoff.
   */
  private async uploadToGCS(
    file: Buffer,
    originalName: string,
    folder: string,
  ): Promise<string> {
    const ext = originalName.split('.').pop() ?? 'bin'
    const filename = `${folder}/${uuid()}.${ext}`
    const contentType = this.getMimeType(ext)

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const gcsFile = this.bucket!.file(filename)
        const downloadToken = uuid()

        await gcsFile.save(file, {
          metadata: {
            contentType,
            metadata: {
              firebaseStorageDownloadTokens: downloadToken,
            },
          },
        })

        // Build public URL using download token (works with Uniform Bucket-Level Access)
        const encodedPath = encodeURIComponent(filename)
        const avatarUrl = `https://firebasestorage.googleapis.com/v0/b/${this.bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`

        this.logger.log(
          `[GCS] Archivo subido: ${filename} (${(file.length / 1024).toFixed(1)} KB, intento ${attempt})`,
        )
        return avatarUrl
      } catch (err: unknown) {
        const e = err as { code?: number | string; message?: string }
        lastError = err instanceof Error ? err : new Error(String(err))
        const isTransient =
          e.code === 503 ||
          e.code === 500 ||
          e.code === 429 ||
          e.message?.includes('socket hang up') ||
          e.message?.includes('ETIMEDOUT') ||
          e.message?.includes('ECONNRESET') ||
          e.message?.includes('equest failed')

        if (isTransient && attempt < MAX_RETRIES) {
          const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1)
          this.logger.warn(
            `[GCS] Intento ${attempt}/${MAX_RETRIES} falló (${e.message}). Reintentando en ${delay}ms...`,
          )
          await this.sleep(delay)
        } else {
          this.logger.error(
            `[GCS] Error definitivo al subir ${filename} tras ${attempt} intentos: ${e.message}`,
          )
          throw err
        }
      }
    }

    // Should never reach here, but TypeScript safety
    throw lastError ?? new Error('Upload to GCS failed unexpectedly')
  }

  /**
   * Upload locally (fallback when GCS is not configured).
   */
  private uploadLocal(file: Buffer, originalName: string, folder: string): string {
    const ext = originalName.split('.').pop() ?? 'bin'
    const filename = `${folder}/${uuid()}.${ext}`
    const fullPath = path.join(UPLOAD_DIR, filename)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, file)
    this.logger.log(`[LOCAL] Archivo guardado: ${filename} (${(file.length / 1024).toFixed(1)} KB)`)
    return `http://localhost:7000/uploads/${filename}`
  }

  // ─── Delete ──────────────────────────────────────────────────

  /**
   * Delete a file from storage. Attempts GCS first if configured,
   * and also cleans up local files if they exist.
   */
  async delete(filePath: string): Promise<void> {
    if (this.bucket && this.bucketName) {
      try {
        await this.bucket.file(filePath).delete()
        this.logger.log(`[GCS] Archivo eliminado: ${filePath}`)
        return
      } catch (e: unknown) {
        const err = e as { code?: number | string; message?: string }
        if (err.code === 404) {
          this.logger.warn(`[GCS] Archivo no encontrado (ya eliminado): ${filePath}`)
        } else {
          this.logger.error(
            `[GCS] Error al eliminar ${filePath}: ${err.message}. Código: ${err.code}`,
          )
        }
      }
    }

    // Clean up local copy if it exists
    const fullPath = path.join(UPLOAD_DIR, filePath)
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
      this.logger.log(`[LOCAL] Archivo eliminado: ${filePath}`)
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────

  /**
   * Map a file extension to its MIME type.
   */
  private getMimeType(ext: string): string {
    const mimes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
      heic: 'image/heic',
      heif: 'image/heif',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
      avi: 'video/x-msvideo',
      pdf: 'application/pdf',
      svg: 'image/svg+xml',
    }
    return mimes[ext.toLowerCase()] ?? 'application/octet-stream'
  }

  /**
   * Promise-based sleep for retry backoff.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
