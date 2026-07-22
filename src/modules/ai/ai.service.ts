import { Injectable, Inject, Logger } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { parsearTiposDiscapacidad, parsearCampoJson } from '../../common/utils/firestore-helpers'

const RESPUESTAS_MOCK = [
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

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {
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

  private async getUserProfile(usuarioId: string) {
    const snap = await this.db.collection(COLECCIONES.perfilesExtendidos)
      .where('usuarioId', '==', usuarioId).limit(1).get()
    return snap.empty ? null : snap.docs[0].data()
  }

  async chat(usuarioId: string, mensaje: string, historial: any[] = []) {
    const perfil = await this.getUserProfile(usuarioId)

    if (!this.client) {
      await new Promise((r) => setTimeout(r, 600))
      const respuesta = RESPUESTAS_MOCK[Math.floor(Math.random() * RESPUESTAS_MOCK.length)]
      return { respuesta, simulado: true }
    }

    const tiposDiscapacidad = perfil?.tiposDiscapacidad
      ? parsearTiposDiscapacidad(perfil.tiposDiscapacidad).join(', ')
      : 'no especificadas'

    const sistema = `Eres el asistente de Raíces para Florecer, ecosistema digital para personas con discapacidad en México.
Perfil del usuario: etapa=${perfil?.etapaVida ?? 'no especificada'}, discapacidades=${tiposDiscapacidad}.
NUNCA des diagnósticos médicos. Respuestas ≤150 palabras. Sé empático y directo.`

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: sistema,
      messages: [...historial.slice(-6), { role: 'user', content: mensaje }],
    })

    return { respuesta: response.content[0].text, simulado: false }
  }

  private async getUserHistory(usuarioId: string) {
    const [favSnap, postsSnap, appsSnap] = await Promise.all([
      this.db.collection(COLECCIONES.favoritos).where('usuarioId', '==', usuarioId).limit(10).get(),
      this.db.collection(COLECCIONES.publicaciones).where('autorId', '==', usuarioId).get(),
      this.db.collection(COLECCIONES.postulaciones).where('usuarioId', '==', usuarioId).get().catch(() => ({ size: 0 } as any)),
    ])

    const favoritos: any[] = []
    for (const fdoc of favSnap.docs) {
      const instDoc = await this.db.collection(COLECCIONES.instituciones).doc(fdoc.data().institucionId).get()
      if (instDoc.exists) {
        const inst = instDoc.data()!
        favoritos.push({ nombre: inst.nombre, categoria: inst.categoria, ciudad: inst.ciudad })
      }
    }

    return { favoritos, cantidadPublicaciones: postsSnap.size, cantidadPostulaciones: appsSnap.size ?? 0 }
  }

  async recommend(usuarioId: string) {
    const [perfil, registroUsuario, historial] = await Promise.all([
      this.getUserProfile(usuarioId),
      this.db.collection(COLECCIONES.perfiles).doc(usuarioId).get(),
      this.getUserHistory(usuarioId),
    ])

    const tiposDiscapacidad = perfil?.tiposDiscapacidad
      ? parsearTiposDiscapacidad(perfil.tiposDiscapacidad)
      : []
    const sinDiagnostico = tiposDiscapacidad.length === 0
    const datosUsuario = registroUsuario.data()

    if (!this.client || !perfil) {
      const pasos = sinDiagnostico ? [
        'Agenda una evaluación diagnóstica — visita una institución de Terapia en tu ciudad para obtener un diagnóstico formal',
        'Completa tu perfil con tus necesidades actuales para recibir recomendaciones más precisas',
        'Explora la sección Comunidad para conectar con otras personas en situación similar',
      ] : [
        `Busca instituciones de ${tiposDiscapacidad.join(' / ')} en ${datosUsuario?.ciudad ?? 'tu ciudad'}`,
        'Completa tu historial de terapia y educación para un análisis más profundo',
        'Únete al grupo de comunidad relacionado con tu perfil',
      ]
      return {
        proximosPasos: pasos,
        razonamiento: sinDiagnostico ? 'Sin diagnóstico registrado — prioridad: evaluación (modo demo)' : 'Recomendaciones generales (modo demo)',
        sugerenciasInstitucion: sinDiagnostico ? [{ categoria: 'Terapia', razon: 'Evaluación diagnóstica' }] : [],
        simulado: true,
      }
    }

    const resumenFavoritos = historial.favoritos.length > 0
      ? `Favoritos: ${historial.favoritos.map(f => `${f.nombre} (${f.categoria})`).join(', ')}.`
      : 'No tiene instituciones guardadas aún.'

    const prompt = `Eres el motor de análisis de Raíces para Florecer, plataforma de apoyo para personas con discapacidad en México.

PERFIL DEL USUARIO:
- Etapa de vida: ${perfil.etapaVida ?? 'no especificada'}
- Discapacidades: ${tiposDiscapacidad.length > 0 ? tiposDiscapacidad.join(', ') : 'sin diagnóstico registrado'}
- Ciudad: ${datosUsuario?.ciudad ?? 'no especificada'}, ${datosUsuario?.estado ?? ''}
- Nivel de soporte: ${perfil.nivelApoyo ?? 'no especificado'}
- Metas actuales: ${perfil.metasActuales ? (parsearCampoJson(perfil.metasActuales) as string[]).join(', ') : 'no especificadas'}
- Áreas de soporte: ${perfil.areasApoyo ? (parsearCampoJson(perfil.areasApoyo) as string[]).join(', ') : 'no especificadas'}
- Preocupaciones actuales: ${perfil.preocupacionesActuales ?? 'ninguna'}

HISTORIAL DE ACTIVIDAD:
- ${resumenFavoritos}
- Publicaciones en comunidad: ${historial.cantidadPublicaciones}
- Solicitudes de empleo enviadas: ${historial.cantidadPostulaciones}

${sinDiagnostico ? 'IMPORTANTE: El usuario NO tiene diagnóstico registrado. Prioriza sugerencias para evaluación diagnóstica.' : ''}

Genera 3 próximos pasos concretos y accionables, personalizados para esta persona específica en México.
Si no hay diagnóstico, el primer paso DEBE ser buscar evaluación diagnóstica.
Responde SOLO con JSON válido: {"proximosPasos":["paso1","paso2","paso3"],"razonamiento":"explicación breve en español","sugerenciasInstitucion":[{"categoria":"Terapia|Educación|Empleo","razon":"por qué"}]}`

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      })
      return { ...JSON.parse(response.content[0].text), simulado: false }
    } catch {
      return {
        proximosPasos: ['Explora instituciones cercanas', 'Completa tu historial', 'Únete a la comunidad'],
        razonamiento: 'Error al procesar — mostrando sugerencias generales', sugerenciasInstitucion: [], simulado: true,
      }
    }
  }

  async recommendForDependent(usuarioId: string, dependienteId: string) {
    const depDoc = await this.db.collection(COLECCIONES.dependientes).doc(dependienteId).get()
    if (!depDoc.exists || depDoc.data()?.tutorId !== usuarioId) {
      return { proximosPasos: ['Perfil no encontrado'], razonamiento: 'Error de acceso', simulado: true }
    }
    const dep = depDoc.data()!

    let datosPerfil: any = {}
    try { datosPerfil = dep.datosPerfil ? JSON.parse(dep.datosPerfil) : {} } catch {}

    const discapacidades = (datosPerfil.tiposDiscapacidad ?? []).join(', ') || 'no especificadas'
    const etapaVida = datosPerfil.etapaVida ?? 'no especificada'
    const notas = datosPerfil.notas ?? ''

    if (!this.client) {
      return {
        proximosPasos: [
          `Buscar instituciones especializadas en ${discapacidades} para ${dep.nombreCompleto}`,
          `Explorar terapias adecuadas para la etapa de vida: ${etapaVida}`,
          'Revisar grupos de apoyo para familias cuidadoras',
        ],
        razonamiento: `Recomendaciones para ${dep.nombreCompleto} (modo demo)`, simulado: true,
      }
    }

    const prompt = `Persona bajo cuidado: ${dep.nombreCompleto}, relación con el tutor: ${dep.parentesco}.
Perfil: discapacidades=${discapacidades}, etapa de vida=${etapaVida}.
Notas del cuidador: ${notas || 'ninguna'}.
Genera 3 próximos pasos concretos y accionables para apoyar a esta persona específica en México.
Responde SOLO con JSON válido: {"proximosPasos":["paso1","paso2","paso3"],"razonamiento":"explicación breve"}`

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      })
      return { ...JSON.parse(response.content[0].text), simulado: false }
    } catch {
      return {
        proximosPasos: [
          `Busca instituciones de ${discapacidades} cerca de ti`,
          'Completa el historial de necesidades del familiar',
          'Consulta el grupo de familias cuidadoras en la comunidad',
        ],
        razonamiento: 'Error al procesar — mostrando sugerencias generales', simulado: true,
      }
    }
  }
}
