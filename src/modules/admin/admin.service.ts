import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { NotificationsService } from '../notifications/notifications.service'
import { EmailService } from '../email/email.service'

const DISABILITY_LABELS: Record<string, string> = {
  tea: 'TEA / Autismo', motriz: 'Motriz', intelectual: 'Intelectual',
  visual: 'Visual', auditiva: 'Auditiva', multiple: 'Múltiple', psicosocial: 'Psicosocial',
}

const CATEGORY_LABELS: Record<string, string> = {
  funcional: 'Salud y terapias', educativo: 'Educación',
  laboral: 'Empleo', social: 'Comunidad y social',
}

const DEFAULT_SETTINGS: Record<string, string> = {
  platform_name: 'Raíces para Florecer', support_email: 'soporte@raices.mx',
  allow_registration: 'true', require_institution_approval: 'true',
  ai_enabled: 'true', maintenance_mode: 'false',
  max_reviews_per_user: '10', default_city: 'Mérida',
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

  private col(name: string) { return this.db.collection(name) }

  /* ───────────────────────── Stats & analytics ───────────────────────── */

  async getStats() {
    const [users, activeUsers, institutions, verified, pending, reviews, posts, groups, profilesCompleted] = await Promise.all([
      this.col('u_profiles').get(),
      this.col('u_profiles').where('is_active', '==', true).get(),
      this.col('p_institutions').get(),
      this.col('p_institutions').where('is_verified', '==', true).get(),
      this.col('p_institutions').where('is_active', '==', false).get(),
      this.col('u_reviews').get(),
      this.col('u_posts').get(),
      this.col('u_groups').get(),
      this.col('u_user_profiles').get(),
    ])

    const avgRating = reviews.empty ? null : (() => {
      const sum = reviews.docs.reduce((s, d) => s + (d.data().rating ?? 0), 0)
      return parseFloat((sum / reviews.size).toFixed(2))
    })()

    return {
      total_users: users.size,
      active_users: activeUsers.size,
      total_institutions: institutions.size,
      verified_institutions: verified.size,
      pending_approval: pending.size,
      total_reviews: reviews.size,
      total_posts: posts.size,
      total_groups: groups.size,
      avg_rating: avgRating,
      profiles_completed: profilesCompleted.size,
    }
  }

  async getAnalytics() {
    const [usersSnap, institutionsSnap, reviewsSnap, postsSnap] = await Promise.all([
      this.col('u_profiles').get(),
      this.col('p_institutions').where('is_active', '==', true).get(),
      this.col('u_reviews').get(),
      this.col('u_posts').get(),
    ])

    const users = usersSnap.docs.map(d => d.data())
    const institutions = institutionsSnap.docs.map(d => d.data())
    const reviews = reviewsSnap.docs.map(d => d.data())
    const posts = postsSnap.docs.map(d => d.data())

    // Registros por mes (últimos 6)
    const regByMonth: Record<string, number> = {}
    for (const u of users) {
      const m = (u.created_at ?? '').substring(0, 7)
      if (m) regByMonth[m] = (regByMonth[m] ?? 0) + 1
    }
    const regs = Object.entries(regByMonth).sort((a, b) => a[0].localeCompare(b[0])).slice(-6)
      .map(([month, count]) => ({ month, count }))

    // Distribución de roles
    const roleMap: Record<string, number> = {}
    for (const u of users) { const r = u.role ?? 'unknown'; roleMap[r] = (roleMap[r] ?? 0) + 1 }
    const roles = Object.entries(roleMap).map(([role, count]) => ({ role, count }))

    // Instituciones por categoría
    const catMap: Record<string, number> = {}
    for (const i of institutions) { const c = i.category ?? 'unknown'; catMap[c] = (catMap[c] ?? 0) + 1 }
    const categories = Object.entries(catMap).map(([category, count]) => ({
      category, label: CATEGORY_LABELS[category] ?? category, count,
    }))

    // Distribución de calificaciones
    const ratingMap: Record<number, number> = {}
    for (const r of reviews) { const rt = r.rating ?? 0; ratingMap[rt] = (ratingMap[rt] ?? 0) + 1 }
    const ratings = Object.entries(ratingMap).map(([rating, count]) => ({ rating: Number(rating), count }))

    // Top instituciones por rating
    const topInstitutions = institutions
      .filter(i => i.is_verified)
      .sort((a: any, b: any) => (b.rating_avg ?? 0) - (a.rating_avg ?? 0) || (b.rating_count ?? 0) - (a.rating_count ?? 0))
      .slice(0, 5)
      .map(i => ({ id: i.id, name: i.name, category: i.category, rating_avg: i.rating_avg, rating_count: i.rating_count, is_verified: i.is_verified }))

    // Actividad comunitaria por mes
    const postByMonth: Record<string, number> = {}
    for (const p of posts) { const m = (p.created_at ?? '').substring(0, 7); if (m) postByMonth[m] = (postByMonth[m] ?? 0) + 1 }
    const postActivity = Object.entries(postByMonth).sort((a, b) => a[0].localeCompare(b[0])).slice(-6)
      .map(([month, count]) => ({ month, count }))

    // Distribución geográfica
    const cityMap: Record<string, number> = {}
    for (const i of institutions) { const c = i.city ?? 'Sin ciudad'; cityMap[c] = (cityMap[c] ?? 0) + 1 }
    const cities = Object.entries(cityMap).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([city, count]) => ({ city, count }))

    return {
      registrations_by_month: regs,
      role_distribution: roles,
      institutions_by_category: categories,
      rating_distribution: ratings,
      top_institutions: topInstitutions,
      post_activity: postActivity,
      institutions_by_city: cities,
    }
  }

  /* ─────────────────── Inteligencia de necesidades ─────────────────── */

  async getNeedsIntelligence() {
    const [profilesSnap, institutionsSnap] = await Promise.all([
      this.col('u_user_profiles').get(),
      this.col('p_institutions').where('is_active', '==', true).get(),
    ])
    const profiles = profilesSnap.docs.map(d => d.data())
    const institutions = institutionsSnap.docs.map(d => d.data())

    const parse = (v: any): any[] => {
      if (!v) return []
      try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] }
    }

    const demandByDisability: Record<string, number> = {}
    const needsCount: Record<string, number> = {}
    const goalsCount: Record<string, number> = {}
    const stagesCount: Record<string, number> = {}
    const supportAreas: Record<string, number> = {}

    for (const p of profiles) {
      for (const d of parse(p.disability_types)) demandByDisability[d] = (demandByDisability[d] ?? 0) + 1
      for (const n of parse(p.needs)) needsCount[n] = (needsCount[n] ?? 0) + 1
      for (const g of parse(p.current_goals)) goalsCount[g] = (goalsCount[g] ?? 0) + 1
      for (const s of parse(p.support_areas)) supportAreas[s] = (supportAreas[s] ?? 0) + 1
      if (p.life_stage) stagesCount[p.life_stage] = (stagesCount[p.life_stage] ?? 0) + 1
    }

    const supplyByDisability: Record<string, number> = {}
    for (const inst of institutions) {
      for (const d of parse(inst.disability_types)) supplyByDisability[d] = (supplyByDisability[d] ?? 0) + 1
    }

    const allTypes = new Set([...Object.keys(demandByDisability), ...Object.keys(supplyByDisability)])
    const coverage = [...allTypes].map((type) => {
      const demand = demandByDisability[type] ?? 0
      const supply = supplyByDisability[type] ?? 0
      const ratio = demand > 0 ? supply / demand : supply > 0 ? Infinity : 0
      let status: string
      if (demand === 0) status = 'sin_demanda'
      else if (ratio >= 3) status = 'adecuada'
      else if (ratio >= 1) status = 'media'
      else status = 'critica'
      return { type, label: DISABILITY_LABELS[type] ?? type, demand, supply, ratio: ratio === Infinity ? null : Number(ratio.toFixed(2)), status }
    }).sort((a, b) => b.demand - a.demand)

    const insights: { type: string; severity: string; text: string }[] = []
    const totalProfiles = profiles.length

    const critical = coverage.filter((c) => c.status === 'critica')
    for (const c of critical) {
      insights.push({ type: 'brecha_cobertura', severity: 'alta',
        text: `Cobertura crítica en ${c.label}: ${c.demand} usuario(s) con esta necesidad pero solo ${c.supply} institución(es) activa(s).` })
    }

    const best = coverage.filter((c) => c.status === 'adecuada' && c.demand > 0)
    if (best.length > 0) {
      insights.push({ type: 'fortaleza', severity: 'info',
        text: `Mayor fortaleza: ${best.map((b) => b.label).join(', ')}.` })
    }

    const topNeed = Object.entries(needsCount).sort((a, b) => b[1] - a[1])[0]
    if (topNeed) {
      insights.push({ type: 'demanda_principal', severity: 'media',
        text: `Necesidad más reportada: "${topNeed[0]}" (${topNeed[1]} de ${totalProfiles}).` })
    }

    const topStage = Object.entries(stagesCount).sort((a, b) => b[1] - a[1])[0]
    if (topStage) {
      const ranges: Record<string, [number, number]> = {
        infancia: [0, 12], adolescencia: [13, 17], adulto_joven: [18, 29], adulto: [30, 59], mayor: [60, 99],
      }
      const r = ranges[topStage[0]]
      const instInStage = institutions.filter((i) => !r || ((i.age_max ?? 99) >= r[0] && (i.age_min ?? 0) <= r[1])).length
      insights.push({ type: 'etapa_vida', severity: 'info',
        text: `Etapa predominante: ${topStage[0]} (${topStage[1]} usuarios). ${instInStage} de ${institutions.length} instituciones atienden ese rango.` })
    }

    // Users without profile
    const allUsersSnap = await this.col('u_profiles').where('role', '==', 'pcd').get()
    const profileUserIds = new Set(profiles.map(p => p.user_id))
    const missing = allUsersSnap.docs.filter(d => !profileUserIds.has(d.id)).length
    if (missing > 0) {
      insights.push({ type: 'datos_incompletos', severity: 'media',
        text: `${missing} usuario(s) con rol PCD sin perfil de necesidades.` })
    }

    const unverified = institutions.filter(i => !i.is_verified).length
    if (unverified > 0) {
      insights.push({ type: 'confianza', severity: 'media',
        text: `${unverified} institución(es) sin verificar.` })
    }

    return {
      generated_at: new Date().toISOString(),
      total_profiles: totalProfiles,
      total_institutions: institutions.length,
      coverage,
      demand: {
        needs: Object.entries(needsCount).map(([k, v]) => ({ need: k, count: v })).sort((a, b) => b.count - a.count),
        goals: Object.entries(goalsCount).map(([k, v]) => ({ goal: k, count: v })).sort((a, b) => b.count - a.count),
        life_stages: Object.entries(stagesCount).map(([k, v]) => ({ stage: k, count: v })).sort((a, b) => b.count - a.count),
        support_areas: Object.entries(supportAreas).map(([k, v]) => ({ area: k, count: v })).sort((a, b) => b.count - a.count),
      },
      insights,
    }
  }

  /* ───────────────────────── Instituciones ───────────────────────── */

  async getAllInstitutions() {
    const snap = await this.col('p_institutions').orderBy('created_at', 'desc').get()
    return snap.docs.map(d => {
      const data = d.data()
      return { id: d.id, name: data.name, category: data.category, city: data.city,
        is_active: data.is_active, is_verified: data.is_verified, rating_avg: data.rating_avg,
        rating_count: data.rating_count, created_at: data.created_at }
    })
  }

  async getPendingInstitutions() {
    const snap = await this.col('p_institutions').where('is_active', '==', false).orderBy('created_at', 'asc').get()
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  }

  async approveInstitution(id: string) {
    await this.col('p_institutions').doc(id).update({ is_active: true })
    const doc = await this.col('p_institutions').doc(id).get()
    if (doc.exists) {
      const inst = doc.data()!
      await this.email.sendInstitutionApproved(inst.contact_email ?? inst.email ?? '', inst.name)
    }
    return { ok: true }
  }

  async rejectInstitution(id: string) {
    await this.col('p_institutions').doc(id).delete()
    return { ok: true }
  }

  async toggleVerifyInstitution(id: string) {
    const doc = await this.col('p_institutions').doc(id).get()
    if (!doc.exists) throw new NotFoundException('Institución no encontrada')
    const newVerified = !doc.data()!.is_verified
    await doc.ref.update({ is_verified: newVerified })
    return { ok: true, is_verified: newVerified }
  }

  /* ───────────────────────── Usuarios ───────────────────────── */

  async getUsers() {
    const snap = await this.col('u_profiles').orderBy('created_at', 'desc').get()
    return snap.docs.map(d => {
      const data = d.data()
      return { id: d.id, email: data.email, full_name: data.full_name, role: data.role,
        city: data.city, is_active: data.is_active, is_verified: data.is_verified, created_at: data.created_at }
    })
  }

  async toggleUserActive(id: string, adminId: string) {
    if (id === adminId) throw new BadRequestException('No puedes desactivar tu propia cuenta')
    const doc = await this.col('u_profiles').doc(id).get()
    if (!doc.exists) throw new NotFoundException('Usuario no encontrado')
    const newActive = !doc.data()!.is_active
    await doc.ref.update({ is_active: newActive })
    return { ok: true, is_active: newActive }
  }

  async changeUserRole(id: string, role: string, adminId: string) {
    if (id === adminId) throw new BadRequestException('No puedes cambiar tu propio rol')
    const allowed = ['pcd', 'tutor', 'institution', 'admin']
    if (!allowed.includes(role)) throw new BadRequestException('Rol inválido')
    const doc = await this.col('u_profiles').doc(id).get()
    if (!doc.exists) throw new NotFoundException('Usuario no encontrado')
    await doc.ref.update({ role })
    return { ok: true, role }
  }

  /* ───────────────────────── Reseñas (moderación) ───────────────────────── */

  async getReviews() {
    const revSnap = await this.col('u_reviews').orderBy('created_at', 'desc').limit(100).get()
    const reviews = revSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    // Enrich with user + institution data
    const userIds = [...new Set(reviews.map(r => r.user_id))]
    const instIds = [...new Set(reviews.map(r => r.institution_id))]

    const userMap = new Map<string, any>()
    for (const uid of userIds) {
      const doc = await this.col('u_profiles').doc(uid).get()
      if (doc.exists) userMap.set(uid, doc.data())
    }
    const instMap = new Map<string, any>()
    for (const iid of instIds) {
      const doc = await this.col('p_institutions').doc(iid).get()
      if (doc.exists) instMap.set(iid, doc.data())
    }

    return reviews.map(r => ({
      id: r.id, rating: r.rating, comment: r.comment, created_at: r.created_at,
      user_name: userMap.get(r.user_id)?.full_name ?? null,
      user_email: userMap.get(r.user_id)?.email ?? null,
      institution_name: instMap.get(r.institution_id)?.name ?? null,
    }))
  }

  async deleteReview(id: string) {
    const doc = await this.col('u_reviews').doc(id).get()
    if (!doc.exists) throw new NotFoundException('Reseña no encontrada')
    const review = doc.data()!
    await doc.ref.delete()

    // Recalculate rating
    const allRev = await this.col('u_reviews')
      .where('institution_id', '==', review.institution_id).get()
    if (allRev.empty) {
      await this.col('p_institutions').doc(review.institution_id).update({ rating_avg: 0, rating_count: 0 })
    } else {
      const sum = allRev.docs.reduce((s, d) => s + (d.data().rating ?? 0), 0)
      await this.col('p_institutions').doc(review.institution_id).update({
        rating_avg: parseFloat((sum / allRev.size).toFixed(2)),
        rating_count: allRev.size,
      })
    }
    return { ok: true }
  }

  /* ───────────────────────── Configuración ───────────────────────── */

  async getSettings() {
    const snap = await this.col('s_settings').get()
    const stored: Record<string, string> = {}
    for (const doc of snap.docs) stored[doc.data().key] = doc.data().value
    return { ...DEFAULT_SETTINGS, ...stored }
  }

  async updateSettings(settings: Record<string, string>) {
    for (const [key, value] of Object.entries(settings)) {
      if (!(key in DEFAULT_SETTINGS)) continue
      const snap = await this.col('s_settings').where('key', '==', key).limit(1).get()
      if (!snap.empty) {
        await snap.docs[0].ref.update({ value: String(value), updated_at: new Date().toISOString() })
      } else {
        await this.col('s_settings').doc(key).set({ key, value: String(value), updated_at: new Date().toISOString() })
      }
    }
    return this.getSettings()
  }

  /* ─────────────────────────── Alertas de riesgo ─────────────────────────── */

  async getAlerts() {
    const alerts: any[] = []
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()

    const [allInstsSnap, allUsersSnap, allReviewsSnap] = await Promise.all([
      this.col('p_institutions').get(),
      this.col('u_profiles').get(),
      this.col('u_reviews').get(),
    ])
    const allInsts = allInstsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
    const allUsers = allUsersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
    const allReviews = allReviewsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    const activeInsts = allInsts.filter(i => i.is_active)

    // 1. Instituciones con calificación crítica
    for (const inst of activeInsts) {
      if ((inst.rating_avg ?? 0) < 2.5 && (inst.rating_count ?? 0) >= 3) {
        alerts.push({
          id: `rating-risk-${inst.id}`, severity: 'critica', type: 'rating_risk',
          title: `Calificación crítica: ${inst.name}`,
          description: `Promedio de ${Number(inst.rating_avg).toFixed(1)}/5 con ${inst.rating_count} reseñas.`,
          action: 'Ver institución', entity_type: 'institution', entity_id: inst.id,
        })
      }
    }

    // 2. Sin instituciones verificadas
    const verifiedCount = activeInsts.filter(i => i.is_verified).length
    if (verifiedCount === 0 && activeInsts.length > 0) {
      alerts.push({
        id: 'no-verified-institutions', severity: 'critica', type: 'trust_risk',
        title: 'Sin instituciones verificadas',
        description: `Hay ${activeInsts.length} institución(es) activa(s) sin verificación.`,
        action: 'Verificar ahora', entity_type: 'institutions',
      })
    }

    // 3. Pendientes > 48h
    const pendingOld = allInsts.filter(i => !i.is_active && (i.created_at ?? '') < twoDaysAgo).length
    if (pendingOld > 0) {
      alerts.push({
        id: 'pending-institutions-delayed', severity: 'media', type: 'pending_approval',
        title: `${pendingOld} institución(es) pendiente(s) >48 h`,
        description: `Llevan más de 48 horas sin revisión.`, action: 'Aprobar', entity_type: 'institutions_pending',
      })
    }

    // 4. Reseñas 1 estrella últimos 7 días
    const lowWeek = allReviews.filter(r => r.rating === 1 && (r.created_at ?? '') >= sevenDaysAgo).length
    if (lowWeek > 0) {
      alerts.push({
        id: 'low-reviews-recent', severity: 'media', type: 'review_quality',
        title: `${lowWeek} reseña(s) de 1 estrella esta semana`,
        description: `Calificaciones muy bajas recientes.`, action: 'Moderar reseñas', entity_type: 'reviews',
      })
    }

    // 5. Alta proporción de usuarios inactivos
    const total = allUsers.length
    const inactive = allUsers.filter(u => !u.is_active).length
    if (total >= 10 && inactive / total > 0.25) {
      alerts.push({
        id: 'high-inactive-rate', severity: 'media', type: 'retention_risk',
        title: `${Math.round((inactive / total) * 100)}% de usuarios inactivos`,
        description: `${inactive} de ${total} usuarios desactivados.`, action: 'Ver usuarios', entity_type: 'users',
      })
    }

    // 6. Brecha de cobertura
    const covered = new Set<string>()
    for (const inst of activeInsts) {
      try { (JSON.parse(inst.disability_types ?? '[]') as string[]).forEach(t => covered.add(t.toLowerCase().trim())) } catch {}
    }
    const ALL_TYPES = ['motriz', 'visual', 'auditiva', 'intelectual', 'psicosocial', 'tea', 'múltiple', 'lenguaje']
    const uncovered = ALL_TYPES.filter(t => !covered.has(t))
    if (uncovered.length > 0) {
      alerts.push({
        id: 'disability-coverage-gap', severity: uncovered.length >= 4 ? 'critica' : 'media', type: 'coverage_gap',
        title: `Sin cobertura para ${uncovered.length} tipo(s) de discapacidad`,
        description: `Sin instituciones para: ${uncovered.join(', ')}.`, action: 'Ver inteligencia', entity_type: 'intelligence',
      })
    }

    // 7. Perfiles sin completar
    const profilesDoneSnap = await this.col('u_user_profiles').get()
    const pctDone = total > 0 ? (profilesDoneSnap.size / total) * 100 : 100
    if (total >= 5 && pctDone < 30) {
      alerts.push({
        id: 'low-profile-completion', severity: 'media', type: 'engagement',
        title: `Solo ${Math.round(pctDone)}% de usuarios completaron su perfil`,
        description: `Perfiles incompletos reducen la calidad de recomendaciones.`, action: 'Ver usuarios', entity_type: 'users',
      })
    }

    // 8. Nuevos registros esta semana
    const newWeek = allUsers.filter(u => (u.created_at ?? '') >= sevenDaysAgo).length
    if (newWeek > 0) {
      alerts.push({
        id: 'new-registrations-week', severity: 'info', type: 'growth',
        title: `${newWeek} nuevo(s) usuario(s) esta semana`,
        description: `La plataforma está creciendo.`, entity_type: 'users',
      })
    }

    // 9. Modo mantenimiento
    const maintSnap = await this.col('s_settings').where('key', '==', 'maintenance_mode').limit(1).get()
    if (!maintSnap.empty && maintSnap.docs[0].data().value === 'true') {
      alerts.push({
        id: 'maintenance-mode-active', severity: 'media', type: 'platform',
        title: 'Modo mantenimiento activado',
        description: 'La plataforma está en modo mantenimiento.', action: 'Desactivar', entity_type: 'settings',
      })
    }

    const order: Record<string, number> = { critica: 0, media: 1, info: 2 }
    return alerts.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))
  }
}
