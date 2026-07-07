import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { randomUUID } from 'crypto'

@Injectable()
export class JobsService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async findAll(filters: { city?: string; modality?: string; disability_types?: string } = {}) {
    let q = this.db.collection('p_jobs').where('is_active', '==', true)
    if (filters.modality) q = q.where('modality', '==', filters.modality)
    const snap = await q.orderBy('created_at', 'desc').get()
    let jobs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    // Enrich with institution data
    const instIds = [...new Set(jobs.map(j => j.institution_id))]
    const instMap = new Map<string, any>()
    for (const iid of instIds) {
      const doc = await this.db.collection('p_institutions').doc(iid).get()
      if (doc.exists) instMap.set(iid, { id: doc.id, ...doc.data() })
    }

    // Filter by city (post-query, LIKE pattern)
    if (filters.city) {
      const term = filters.city.toLowerCase()
      jobs = jobs.filter(j => (j.city ?? '').toLowerCase().includes(term))
    }

    return jobs.map(j => {
      const inst = instMap.get(j.institution_id) ?? {}
      return {
        ...j,
        disability_types: (() => { try { return JSON.parse(j.disability_types) } catch { return [] } })(),
        institution_name: inst.name ?? null,
        institution_city: inst.city ?? null,
        institution_verified: inst.is_verified ?? false,
      }
    }).filter(j => instMap.has(j.institution_id) && (instMap.get(j.institution_id).is_active ?? false))
  }

  async findOne(id: string) {
    const doc = await this.db.collection('p_jobs').doc(id).get()
    if (!doc.exists) throw new NotFoundException('Vacante no encontrada')
    const job = { id: doc.id, ...doc.data() } as any

    const instDoc = await this.db.collection('p_institutions').doc(job.institution_id).get()
    const inst = instDoc.data() ?? {}

    job.disability_types = (() => { try { return JSON.parse(job.disability_types) } catch { return [] } })()
    return {
      ...job,
      institution_name: inst.name ?? null,
      institution_city: inst.city ?? null,
      institution_description: inst.description ?? null,
      institution_phone: inst.phone ?? null,
      institution_email: inst.email ?? null,
      institution_website: inst.website ?? null,
      institution_verified: inst.is_verified ?? false,
    }
  }

  async apply(userId: string, jobId: string, coverLetter: string) {
    const jobDoc = await this.db.collection('p_jobs').doc(jobId).get()
    if (!jobDoc.exists || !jobDoc.data()?.is_active) throw new NotFoundException('Vacante no encontrada o inactiva')

    const existing = await this.db.collection('u_job_applications')
      .where('job_id', '==', jobId).where('user_id', '==', userId).limit(1).get()
    if (!existing.empty) throw new ConflictException('Ya enviaste una solicitud para esta vacante')

    const id = randomUUID()
    await this.db.collection('u_job_applications').doc(id).set({
      id, job_id: jobId, user_id: userId, cover_letter: coverLetter, status: 'pending',
      created_at: new Date().toISOString(),
    })
    return { id, status: 'pending', message: '¡Solicitud enviada con éxito!' }
  }

  async myApplications(userId: string) {
    const snap = await this.db.collection('u_job_applications')
      .where('user_id', '==', userId).orderBy('created_at', 'desc').get()
    const apps = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    const jobIds = [...new Set(apps.map(a => a.job_id))]
    const jobMap = new Map<string, any>()
    for (const jid of jobIds) {
      const doc = await this.db.collection('p_jobs').doc(jid).get()
      if (doc.exists) jobMap.set(jid, doc.data())
    }

    const instIds = [...new Set([...jobMap.values()].map(j => j?.institution_id).filter(Boolean))]
    const instMap = new Map<string, any>()
    for (const iid of instIds) {
      const doc = await this.db.collection('p_institutions').doc(iid).get()
      if (doc.exists) instMap.set(iid, doc.data())
    }

    return apps.map(a => {
      const job = jobMap.get(a.job_id) ?? {}
      const inst = instMap.get(job.institution_id) ?? {}
      return { ...a, title: job.title, modality: job.modality, institution_name: inst.name ?? null }
    })
  }

  async getAppliedJobIds(userId: string): Promise<string[]> {
    const snap = await this.db.collection('u_job_applications')
      .where('user_id', '==', userId).get()
    return snap.docs.map(d => d.data().job_id)
  }

  async createJob(institutionId: string, dto: any) {
    const id = randomUUID()
    await this.db.collection('p_jobs').doc(id).set({
      id, institution_id: institutionId, title: dto.title, description: dto.description ?? '',
      requirements: dto.requirements ?? '', modality: dto.modality ?? 'presencial',
      schedule: dto.schedule ?? '', salary_range: dto.salary_range ?? '',
      city: dto.city ?? '', state: dto.state ?? '',
      disability_inclusive: dto.disability_inclusive !== false,
      disability_types: JSON.stringify(dto.disability_types ?? []),
      is_active: true, created_at: new Date().toISOString(),
    })
    return this.findOne(id)
  }
}
