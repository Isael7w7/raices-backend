import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { v4 as uuid } from 'uuid'
import { FIRESTORE } from '../../database/firebase.provider'

@Injectable()
export class UsersService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private col(name: string) { return this.db.collection(name) }

  async getProfile(userId: string) {
    const doc = await this.col('u_profiles').doc(userId).get()
    if (!doc.exists) throw new NotFoundException('User not found')
    const profile = { id: doc.id, ...doc.data()! }

    const profilingSnap = await this.col('u_user_profiles')
      .where('user_id', '==', userId).limit(1).get()
    const profiling = profilingSnap.empty ? null : profilingSnap.docs[0].data()

    return {
      ...profile,
      profiling: profiling ? {
        ...profiling,
        disability_types: this.parseJson(profiling.disability_types),
        communication_modes: this.parseJson(profiling.communication_modes),
        mobility_needs: this.parseJson(profiling.mobility_needs),
        tech_access: this.parseJson(profiling.tech_access),
        preferred_zones: this.parseJson(profiling.preferred_zones),
      } : null,
    }
  }

  async updateProfile(userId: string, data: any) {
    const safeData = data ?? {}
    const updatableFields = ['full_name', 'city', 'state', 'avatar_url']
    const payload: Record<string, any> = {}
    for (const field of updatableFields) {
      if (safeData[field] !== undefined) {
        payload[field] = safeData[field]
      }
    }
    if (Object.keys(payload).length === 0) {
      return this.getProfile(userId)
    }
    await this.col('u_profiles').doc(userId).update(payload)
    return this.getProfile(userId)
  }

  async saveProfilingData(userId: string, data: any) {
    const exists = await this.col('u_user_profiles')
      .where('user_id', '==', userId).limit(1).get()
    const payload: Record<string, any> = {
      disability_types: JSON.stringify(data.disability_types ?? []),
      disability_severity: data.disability_severity ?? null,
      communication_modes: JSON.stringify(data.communication_modes ?? []),
      mobility_needs: JSON.stringify(data.mobility_needs ?? []),
      tech_access: JSON.stringify(data.tech_access ?? []),
      preferred_zones: JSON.stringify(data.preferred_zones ?? []),
    }
    if (!exists.empty) {
      await this.col('u_user_profiles').doc(exists.docs[0].id).update(payload)
    } else {
      const id = uuid()
      await this.col('u_user_profiles').doc(id).set({ id, user_id: userId, ...payload })
    }
    return { ok: true }
  }

  async getDependents(userId: string) {
    const snap = await this.col('u_dependents')
      .where('guardian_id', '==', userId).orderBy('created_at', 'asc').get()
    return snap.docs.map(d => this.shapeDependent({ id: d.id, ...d.data() }))
  }

  async addDependent(userId: string, data: any) {
    const id = uuid()
    await this.col('u_dependents').doc(id).set({
      id, guardian_id: userId,
      full_name: data.full_name ?? 'Sin nombre',
      relationship: data.relationship ?? 'familiar',
      profile_data: JSON.stringify({
        disability_types: data.disability_types ?? [],
        age_range: data.age_range ?? null,
        life_stage: data.life_stage ?? null,
        notes: data.notes ?? '',
      }),
      created_at: new Date().toISOString(),
    })
    const row = await this.col('u_dependents').doc(id).get()
    return this.shapeDependent({ id: row.id, ...row.data()! })
  }

  async updateDependent(userId: string, id: string, data: any) {
    const existing = await this.col('u_dependents').doc(id).get()
    if (!existing.exists || existing.data()?.guardian_id !== userId) throw new NotFoundException('Dependiente no encontrado')
    const prevProfile = this.parseObj(existing.data()?.profile_data)
    await this.col('u_dependents').doc(id).update({
      full_name: data.full_name ?? existing.data()?.full_name,
      relationship: data.relationship ?? existing.data()?.relationship,
      profile_data: JSON.stringify({
        disability_types: data.disability_types ?? prevProfile.disability_types ?? [],
        age_range: data.age_range ?? prevProfile.age_range ?? null,
        life_stage: data.life_stage ?? prevProfile.life_stage ?? null,
        notes: data.notes ?? prevProfile.notes ?? '',
      }),
      updated_at: new Date().toISOString(),
    })
    const row = await this.col('u_dependents').doc(id).get()
    return this.shapeDependent({ id: row.id, ...row.data()! })
  }

  async deleteDependent(userId: string, id: string) {
    const existing = await this.col('u_dependents').doc(id).get()
    if (!existing.exists || existing.data()?.guardian_id !== userId) throw new NotFoundException('Dependiente no encontrado')
    await this.col('u_dependents').doc(id).delete()
    return { ok: true }
  }

  private shapeDependent(d: any) {
    if (!d) return d
    const p = this.parseObj(d.profile_data)
    return {
      id: d.id,
      full_name: d.full_name,
      relationship: d.relationship,
      disability_types: Array.isArray(p.disability_types) ? p.disability_types : [],
      age_range: p.age_range ?? null,
      life_stage: p.life_stage ?? null,
      notes: p.notes ?? '',
      created_at: d.created_at,
    }
  }

  private parseJson(val: any) {
    if (!val) return []
    try { return JSON.parse(val) } catch { return [] }
  }

  private parseObj(val: any) {
    if (!val) return {}
    try { const p = JSON.parse(val); return p && typeof p === 'object' ? p : {} } catch { return {} }
  }
}
