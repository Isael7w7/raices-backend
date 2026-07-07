import { Injectable, Inject } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'

@Injectable()
export class TenantService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}
  collection(name: string) { return this.db.collection(name) }
}
