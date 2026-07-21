import { Injectable, Inject } from '@nestjs/common'
import { Firestore, CollectionReference } from 'firebase-admin/firestore'
import { randomUUID } from 'crypto'
import { FIRESTORE } from '../../database/firebase.provider'
import type {
  UserProfile,
  UserProfiling,
  CreateUserProfileData,
  UpdateUserProfileData,
  UpsertProfilingData,
  IProfileRepository,
} from '../interfaces/profile.repository.interface'

@Injectable()
export class FirestoreProfileRepository implements IProfileRepository {
  private readonly profilesCol: CollectionReference
  private readonly profilingCol: CollectionReference

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {
    this.profilesCol = this.db.collection('u_profiles')
    this.profilingCol = this.db.collection('u_user_profiles')
  }

  // ── Perfiles de usuario (u_profiles) ──────────────────────────────────

  async findById(id: string): Promise<UserProfile | null> {
    const doc = await this.profilesCol.doc(id).get()
    if (!doc.exists) return null
    return this.profileToDomain(doc.id, doc.data()!)
  }

  async findByEmail(email: string): Promise<UserProfile | null> {
    const snap = await this.profilesCol.where('email', '==', email).limit(1).get()
    if (snap.empty) return null
    const doc = snap.docs[0]
    return this.profileToDomain(doc.id, doc.data())
  }

  async create(data: CreateUserProfileData): Promise<UserProfile> {
    const now = new Date().toISOString()
    await this.profilesCol.doc(data.id).set({
      id: data.id,
      email: data.email,
      full_name: data.full_name,
      role: data.role,
      city: data.city ?? null,
      state: data.state ?? null,
      avatar_url: null,
      is_active: true,
      is_verified: false,
      created_at: now,
    })
    return (await this.findById(data.id))!
  }

  async update(id: string, data: UpdateUserProfileData): Promise<void> {
    const updateData: Record<string, any> = { ...data, updated_at: new Date().toISOString() }
    await this.profilesCol.doc(id).update(updateData)
  }

  async updateFields(id: string, fields: Record<string, any>): Promise<void> {
    fields.updated_at = new Date().toISOString()
    await this.profilesCol.doc(id).update(fields)
  }

  async softDelete(id: string): Promise<void> {
    await this.profilesCol.doc(id).update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
  }

  async existsByEmail(email: string): Promise<boolean> {
    const snap = await this.profilesCol.where('email', '==', email).limit(1).get()
    return !snap.empty
  }

  async findAll(orderByField = 'created_at'): Promise<UserProfile[]> {
    const snap = await this.profilesCol.orderBy(orderByField, 'desc').get()
    return snap.docs.map((d) => this.profileToDomain(d.id, d.data()))
  }

  async countActive(): Promise<number> {
    const snap = await this.profilesCol.where('is_active', '==', true).get()
    return snap.size
  }

  async countAll(): Promise<number> {
    const snap = await this.profilesCol.get()
    return snap.size
  }

  async findByRole(role: string): Promise<UserProfile[]> {
    const snap = await this.profilesCol.where('role', '==', role).get()
    return snap.docs.map((d) => this.profileToDomain(d.id, d.data()))
  }

  // ── Perfiles extendidos de necesidades (u_user_profiles) ──────────

  async findProfilingByUserId(userId: string): Promise<UserProfiling | null> {
    const snap = await this.profilingCol
      .where('user_id', '==', userId)
      .limit(1)
      .get()
    if (snap.empty) return null
    return this.profilingToDomain(snap.docs[0].id, snap.docs[0].data())
  }

  async upsertProfiling(
    userId: string,
    data: UpsertProfilingData,
  ): Promise<UserProfiling> {
    const existing = await this.findProfilingByUserId(userId)

    const payload: Record<string, any> = {
      disability_types: this.serialize(data.disability_types),
      disability_severity: data.disability_severity ?? null,
      communication_modes: this.serialize(data.communication_modes),
      mobility_needs: this.serialize(data.mobility_needs),
      tech_access: this.serialize(data.tech_access),
      preferred_zones: this.serialize(data.preferred_zones),
      needs: this.serialize(data.needs),
      current_goals: this.serialize(data.current_goals),
      support_areas: this.serialize(data.support_areas),
      education_history: this.serialize(data.education_history),
      therapy_history: this.serialize(data.therapy_history),
      life_stage: data.life_stage ?? null,
      current_concerns: data.current_concerns ?? null,
      support_level: data.support_level ?? null,
    }

    if (existing) {
      await this.profilingCol.doc(existing.id).update(payload)
      return (await this.findProfilingByUserId(userId))!
    }

    const id = randomUUID()
    await this.profilingCol.doc(id).set({
      id,
      user_id: userId,
      ...payload,
    })
    return (await this.findProfilingByUserId(userId))!
  }

  async countProfiling(): Promise<number> {
    const snap = await this.profilingCol.get()
    return snap.size
  }

  async findAllProfiling(): Promise<UserProfiling[]> {
    const snap = await this.profilingCol.get()
    return snap.docs.map((d) => this.profilingToDomain(d.id, d.data()))
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private profileToDomain(
    id: string,
    data: FirebaseFirestore.DocumentData,
  ): UserProfile {
    return {
      id,
      email: data.email ?? '',
      full_name: data.full_name ?? '',
      role: data.role ?? '',
      city: data.city ?? '',
      state: data.state ?? '',
      avatar_url: data.avatar_url ?? null,
      is_active: data.is_active ?? false,
      is_verified: data.is_verified ?? false,
      created_at: data.created_at ?? '',
    }
  }

  private profilingToDomain(
    id: string,
    data: FirebaseFirestore.DocumentData,
  ): UserProfiling {
    return {
      id,
      user_id: data.user_id ?? '',
      disability_types: this.parseArr(data.disability_types),
      disability_severity: data.disability_severity ?? null,
      communication_modes: this.parseArr(data.communication_modes),
      mobility_needs: this.parseArr(data.mobility_needs),
      tech_access: this.parseArr(data.tech_access),
      preferred_zones: this.parseArr(data.preferred_zones),
      needs: this.parseArr(data.needs),
      current_goals: this.parseArr(data.current_goals),
      support_areas: this.parseArr(data.support_areas),
      education_history: this.parseArr(data.education_history),
      therapy_history: this.parseArr(data.therapy_history),
      life_stage: data.life_stage ?? null,
      current_concerns: data.current_concerns ?? null,
      support_level: data.support_level ?? null,
    }
  }

  /** Parsea un JSON string a string[]; devuelve [] si falla */
  private parseArr(val: any): string[] {
    if (!val) return []
    try {
      const p = JSON.parse(val)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }

  /** Serializa un array a JSON string; devuelve '[]' si es undefined */
  private serialize(arr: any[] | undefined): string {
    return JSON.stringify(arr ?? [])
  }
}
