import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { Knex } from 'knex'
import { KNEX_CONNECTION } from '../../database/knex.provider'
import { NotificationsService } from '../notifications/notifications.service'
import { EmailService } from '../email/email.service'

const DISABILITY_LABELS: Record<string, string> = {
  tea: 'TEA / Autismo',
  motriz: 'Motriz',
  intelectual: 'Intelectual',
  visual: 'Visual',
  auditiva: 'Auditiva',
  multiple: 'Múltiple',
  psicosocial: 'Psicosocial',
}

const CATEGORY_LABELS: Record<string, string> = {
  funcional: 'Salud y terapias',
  educativo: 'Educación',
  laboral: 'Empleo',
  social: 'Comunidad y social',
}

const DEFAULT_SETTINGS: Record<string, string> = {
  platform_name: 'Raíces para Florecer',
  support_email: 'soporte@raices.mx',
  allow_registration: 'true',
  require_institution_approval: 'true',
  ai_enabled: 'true',
  maintenance_mode: 'false',
  max_reviews_per_user: '10',
  default_city: 'Mérida',
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(KNEX_CONNECTION) private readonly db: Knex,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

  /* ───────────────────────── Stats & analytics ───────────────────────── */

  async getStats() {
    const [users] = await this.db('u_profiles').count('* as count')
    const [activeUsers] = await this.db('u_profiles').where({ is_active: true }).count('* as count')
    const [institutions] = await this.db('p_institutions').count('* as count')
    const [verified] = await this.db('p_institutions').where({ is_verified: true }).count('* as count')
    const [pending] = await this.db('p_institutions').where({ is_active: false }).count('* as count')
    const [reviews] = await this.db('u_reviews').count('* as count')
    const [posts] = await this.db('u_posts').count('* as count')
    const [groups] = await this.db('u_groups').count('* as count')
    const [avgRating] = await this.db('u_reviews').avg('rating as avg')
    const [profilesCompleted] = await this.db('u_user_profiles').count('* as count')

    return {
      total_users: Number(users.count),
      active_users: Number(activeUsers.count),
      total_institutions: Number(institutions.count),
      verified_institutions: Number(verified.count),
      pending_approval: Number(pending.count),
      total_reviews: Number(reviews.count),
      total_posts: Number(posts.count),
      total_groups: Number(groups.count),
      avg_rating: avgRating.avg ? Number(Number(avgRating.avg).toFixed(2)) : null,
      profiles_completed: Number(profilesCompleted.count),
    }
  }

  async getAnalytics() {
    // Registros por mes (últimos 6)
    const regs = await this.db('u_profiles')
      .select(this.db.raw(`strftime('%Y-%m', created_at) as month`))
      .count('* as count')
      .groupByRaw(`strftime('%Y-%m', created_at)`)
      .orderBy('month', 'asc')
      .limit(6)

    // Distribución de roles
    const roles = await this.db('u_profiles').select('role').count('* as count').groupBy('role')

    // Instituciones por categoría
    const categories = await this.db('p_institutions')
      .where({ is_active: true })
      .select('category')
      .count('* as count')
      .groupBy('category')

    // Distribución de calificaciones
    const ratings = await this.db('u_reviews').select('rating').count('* as count').groupBy('rating').orderBy('rating')

    // Top instituciones por rating
    const topInstitutions = await this.db('p_institutions')
      .where({ is_active: true })
      .select('id', 'name', 'category', 'rating_avg', 'rating_count', 'is_verified')
      .orderBy([{ column: 'rating_avg', order: 'desc' }, { column: 'rating_count', order: 'desc' }])
      .limit(5)

    // Actividad comunitaria reciente (posts por mes)
    const postActivity = await this.db('u_posts')
      .select(this.db.raw(`strftime('%Y-%m', created_at) as month`))
      .count('* as count')
      .groupByRaw(`strftime('%Y-%m', created_at)`)
      .orderBy('month', 'asc')
      .limit(6)

    // Distribución geográfica de instituciones
    const cities = await this.db('p_institutions')
      .where({ is_active: true })
      .select('city')
      .count('* as count')
      .groupBy('city')
      .orderBy('count', 'desc')
      .limit(8)

    return {
      registrations_by_month: regs.map((r: any) => ({ month: r.month, count: Number(r.count) })),
      role_distribution: roles.map((r: any) => ({ role: r.role, count: Number(r.count) })),
      institutions_by_category: categories.map((c: any) => ({
        category: c.category,
        label: CATEGORY_LABELS[c.category] ?? c.category,
        count: Number(c.count),
      })),
      rating_distribution: ratings.map((r: any) => ({ rating: Number(r.rating), count: Number(r.count) })),
      top_institutions: topInstitutions,
      post_activity: postActivity.map((p: any) => ({ month: p.month, count: Number(p.count) })),
      institutions_by_city: cities.map((c: any) => ({ city: c.city ?? 'Sin ciudad', count: Number(c.count) })),
    }
  }

  /* ─────────────────── Inteligencia de necesidades ─────────────────── */

  async getNeedsIntelligence() {
    const profiles = await this.db('u_user_profiles').select('*')
    const institutions = await this.db('p_institutions').where({ is_active: true }).select('*')

    const parse = (v: any): any[] => {
      if (!v) return []
      try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] }
    }

    // ── DEMANDA: agregación de perfiles de usuarios ──
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

    // ── OFERTA: cobertura institucional por tipo de discapacidad ──
    const supplyByDisability: Record<string, number> = {}
    for (const inst of institutions) {
      for (const d of parse(inst.disability_types)) supplyByDisability[d] = (supplyByDisability[d] ?? 0) + 1
    }

    // ── MATRIZ DE COBERTURA: demanda vs oferta ──
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
      return {
        type,
        label: DISABILITY_LABELS[type] ?? type,
        demand,
        supply,
        ratio: ratio === Infinity ? null : Number(ratio.toFixed(2)),
        status,
      }
    }).sort((a, b) => b.demand - a.demand)

    // ── INSIGHTS: motor heurístico de inteligencia de datos ──
    const insights: { type: string; severity: string; text: string }[] = []
    const totalProfiles = profiles.length

    const critical = coverage.filter((c) => c.status === 'critica')
    for (const c of critical) {
      insights.push({
        type: 'brecha_cobertura',
        severity: 'alta',
        text: `Cobertura crítica en ${c.label}: ${c.demand} usuario(s) con esta necesidad pero solo ${c.supply} institución(es) activa(s) que la atienden. Prioriza captar instituciones especializadas.`,
      })
    }

    const best = coverage.filter((c) => c.status === 'adecuada' && c.demand > 0)
    if (best.length > 0) {
      insights.push({
        type: 'fortaleza',
        severity: 'info',
        text: `Mayor fortaleza de cobertura: ${best.map((b) => b.label).join(', ')} — la oferta institucional supera 3x la demanda registrada.`,
      })
    }

    const topNeed = Object.entries(needsCount).sort((a, b) => b[1] - a[1])[0]
    if (topNeed) {
      insights.push({
        type: 'demanda_principal',
        severity: 'media',
        text: `La necesidad más reportada por usuarios es "${topNeed[0]}" (${topNeed[1]} de ${totalProfiles} perfiles). Considera destacar instituciones y grupos enfocados en esta área.`,
      })
    }

    const topStage = Object.entries(stagesCount).sort((a, b) => b[1] - a[1])[0]
    if (topStage) {
      const instInStage = institutions.filter((i) => {
        const ranges: Record<string, [number, number]> = {
          infancia: [0, 12], adolescencia: [13, 17], adulto_joven: [18, 29], adulto: [30, 59], mayor: [60, 99],
        }
        const r = ranges[topStage[0]]
        if (!r) return true
        return (i.age_min ?? 0) <= r[1] && (i.age_max ?? 99) >= r[0]
      }).length
      insights.push({
        type: 'etapa_vida',
        severity: 'info',
        text: `Etapa de vida predominante: ${topStage[0]} (${topStage[1]} usuarios). ${instInStage} de ${institutions.length} instituciones atienden ese rango de edad.`,
      })
    }

    const noProfile = await this.db('u_profiles')
      .where({ role: 'pcd' })
      .whereNotIn('id', this.db('u_user_profiles').select('user_id'))
      .count('* as count')
    const missing = Number((noProfile[0] as any).count)
    if (missing > 0) {
      insights.push({
        type: 'datos_incompletos',
        severity: 'media',
        text: `${missing} usuario(s) con rol PCD aún no completan su perfil de necesidades. Sin estos datos el motor de recomendaciones pierde precisión — considera una campaña de onboarding.`,
      })
    }

    const unverified = institutions.filter((i) => !i.is_verified).length
    if (unverified > 0) {
      insights.push({
        type: 'confianza',
        severity: 'media',
        text: `${unverified} institución(es) activa(s) sin verificar. La verificación aumenta la confianza del ecosistema — revisa su documentación.`,
      })
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
    return this.db('p_institutions')
      .select('id', 'name', 'category', 'city', 'is_active', 'is_verified', 'rating_avg', 'rating_count', 'created_at')
      .orderBy('created_at', 'desc')
  }

  async getPendingInstitutions() {
    return this.db('p_institutions').where({ is_active: false }).orderBy('created_at', 'asc')
  }

  async approveInstitution(id: string) {
    await this.db('p_institutions').where({ id }).update({ is_active: true })
    const inst = await this.db('p_institutions').where({ id }).first()
    if (inst) {
      await this.email.sendInstitutionApproved(inst.contact_email ?? inst.email ?? '', inst.name)
    }
    return { ok: true }
  }

  async rejectInstitution(id: string) {
    await this.db('p_institutions').where({ id }).delete()
    return { ok: true }
  }

  async toggleVerifyInstitution(id: string) {
    const inst = await this.db('p_institutions').where({ id }).first()
    if (!inst) throw new NotFoundException('Institución no encontrada')
    await this.db('p_institutions').where({ id }).update({ is_verified: !inst.is_verified })
    return { ok: true, is_verified: !inst.is_verified }
  }

  /* ───────────────────────── Usuarios ───────────────────────── */

  async getUsers() {
    return this.db('u_profiles')
      .select('id', 'email', 'full_name', 'role', 'city', 'is_active', 'is_verified', 'created_at')
      .orderBy('created_at', 'desc')
  }

  async toggleUserActive(id: string, adminId: string) {
    if (id === adminId) throw new BadRequestException('No puedes desactivar tu propia cuenta')
    const user = await this.db('u_profiles').where({ id }).first()
    if (!user) throw new NotFoundException('Usuario no encontrado')
    await this.db('u_profiles').where({ id }).update({ is_active: !user.is_active })
    return { ok: true, is_active: !user.is_active }
  }

  async changeUserRole(id: string, role: string, adminId: string) {
    if (id === adminId) throw new BadRequestException('No puedes cambiar tu propio rol')
    const allowed = ['pcd', 'tutor', 'institution', 'admin']
    if (!allowed.includes(role)) throw new BadRequestException('Rol inválido')
    const user = await this.db('u_profiles').where({ id }).first()
    if (!user) throw new NotFoundException('Usuario no encontrado')
    await this.db('u_profiles').where({ id }).update({ role })
    return { ok: true, role }
  }

  /* ───────────────────────── Reseñas (moderación) ───────────────────────── */

  async getReviews() {
    return this.db('u_reviews as r')
      .leftJoin('u_profiles as u', 'r.user_id', 'u.id')
      .leftJoin('p_institutions as i', 'r.institution_id', 'i.id')
      .select('r.id', 'r.rating', 'r.comment', 'r.created_at', 'u.full_name as user_name', 'u.email as user_email', 'i.name as institution_name')
      .orderBy('r.created_at', 'desc')
      .limit(100)
  }

  async deleteReview(id: string) {
    const review = await this.db('u_reviews').where({ id }).first()
    if (!review) throw new NotFoundException('Reseña no encontrada')
    await this.db('u_reviews').where({ id }).delete()
    // Recalcular rating de la institución
    const stats = await this.db('u_reviews')
      .where({ institution_id: review.institution_id })
      .select(this.db.raw('avg(rating) as avg, count(*) as count'))
      .first() as any
    await this.db('p_institutions').where({ id: review.institution_id }).update({
      rating_avg: stats?.avg ? Number(Number(stats.avg).toFixed(2)) : 0,
      rating_count: Number(stats?.count ?? 0),
    })
    return { ok: true }
  }

  /* ───────────────────────── Configuración ───────────────────────── */

  private async ensureSettingsTable() {
    const exists = await this.db.schema.hasTable('s_settings')
    if (!exists) {
      await this.db.schema.createTable('s_settings', (t) => {
        t.string('key').primary()
        t.text('value')
        t.timestamp('updated_at').defaultTo(this.db.fn.now())
      })
    }
  }

  async getSettings() {
    await this.ensureSettingsTable()
    const rows = await this.db('s_settings').select('key', 'value')
    const stored: Record<string, string> = {}
    for (const r of rows) stored[r.key] = r.value
    return { ...DEFAULT_SETTINGS, ...stored }
  }

  async updateSettings(settings: Record<string, string>) {
    await this.ensureSettingsTable()
    for (const [key, value] of Object.entries(settings)) {
      if (!(key in DEFAULT_SETTINGS)) continue
      const exists = await this.db('s_settings').where({ key }).first()
      if (exists) {
        await this.db('s_settings').where({ key }).update({ value: String(value), updated_at: this.db.fn.now() })
      } else {
        await this.db('s_settings').insert({ key, value: String(value) })
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

    // 1. Instituciones con calificación crítica (< 2.5 con >= 3 reseñas)
    const poorInsts = await this.db('p_institutions')
      .where('is_active', true)
      .where('rating_avg', '<', 2.5)
      .where('rating_count', '>=', 3)
      .select('id', 'name', 'rating_avg', 'rating_count')

    for (const inst of poorInsts) {
      alerts.push({
        id: `rating-risk-${inst.id}`,
        severity: 'critica',
        type: 'rating_risk',
        title: `Calificación crítica: ${inst.name}`,
        description: `Promedio de ${Number(inst.rating_avg).toFixed(1)}/5 con ${inst.rating_count} reseñas. Puede dañar la confianza en la plataforma.`,
        action: 'Ver institución',
        entity_type: 'institution',
        entity_id: inst.id,
      })
    }

    // 2. Ninguna institución verificada
    const [verifiedCount] = await this.db('p_institutions').where('is_verified', true).count('* as n')
    const [activeCount] = await this.db('p_institutions').where('is_active', true).count('* as n')
    if (Number(verifiedCount.n) === 0 && Number(activeCount.n) > 0) {
      alerts.push({
        id: 'no-verified-institutions',
        severity: 'critica',
        type: 'trust_risk',
        title: 'Sin instituciones verificadas',
        description: `Hay ${activeCount.n} institución(es) activa(s) sin verificación oficial. Los usuarios no pueden identificar fuentes confiables.`,
        action: 'Verificar ahora',
        entity_type: 'institutions',
      })
    }

    // 3. Instituciones pendientes de aprobación > 48 h
    const [pendingOld] = await this.db('p_institutions')
      .where('is_active', false)
      .where('created_at', '<', twoDaysAgo)
      .count('* as n')
    if (Number(pendingOld.n) > 0) {
      alerts.push({
        id: 'pending-institutions-delayed',
        severity: 'media',
        type: 'pending_approval',
        title: `${pendingOld.n} institución(es) pendiente(s) >48 h`,
        description: `Llevan más de 48 horas sin revisión. Las instituciones en espera no son visibles para los usuarios.`,
        action: 'Aprobar',
        entity_type: 'institutions_pending',
      })
    }

    // 4. Reseñas de 1 estrella en los últimos 7 días
    const [lowWeek] = await this.db('u_reviews')
      .where('rating', 1)
      .where('created_at', '>=', sevenDaysAgo)
      .count('* as n')
    if (Number(lowWeek.n) > 0) {
      alerts.push({
        id: 'low-reviews-recent',
        severity: 'media',
        type: 'review_quality',
        title: `${lowWeek.n} reseña(s) de 1 estrella esta semana`,
        description: `Concentración de calificaciones muy bajas recientes. Pueden indicar problema de calidad o campaña coordinada.`,
        action: 'Moderar reseñas',
        entity_type: 'reviews',
      })
    }

    // 5. Alta proporción de usuarios inactivos (>25 % con al menos 10 users)
    const [totalU] = await this.db('u_profiles').count('* as n')
    const [inactiveU] = await this.db('u_profiles').where('is_active', false).count('* as n')
    const total = Number(totalU.n)
    const inactive = Number(inactiveU.n)
    if (total >= 10 && inactive / total > 0.25) {
      alerts.push({
        id: 'high-inactive-rate',
        severity: 'media',
        type: 'retention_risk',
        title: `${Math.round((inactive / total) * 100)}% de usuarios inactivos`,
        description: `${inactive} de ${total} usuarios están desactivados. Puede indicar problemas de retención o abuso de cuentas.`,
        action: 'Ver usuarios',
        entity_type: 'users',
      })
    }

    // 6. Brecha de cobertura: tipos de discapacidad sin ninguna institución
    const instRows = await this.db('p_institutions').where('is_active', true).select('disability_types')
    const covered = new Set<string>()
    for (const row of instRows) {
      try {
        const arr: string[] = JSON.parse(row.disability_types ?? '[]')
        arr.forEach(t => covered.add(t.toLowerCase().trim()))
      } catch {}
    }
    const ALL_TYPES = ['motriz', 'visual', 'auditiva', 'intelectual', 'psicosocial', 'tea', 'múltiple', 'lenguaje']
    const uncovered = ALL_TYPES.filter(t => !covered.has(t))
    if (uncovered.length > 0) {
      const sev = uncovered.length >= 4 ? 'critica' : 'media'
      alerts.push({
        id: 'disability-coverage-gap',
        severity: sev,
        type: 'coverage_gap',
        title: `Sin cobertura para ${uncovered.length} tipo(s) de discapacidad`,
        description: `Sin instituciones registradas para: ${uncovered.join(', ')}. Usuarios con estas condiciones no encuentran apoyo en la plataforma.`,
        action: 'Ver inteligencia',
        entity_type: 'intelligence',
      })
    }

    // 7. Perfiles sin completar > 70 % de usuarios
    const [profilesDone] = await this.db('u_user_profiles').count('* as n')
    const pctDone = total > 0 ? (Number(profilesDone.n) / total) * 100 : 100
    if (total >= 5 && pctDone < 30) {
      alerts.push({
        id: 'low-profile-completion',
        severity: 'media',
        type: 'engagement',
        title: `Solo ${Math.round(pctDone)}% de usuarios completaron su perfil`,
        description: `Perfiles incompletos reducen la calidad de las recomendaciones de IA y la pertinencia de los resultados.`,
        action: 'Ver usuarios',
        entity_type: 'users',
      })
    }

    // 8. INFO: nuevos registros esta semana
    const [newWeek] = await this.db('u_profiles').where('created_at', '>=', sevenDaysAgo).count('* as n')
    if (Number(newWeek.n) > 0) {
      alerts.push({
        id: 'new-registrations-week',
        severity: 'info',
        type: 'growth',
        title: `${newWeek.n} nuevo(s) usuario(s) esta semana`,
        description: `La plataforma está creciendo. Verifica que el proceso de bienvenida y el perfilado estén funcionando correctamente.`,
        entity_type: 'users',
      })
    }

    // 9. INFO: plataforma en modo mantenimiento
    await this.ensureSettingsTable()
    const maintenanceSetting = await this.db('s_settings').where({ key: 'maintenance_mode' }).first()
    if (maintenanceSetting?.value === 'true') {
      alerts.push({
        id: 'maintenance-mode-active',
        severity: 'media',
        type: 'platform',
        title: 'Modo mantenimiento activado',
        description: 'La plataforma está en modo mantenimiento. Los usuarios no pueden acceder a funciones normales.',
        action: 'Desactivar',
        entity_type: 'settings',
      })
    }

    const order: Record<string, number> = { critica: 0, media: 1, info: 2 }
    return alerts.sort((a, b) => order[a.severity] - order[b.severity])
  }
}
