import { Injectable, Inject, Logger } from '@nestjs/common'
import { Knex } from 'knex'
import { KNEX_CONNECTION } from '../../database/knex.provider'

const MOCK_REPLIES = [
  'Entiendo tu consulta. Basándome en tu perfil, te recomiendo explorar las instituciones de la categoría funcional en tu ciudad. ¿Quieres que te muestre opciones específicas?',
  'Hay varias opciones que podrían ayudarte. En Raíces tenemos instituciones verificadas con experiencia en tu situación. ¿Te gustaría explorar el mapa?',
  'Gracias por compartir eso. Es un paso importante. Muchas familias en situaciones similares han encontrado apoyo en los grupos de comunidad. ¿Quieres unirte a alguno?',
  'Entiendo la preocupación. Lo más importante es dar el primer paso. ¿Has revisado ya las instituciones disponibles en tu zona?',
  'Eso es muy valioso saberlo. Basándome en tu etapa de vida, el siguiente paso recomendado sería conectar con un especialista. ¿Quieres ver opciones?',
]

@Injectable()
export class AiService {
  private readonly logger = new Logger('AiService')
  private client: any = null

  constructor(@Inject(KNEX_CONNECTION) private readonly db: Knex) {
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const Anthropic = require('@anthropic-ai/sdk')
        this.client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY })
        this.logger.log('Anthropic SDK inicializado con API key real')
      } catch {
        this.logger.warn('Anthropic SDK no disponible — usando respuestas mock')
      }
    } else {
      this.logger.warn('ANTHROPIC_API_KEY no configurada — usando respuestas mock')
    }
  }

  private async getUserProfile(userId: string) {
    return this.db('u_user_profiles').where({ user_id: userId }).first()
  }

  async chat(userId: string, message: string, history: any[] = []) {
    const profile = await this.getUserProfile(userId)

    if (!this.client) {
      await new Promise((r) => setTimeout(r, 600)) // simular latencia
      const reply = MOCK_REPLIES[Math.floor(Math.random() * MOCK_REPLIES.length)]
      return { reply, mock: true }
    }

    const disabilityTypes = profile?.disability_types
      ? JSON.parse(profile.disability_types).join(', ')
      : 'no especificadas'

    const system = `Eres el asistente de Raíces para Florecer, ecosistema digital para personas con discapacidad en México.
Perfil del usuario: etapa=${profile?.life_stage ?? 'no especificada'}, discapacidades=${disabilityTypes}.
NUNCA des diagnósticos médicos. Respuestas ≤150 palabras. Sé empático y directo.`

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system,
      messages: [...history.slice(-6), { role: 'user', content: message }],
    })

    return { reply: response.content[0].text, mock: false }
  }

  private async getUserHistory(userId: string) {
    const [favorites, posts, applications] = await Promise.all([
      this.db('u_favorites')
        .join('p_institutions', 'u_favorites.institution_id', 'p_institutions.id')
        .where('u_favorites.user_id', userId)
        .select('p_institutions.name', 'p_institutions.category', 'p_institutions.city')
        .limit(10),
      this.db('u_posts')
        .where({ author_id: userId })
        .count('* as total')
        .first(),
      this.db('u_job_applications')
        .where({ user_id: userId })
        .count('* as total')
        .first()
        .catch(() => ({ total: 0 })),
    ])
    return { favorites, postCount: Number((posts as any)?.total ?? 0), applicationCount: Number((applications as any)?.total ?? 0) }
  }

  async recommend(userId: string) {
    const [profile, userRecord, history] = await Promise.all([
      this.getUserProfile(userId),
      this.db('u_profiles').where({ id: userId }).first(),
      this.getUserHistory(userId),
    ])

    const disabilityTypes = profile?.disability_types
      ? (() => { try { return JSON.parse(profile.disability_types) } catch { return [] } })()
      : []
    const hasNoDiagnosis = disabilityTypes.length === 0

    if (!this.client || !profile) {
      const steps = hasNoDiagnosis ? [
        'Agenda una evaluación diagnóstica — visita una institución de Terapia en tu ciudad para obtener un diagnóstico formal',
        'Completa tu perfil con tus necesidades actuales para recibir recomendaciones más precisas',
        'Explora la sección Comunidad para conectar con otras personas en situación similar',
      ] : [
        `Busca instituciones de ${disabilityTypes.join(' / ')} en ${userRecord?.city ?? 'tu ciudad'}`,
        'Completa tu historial de terapia y educación para un análisis más profundo',
        'Únete al grupo de comunidad relacionado con tu perfil',
      ]
      return {
        next_steps: steps,
        reasoning: hasNoDiagnosis ? 'Sin diagnóstico registrado — prioridad: evaluación (modo demo)' : 'Recomendaciones generales (modo demo)',
        institution_suggestions: hasNoDiagnosis ? [{ category: 'Terapia', reason: 'Evaluación diagnóstica' }] : [],
        mock: true,
      }
    }

    const favSummary = history.favorites.length > 0
      ? `Favoritos: ${history.favorites.map(f => `${f.name} (${f.category})`).join(', ')}.`
      : 'No tiene instituciones guardadas aún.'

    const prompt = `Eres el motor de análisis de Raíces para Florecer, plataforma de apoyo para personas con discapacidad en México.

PERFIL DEL USUARIO:
- Etapa de vida: ${profile.life_stage ?? 'no especificada'}
- Discapacidades: ${disabilityTypes.length > 0 ? disabilityTypes.join(', ') : 'sin diagnóstico registrado'}
- Ciudad: ${userRecord?.city ?? 'no especificada'}, ${userRecord?.state ?? ''}
- Nivel de soporte: ${profile.support_level ?? 'no especificado'}
- Metas actuales: ${profile.current_goals ? (() => { try { return JSON.parse(profile.current_goals).join(', ') } catch { return profile.current_goals } })() : 'no especificadas'}
- Áreas de soporte: ${profile.support_areas ? (() => { try { return JSON.parse(profile.support_areas).join(', ') } catch { return profile.support_areas } })() : 'no especificadas'}
- Preocupaciones actuales: ${profile.current_concerns ?? 'ninguna'}

HISTORIAL DE ACTIVIDAD:
- ${favSummary}
- Publicaciones en comunidad: ${history.postCount}
- Solicitudes de empleo enviadas: ${history.applicationCount}

${hasNoDiagnosis ? 'IMPORTANTE: El usuario NO tiene diagnóstico registrado. Prioriza sugerencias para evaluación diagnóstica.' : ''}

Genera 3 próximos pasos concretos y accionables, personalizados para esta persona específica en México.
Si no hay diagnóstico, el primer paso DEBE ser buscar evaluación diagnóstica.
Responde SOLO con JSON válido: {"next_steps":["paso1","paso2","paso3"],"reasoning":"explicación breve en español","institution_suggestions":[{"category":"Terapia|Educación|Empleo","reason":"por qué"}]}`

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      })
      const parsed = JSON.parse(response.content[0].text)
      return { ...parsed, mock: false }
    } catch {
      return {
        next_steps: ['Explora instituciones cercanas', 'Completa tu historial', 'Únete a la comunidad'],
        reasoning: 'Error al procesar — mostrando sugerencias generales',
        institution_suggestions: [],
        mock: true,
      }
    }
  }

  async recommendForDependent(userId: string, dependentId: string) {
    const dep = await this.db('u_dependents')
      .where({ id: dependentId, guardian_id: userId })
      .first()

    if (!dep) {
      return { next_steps: ['Perfil no encontrado'], reasoning: 'Error de acceso', mock: true }
    }

    let profileData: any = {}
    try { profileData = dep.profile_data ? JSON.parse(dep.profile_data) : {} } catch {}

    const disabilities = (profileData.disability_types ?? []).join(', ') || 'no especificadas'
    const lifeStage = profileData.life_stage ?? 'no especificada'
    const notes = profileData.notes ?? ''

    if (!this.client) {
      return {
        next_steps: [
          `Buscar instituciones especializadas en ${disabilities} para ${dep.full_name}`,
          `Explorar terapias adecuadas para la etapa de vida: ${lifeStage}`,
          'Revisar grupos de apoyo para familias cuidadoras',
        ],
        reasoning: `Recomendaciones para ${dep.full_name} (modo demo)`,
        mock: true,
      }
    }

    const prompt = `Persona bajo cuidado: ${dep.full_name}, relación con el tutor: ${dep.relationship}.
Perfil: discapacidades=${disabilities}, etapa de vida=${lifeStage}.
Notas del cuidador: ${notes || 'ninguna'}.
Genera 3 próximos pasos concretos y accionables para apoyar a esta persona específica en México.
Responde SOLO con JSON válido: {"next_steps":["paso1","paso2","paso3"],"reasoning":"explicación breve"}`

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      })
      return { ...JSON.parse(response.content[0].text), mock: false }
    } catch {
      return {
        next_steps: [
          `Busca instituciones de ${disabilities} cerca de ti`,
          'Completa el historial de necesidades del familiar',
          'Consulta el grupo de familias cuidadoras en la comunidad',
        ],
        reasoning: 'Error al procesar — mostrando sugerencias generales',
        mock: true,
      }
    }
  }
}
