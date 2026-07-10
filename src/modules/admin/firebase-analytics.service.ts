import { Injectable, Inject, Logger } from '@nestjs/common'
import { Firestore, FieldValue } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'

/**
 * Servicio de analytics que escribe contadores directamente en Firestore
 * usando FieldValue.increment() para escrituras ciegas sin leer el documento.
 *
 * Esto minimiza costos: solo se cobra 1 escritura por increment/decrement
 * (sin transacciones, sin reads adicionales).
 */
@Injectable()
export class FirebaseAnalyticsService {
  private readonly logger = new Logger('FirebaseAnalyticsService')
  private readonly countersRef: FirebaseFirestore.DocumentReference

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {
    // Documento único que almacena todos los contadores
    this.countersRef = this.db.collection('_analytics').doc('counters')
  }

  /**
   * Incrementar un contador. Escritura ciega sin leer el documento.
   * Costo: 1 escritura Firestore.
   */
  async increment(key: string, amount: number = 1): Promise<void> {
    await this.countersRef.set(
      { [key]: FieldValue.increment(amount), updated_at: FieldValue.serverTimestamp() },
      { merge: true },
    )
  }

  /**
   * Decrementar un contador. Escritura ciega sin leer el documento.
   * Costo: 1 escritura Firestore.
   */
  async decrement(key: string, amount: number = 1): Promise<void> {
    await this.countersRef.set(
      { [key]: FieldValue.increment(-amount), updated_at: FieldValue.serverTimestamp() },
      { merge: true },
    )
  }

  /**
   * Leer todos los contadores. Costo: 1 lectura Firestore.
   */
  async getAll(): Promise<Record<string, number>> {
    const snap = await this.countersRef.get()
    if (!snap.exists) return {}
    const data = snap.data()!
    const result: Record<string, number> = {}
    for (const [k, v] of Object.entries(data)) {
      if (k !== 'updated_at' && typeof v === 'number') result[k] = v
    }
    return result
  }

  /**
   * Leer un contador específico. Costo: 1 lectura Firestore.
   */
  async get(key: string): Promise<number> {
    const snap = await this.countersRef.get()
    if (!snap.exists) return 0
    return snap.data()![key] ?? 0
  }
}
