import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common'
import { Knex } from 'knex'
import { KNEX_CONNECTION } from '../../database/knex.provider'
import { randomUUID } from 'crypto'

@Injectable()
export class JobsService {
  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {}

  async findAll(filters: { city?: string; modality?: string; disability_types?: string } = {}) {
    let q = this.db('p_jobs')
      .join('p_institutions', 'p_jobs.institution_id', 'p_institutions.id')
      .where('p_jobs.is_active', true)
      .where('p_institutions.is_active', true)
      .select(
        'p_jobs.*',
        'p_institutions.name as institution_name',
        'p_institutions.city as institution_city',
        'p_institutions.is_verified as institution_verified',
      )
      .orderBy('p_jobs.created_at', 'desc')

    if (filters.city) q = q.whereILike('p_jobs.city', `%${filters.city}%`)
    if (filters.modality) q = q.where('p_jobs.modality', filters.modality)

    const jobs = await q
    return jobs.map(j => ({
      ...j,
      disability_types: (() => { try { return JSON.parse(j.disability_types) } catch { return [] } })(),
    }))
  }

  async findOne(id: string) {
    const job = await this.db('p_jobs')
      .join('p_institutions', 'p_jobs.institution_id', 'p_institutions.id')
      .where('p_jobs.id', id)
      .select(
        'p_jobs.*',
        'p_institutions.name as institution_name',
        'p_institutions.city as institution_city',
        'p_institutions.description as institution_description',
        'p_institutions.phone as institution_phone',
        'p_institutions.email as institution_email',
        'p_institutions.website as institution_website',
        'p_institutions.is_verified as institution_verified',
      )
      .first()

    if (!job) throw new NotFoundException('Vacante no encontrada')
    job.disability_types = (() => { try { return JSON.parse(job.disability_types) } catch { return [] } })()
    return job
  }

  async apply(userId: string, jobId: string, coverLetter: string) {
    const job = await this.db('p_jobs').where({ id: jobId, is_active: true }).first()
    if (!job) throw new NotFoundException('Vacante no encontrada o inactiva')

    const existing = await this.db('u_job_applications').where({ job_id: jobId, user_id: userId }).first()
    if (existing) throw new ConflictException('Ya enviaste una solicitud para esta vacante')

    const id = randomUUID()
    await this.db('u_job_applications').insert({ id, job_id: jobId, user_id: userId, cover_letter: coverLetter, status: 'pending' })
    return { id, status: 'pending', message: '¡Solicitud enviada con éxito!' }
  }

  async myApplications(userId: string) {
    return this.db('u_job_applications')
      .join('p_jobs', 'u_job_applications.job_id', 'p_jobs.id')
      .join('p_institutions', 'p_jobs.institution_id', 'p_institutions.id')
      .where('u_job_applications.user_id', userId)
      .select(
        'u_job_applications.*',
        'p_jobs.title',
        'p_jobs.modality',
        'p_institutions.name as institution_name',
      )
      .orderBy('u_job_applications.created_at', 'desc')
  }

  async getAppliedJobIds(userId: string) {
    const rows = await this.db('u_job_applications').where({ user_id: userId }).select('job_id')
    return rows.map(r => r.job_id)
  }

  async createJob(institutionId: string, dto: any) {
    const id = randomUUID()
    await this.db('p_jobs').insert({
      id,
      institution_id: institutionId,
      title: dto.title,
      description: dto.description ?? '',
      requirements: dto.requirements ?? '',
      modality: dto.modality ?? 'presencial',
      schedule: dto.schedule ?? '',
      salary_range: dto.salary_range ?? '',
      city: dto.city ?? '',
      state: dto.state ?? '',
      disability_inclusive: dto.disability_inclusive !== false,
      disability_types: JSON.stringify(dto.disability_types ?? []),
      is_active: true,
    })
    return this.findOne(id)
  }
}
