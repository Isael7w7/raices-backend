import { Injectable, Inject, Logger } from '@nestjs/common'
import { Firestore, FieldValue } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'

@Injectable()
export class FirebaseAnalyticsService {
  private readonly logger = new Logger('FirebaseAnalyticsService')
  private readonly refContadores: FirebaseFirestore.DocumentReference

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {
    this.refContadores = this.db.collection(COLECCIONES.analiticas).doc('contadores')
  }

  async incrementar(clave: string, cantidad: number = 1): Promise<void> {
    await this.refContadores.set(
      { [clave]: FieldValue.increment(cantidad), fechaActualizacion: FieldValue.serverTimestamp() },
      { merge: true },
    )
  }

  async decrementar(clave: string, cantidad: number = 1): Promise<void> {
    await this.refContadores.set(
      { [clave]: FieldValue.increment(-cantidad), fechaActualizacion: FieldValue.serverTimestamp() },
      { merge: true },
    )
  }

  async obtenerTodas(): Promise<Record<string, number>> {
    const snap = await this.refContadores.get()
    if (!snap.exists) return {}
    const data = snap.data()!
    const resultado: Record<string, number> = {}
    for (const [k, v] of Object.entries(data)) {
      if (k !== 'fechaActualizacion' && typeof v === 'number') resultado[k] = v
    }
    return resultado
  }

  async obtener(clave: string): Promise<number> {
    const snap = await this.refContadores.get()
    if (!snap.exists) return 0
    return snap.data()![clave] ?? 0
  }
}
