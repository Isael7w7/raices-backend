import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'
import { KNEX_CONNECTION } from '../../database/knex.provider'

@Injectable()
export class UsersService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}

  async getProfile(userId: string) {
    const profile = await this.db('u_profiles').where({ id: userId }).first()
    if (!profile) throw new NotFoundException('User not found')
    const profiling = await this.db('u_user_profiles').where({ user_id: userId }).first()
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
    const { full_name, city, state, avatar_url } = data
    await this.db('u_profiles').where({ id: userId }).update({ full_name, city, state, avatar_url })
    return this.getProfile(userId)
  }

  async saveProfilingData(userId: string, data: any) {
    const exists = await this.db('u_user_profiles').where({ user_id: userId }).first()
    const payload = {
      disability_types: JSON.stringify(data.disability_types ?? []),
      disability_severity: data.disability_severity ?? null,
      communication_modes: JSON.stringify(data.communication_modes ?? []),
      mobility_needs: JSON.stringify(data.mobility_needs ?? []),
      tech_access: JSON.stringify(data.tech_access ?? []),
      preferred_zones: JSON.stringify(data.preferred_zones ?? []),
    }
    if (exists) {
      await this.db('u_user_profiles').where({ user_id: userId }).update(payload)
    } else {
      await this.db('u_user_profiles').insert({ id: uuid(), user_id: userId, ...payload })
    }
    return { ok: true }
  }

  async getDependents(userId: string) {
    const rows = await this.db('u_dependents').where({ guardian_id: userId }).orderBy('created_at', 'asc')
    return rows.map((d: any) => this.shapeDependent(d))
  }

  async addDependent(userId: string, data: any) {
    const id = uuid()
    await this.db('u_dependents').insert({
      id,
      guardian_id: userId,
      full_name: data.full_name ?? 'Sin nombre',
      relationship: data.relationship ?? 'familiar',
      profile_data: JSON.stringify({
        disability_types: data.disability_types ?? [],
        age_range: data.age_range ?? null,
        life_stage: data.life_stage ?? null,
        notes: data.notes ?? '',
      }),
    })
    const row = await this.db('u_dependents').where({ id }).first()
    return this.shapeDependent(row)
  }

  async updateDependent(userId: string, id: string, data: any) {
    const existing = await this.db('u_dependents').where({ id, guardian_id: userId }).first()
    if (!existing) throw new NotFoundException('Dependiente no encontrado')
    const prevProfile = this.parseObj(existing.profile_data)
    await this.db('u_dependents').where({ id }).update({
      full_name: data.full_name ?? existing.full_name,
      relationship: data.relationship ?? existing.relationship,
      profile_data: JSON.stringify({
        disability_types: data.disability_types ?? prevProfile.disability_types ?? [],
        age_range: data.age_range ?? prevProfile.age_range ?? null,
        life_stage: data.life_stage ?? prevProfile.life_stage ?? null,
        notes: data.notes ?? prevProfile.notes ?? '',
      }),
      updated_at: this.db.fn.now(),
    })
    const row = await this.db('u_dependents').where({ id }).first()
    return this.shapeDependent(row)
  }

  async deleteDependent(userId: string, id: string) {
    const existing = await this.db('u_dependents').where({ id, guardian_id: userId }).first()
    if (!existing) throw new NotFoundException('Dependiente no encontrado')
    await this.db('u_dependents').where({ id }).delete()
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
