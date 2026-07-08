import { Injectable, Inject } from '@nestjs/common'
import { Firestore, CollectionReference, Query } from 'firebase-admin/firestore'
import { randomUUID } from 'crypto'
import { FIRESTORE } from '../../database/firebase.provider'
import type {
  Job,
  JobApplication,
  JobFilters,
  CreateJobData,
  CreateJobApplicationData,
  IJobRepository,
} from '../interfaces/job.repository.interface'

@Injectable()
export class FirestoreJobRepository implements IJobRepository {
  private readonly jobsCol: CollectionReference
  private readonly appsCol: CollectionReference

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {
    this.jobsCol = this.db.collection('p_jobs')
    this.appsCol = this.db.collection('u_job_applications')
  }

  // ── Vacantes ──────────────────────────────────────────────────────────

  async findAll(filters: JobFilters = {}): Promise<Job[]> {
    let q: Query = this.jobsCol.where('is_active', '==', true)
    if (filters.modality) {
      q = q.where('modality', '==', filters.modality)
    }
    const snap = await q.orderBy('created_at', 'desc').get()
    let rows = snap.docs.map((d) => this.jobToDomain(d.id, d.data()))

    // Post-filtering por ciudad (Firestore no soporta LIKE)
    if (filters.city) {
      const term = filters.city.toLowerCase()
      rows = rows.filter((r) => r.city.toLowerCase().includes(term))
    }

    // Post-filtering por tipo de discapacidad
    if (filters.disability_type) {
      const dt = filters.disability_type.toLowerCase()
      rows = rows.filter((r) => r.disability_types.some((d) => d.toLowerCase() === dt))
    }

    return rows
  }

  async findById(id: string): Promise<Job | null> {
    const doc = await this.jobsCol.doc(id).get()
    if (!doc.exists) return null
    return this.jobToDomain(doc.id, doc.data()!)
  }

  async findByIds(ids: string[]): Promise<Job[]> {
    if (ids.length === 0) return []
    // Firestore `in` query limitado a 30 valores por lote
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += 30) {
      chunks.push(ids.slice(i, i + 30))
    }
    const results: Job[] = []
    for (const chunk of chunks) {
      const snap = await this.jobsCol.where('__name__', 'in', chunk).get()
      for (const doc of snap.docs) {
        results.push(this.jobToDomain(doc.id, doc.data()))
      }
    }
    return results
  }

  async create(data: CreateJobData): Promise<Job> {
    const id = randomUUID()
    const now = new Date().toISOString()
    await this.jobsCol.doc(id).set({
      id,
      institution_id: data.institution_id,
      title: data.title,
      description: data.description ?? '',
      requirements: data.requirements ?? '',
      modality: data.modality ?? 'presencial',
      schedule: data.schedule ?? '',
      salary_range: data.salary_range ?? '',
      city: data.city ?? '',
      state: data.state ?? '',
      disability_inclusive: data.disability_inclusive !== false,
      disability_types: JSON.stringify(data.disability_types ?? []),
      is_active: true,
      created_at: now,
    })
    return (await this.findById(id))!
  }

  async update(id: string, data: Partial<Job>): Promise<void> {
    const updateData: Record<string, any> = { ...data }
    if (Array.isArray(updateData.disability_types)) {
      updateData.disability_types = JSON.stringify(updateData.disability_types)
    }
    delete (updateData as any).id
    updateData.updated_at = new Date().toISOString()
    await this.jobsCol.doc(id).update(updateData)
  }

  async softDelete(id: string): Promise<void> {
    await this.jobsCol.doc(id).update({ is_active: false, updated_at: new Date().toISOString() })
  }

  async countActive(): Promise<number> {
    const snap = await this.jobsCol.where('is_active', '==', true).get()
    return snap.size
  }

  // ── Postulaciones ────────────────────────────────────────────────────

  async createApplication(data: CreateJobApplicationData): Promise<JobApplication> {
    const id = randomUUID()
    const now = new Date().toISOString()
    const app: JobApplication = {
      id,
      job_id: data.job_id,
      user_id: data.user_id,
      cover_letter: data.cover_letter,
      status: 'pending',
      created_at: now,
    }
    await this.appsCol.doc(id).set(app)
    return app
  }

  async findApplicationsByUser(userId: string): Promise<JobApplication[]> {
    const snap = await this.appsCol
      .where('user_id', '==', userId)
      .orderBy('created_at', 'desc')
      .get()
    return snap.docs.map((d) => this.appToDomain(d.id, d.data()))
  }

  async findApplicationByUserAndJob(
    userId: string,
    jobId: string,
  ): Promise<JobApplication | null> {
    const snap = await this.appsCol
      .where('user_id', '==', userId)
      .where('job_id', '==', jobId)
      .limit(1)
      .get()
    if (snap.empty) return null
    const doc = snap.docs[0]
    return this.appToDomain(doc.id, doc.data())
  }

  async getAppliedJobIds(userId: string): Promise<string[]> {
    const snap = await this.appsCol.where('user_id', '==', userId).get()
    return snap.docs.map((d) => d.data().job_id as string)
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private jobToDomain(id: string, data: FirebaseFirestore.DocumentData): Job {
    let types: string[] = []
    try {
      types = JSON.parse(data.disability_types ?? '[]')
      if (!Array.isArray(types)) types = []
    } catch {
      types = []
    }
    return {
      id,
      institution_id: data.institution_id ?? '',
      title: data.title ?? '',
      description: data.description ?? '',
      requirements: data.requirements ?? '',
      modality: data.modality ?? '',
      schedule: data.schedule ?? '',
      salary_range: data.salary_range ?? '',
      city: data.city ?? '',
      state: data.state ?? '',
      disability_inclusive: data.disability_inclusive ?? true,
      disability_types: types,
      is_active: data.is_active ?? false,
      created_at: data.created_at ?? '',
    }
  }

  private appToDomain(id: string, data: FirebaseFirestore.DocumentData): JobApplication {
    return {
      id,
      job_id: data.job_id ?? '',
      user_id: data.user_id ?? '',
      cover_letter: data.cover_letter ?? '',
      status: data.status ?? 'pending',
      created_at: data.created_at ?? '',
    }
  }
}
