import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuid } from 'uuid'

const UPLOAD_DIR = path.join(process.cwd(), 'uploads')

@Injectable()
export class StorageService {
  private readonly logger = new Logger('StorageService')
  private readonly hasGCS = !!(process.env.GCS_KEY_FILE && process.env.GCS_BUCKET)

  constructor() {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  }

  async upload(file: Buffer, originalName: string, folder: string): Promise<string> {
    if (this.hasGCS) {
      // TODO: implementar con GCS en producción
    }
    const ext = originalName.split('.').pop() ?? 'bin'
    const filename = `${folder}/${uuid()}.${ext}`
    const fullPath = path.join(UPLOAD_DIR, filename)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, file)
    this.logger.log(`[MOCK STORAGE] Guardado: ${filename}`)
    return filename
  }

  async getSignedUrl(filePath: string): Promise<string> {
    if (this.hasGCS) {
      // TODO: implementar con GCS en producción
    }
    return `http://localhost:7000/uploads/${filePath}`
  }

  async delete(filePath: string): Promise<void> {
    const fullPath = path.join(UPLOAD_DIR, filePath)
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
  }
}
