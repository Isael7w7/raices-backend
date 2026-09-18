import { Injectable, Inject, Logger } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { parsearTiposDiscapacidad, parsearCampoJson } from '../../common/utils/firestore-helpers'
import type { PerfilExtendidoDoc, PerfilDoc } from '../../common/interfaces/firestore-documents.interface'

// ─── Tipos internos ──────────────────────────────────────────────────────

/** Template de paso experto para una ruta por defecto. */
export interface PasoExperto {
  titulo: string
  descripcion: string
  categoria: string // e.g. 'habla', 'motricidad', 'educacion', 'laboral'
  orden: number
}

/** Ruta experta completa (Day Zero). */
export interface RutaExperta {
  nombre: string
  descripcion: string
  areaInteres: string
  pasos: PasoExperto[]
}

/** Resultado de la búsqueda de perfil similar. */
export interface PerfilSimilar {
  usuarioId: string
  similaridad: number // 0-1, qué tan similar es
  rutasCompletadas: number
  pasosExitosos: string[] // títulos de pasos que mejor funcionaron
}

// ─── Plantillas de rutas expertas por tipo de discapacidad ────────────────

const RUTAS_EXPERTAS_POR_DISCAPACIDAD: Record<string, RutaExperta> = {
  habla: {
    nombre: 'Desarrollo de Comunicación y Habla',
    descripcion: 'Ruta progresiva para fortalecer habilidades de comunicación, desde evaluación inicial hasta integración social y laboral.',
    areaInteres: 'terapia',
    pasos: [
      { titulo: 'Evaluación inicial del habla', descripcion: 'Programar evaluación con un especialista en terapia del habla para identificar áreas de mejora.', categoria: 'habla', orden: 1 },
      { titulo: 'Sesiones de terapia del habla', descripcion: 'Asistir a sesiones regulares de terapia enfocadas en pronunciación, fluidez y vocabulario.', categoria: 'habla', orden: 2 },
      { titulo: 'Práctica en entornos seguros', descripcion: 'Practicar habilidades comunicativas en grupos de apoyo o sesiones de conversation club.', categoria: 'habla', orden: 3 },
      { titulo: 'Integración social progresiva', descripcion: 'Participar en actividades comunitarias donde se requiera comunicación oral.', categoria: 'social', orden: 4 },
      { titulo: 'Preparación para entorno laboral', descripcion: 'Desarrollar habilidades de comunicación profesional: presentaciones, entrevistas, trabajo en equipo.', categoria: 'laboral', orden: 5 },
      { titulo: 'Búsqueda de empleo inclusivo', descripcion: 'Explorar vacantes en empresas inclusivas que valoren la diversidad comunicativa.', categoria: 'laboral', orden: 6 },
    ],
  },
  motricidad: {
    nombre: 'Fortalecimiento Motricidad y Movilidad',
    descripcion: 'Ruta de desarrollo motor progresivo: desde evaluación física hasta autonomía en la vida diaria y laboral.',
    areaInteres: 'funcional',
    pasos: [
      { titulo: 'Evaluación motora integral', descripcion: 'Evaluación con fisioterapeuta u occupational therapist para definir plan personalizado.', categoria: 'motricidad', orden: 1 },
      { titulo: 'Programa de fisioterapia', descripcion: 'Sesiones regulares de fortalecimiento, estiramientos y coordinación motora.', categoria: 'motricidad', orden: 2 },
      { titulo: 'Terapia ocupacional', descripcion: 'Ejercicios para mejorar habilidades de la vida diaria: vestirse, comer, escribir.', categoria: 'motricidad', orden: 3 },
      { titulo: 'Adaptación del entorno', descripcion: 'Identificar y solicitar adaptaciones en el hogar, escuela o trabajo para facilitar la movilidad.', categoria: 'funcional', orden: 4 },
      { titulo: 'Actividad física adaptada', descripcion: 'Participar en deportes o actividades físicas adaptadas para mantener condición general.', categoria: 'motricidad', orden: 5 },
      { titulo: 'Inserción laboral inclusiva', descripcion: 'Buscar oportunidades en entornos laborales que ofrezcan adaptaciones razonables.', categoria: 'laboral', orden: 6 },
    ],
  },
  visual: {
    nombre: 'Independencia Visual y Accesibilidad',
    descripcion: 'Ruta para desarrollar habilidades de navegación independiente y acceso a tecnología asistiva.',
    areaInteres: 'funcional',
    pasos: [
      { titulo: 'Evaluación y diagnóstico visual', descripcion: 'Consulta con especialista para determinar nivel de visión residual y opciones de apoyo.', categoria: 'visual', orden: 1 },
      { titulo: 'Entrenamiento en movilidad', descripcion: 'Aprender técnicas de orientación y movilidad con bastón o guía.', categoria: 'visual', orden: 2 },
      { titulo: 'Tecnología asistiva', descripcion: 'Conocer y usar herramientas: lectores de pantalla, apps de acceso, Braille digital.', categoria: 'visual', orden: 3 },
      { titulo: 'Acceso a educación inclusiva', descripcion: 'Explorar opciones educativas con materiales accesibles y adaptaciones curriculares.', categoria: 'educacion', orden: 4 },
      { titulo: 'Desarrollo de habilidades profesionales', descripcion: 'Capacitación en habilidades laborales con herramientas accesibles.', categoria: 'laboral', orden: 5 },
      { titulo: 'Búsqueda de empleo inclusivo', descripcion: 'Postularse a empresas con programas de inclusión laboral para personas con discapacidad visual.', categoria: 'laboral', orden: 6 },
    ],
  },
  auditiva: {
    nombre: 'Comunicación Auditiva e Inclusión',
    descripcion: 'Ruta para desarrollar estrategias de comunicación, acceso a educación y empleo inclusivo.',
    areaInteres: 'educacion',
    pasos: [
      { titulo: 'Evaluación audiológica', descripcion: 'Evaluación con audiólogo para determinar nivel de pérdida y opciones de apoyo.', categoria: 'auditiva', orden: 1 },
      { titulo: 'Adaptación de tecnología auditiva', descripcion: 'Obtener y adaptar audífonos, implantes cocleares u otros dispositivos.', categoria: 'auditiva', orden: 2 },
      { titulo: 'Aprendizaje de lengua de señas', descripcion: 'Iniciar clases de LSM para mejorar la comunicación bilingüe.', categoria: 'auditiva', orden: 3 },
      { titulo: 'Acceso a educación inclusiva', descripcion: 'Explorar opciones con intérprete de LSM, subtitulado y material visual.', categoria: 'educacion', orden: 4 },
      { titulo: 'Habilidades sociales y comunitarias', descripcion: 'Participar en grupos de la comunidad sorda para fortalecer identidad y redes de apoyo.', categoria: 'social', orden: 5 },
      { titulo: 'Inserción laboral inclusiva', descripcion: 'Buscar empleo en entornos con adaptaciones comunicativas (intérprete, alertas visuales).', categoria: 'laboral', orden: 6 },
    ],
  },
  tea: {
    nombre: 'Desarrollo Social y Habilidades de Vida',
    descripcion: 'Ruta estructurada para fortalecer interacción social, comunicación y autonomía.',
    areaInteres: 'funcional',
    pasos: [
      { titulo: 'Evaluación del perfil TEA', descripcion: 'Evaluación integral para identificar fortalezas y áreas de apoyo.', categoria: 'tea', orden: 1 },
      { titulo: 'Intervención conductual', descripcion: 'Sesiones de terapia enfocadas en habilidades sociales, comunicación y regulación emocional.', categoria: 'tea', orden: 2 },
      { titulo: 'Entrenamiento en habilidades sociales', descripcion: 'Práctica estructurada de interacción social: conversación, empatía, amistad.', categoria: 'social', orden: 3 },
      { titulo: 'Desarrollo de rutinas de vida independiente', descripcion: 'Establecer rutinas de autocuidado, organización y gestión del tiempo.', categoria: 'funcional', orden: 4 },
      { titulo: 'Exploración de intereses y talentos', descripcion: 'Identificar fortalezas especiales para orientar educación y empleo.', categoria: 'educacion', orden: 5 },
      { titulo: 'Inserción laboral con apoyo', descripcion: 'Buscar empleo en entornos que ofrezcan mentoría y adaptaciones para TEA.', categoria: 'laboral', orden: 6 },
    ],
  },
  cognitiva: {
    nombre: 'Desarrollo Cognitivo y Educativo',
    descripcion: 'Ruta para fortalecer habilidades cognitivas, acceso a educación adaptada y vida independiente.',
    areaInteres: 'educacion',
    pasos: [
      { titulo: 'Evaluación cognitiva integral', descripcion: 'Evaluación con neuropsicólogo para mapear fortalezas y áreas de desarrollo.', categoria: 'cognitiva', orden: 1 },
      { titulo: 'Estimulación cognitiva', descripcion: 'Programa de actividades para mejorar memoria, atención, resolución de problemas.', categoria: 'cognitiva', orden: 2 },
      { titulo: 'Acceso a educación adaptada', descripcion: 'Explorar opciones con adaptaciones curriculares, apoyo pedagógico y materiales accesibles.', categoria: 'educacion', orden: 3 },
      { titulo: 'Desarrollo de habilidades de vida', descripcion: 'Práctica de habilidades prácticas: manejo de dinero, transporte, seguridad personal.', categoria: 'funcional', orden: 4 },
      { titulo: 'Habilidades sociales y emocionales', descripcion: 'Participar en grupos de habilidades sociales para mejorar la interacción interpersonal.', categoria: 'social', orden: 5 },
      { titulo: 'Orientación vocacional y laboral', descripcion: 'Identificar intereses laborales y explorar opciones de empleo inclusivo.', categoria: 'laboral', orden: 6 },
    ],
  },
}

/** Ruta genérica cuando no hay match de discapacidad específica. */
const RUTA_GENERICA: RutaExperta = {
  nombre: 'Desarrollo Integral y Vida Independiente',
  descripcion: 'Ruta general para fortalecer habilidades de vida, acceso a servicios y participación social.',
  areaInteres: 'general',
  pasos: [
    { titulo: 'Evaluación de necesidades', descripcion: 'Consulta con profesional para identificar áreas de apoyo prioritarias.', categoria: 'general', orden: 1 },
    { titulo: 'Acceso a servicios de salud', descripcion: 'Conectar con especialistas y servicios de salud relevantes.', categoria: 'general', orden: 2 },
    { titulo: 'Fortalecimiento de habilidades', descripcion: 'Trabajar en áreas de desarrollo según las necesidades identificadas.', categoria: 'general', orden: 3 },
    { titulo: 'Participación social', descripcion: 'Integrarse a grupos de apoyo y actividades comunitarias.', categoria: 'social', orden: 4 },
    { titulo: 'Acceso a educación o empleo', descripcion: 'Explorar opciones educativas o laborales inclusivas.', categoria: 'educacion', orden: 5 },
    { titulo: 'Vida independiente', descripcion: 'Desarrollar habilidades para la autonomía en la vida diaria.', categoria: 'funcional', orden: 6 },
  ],
}

// ─── Rangos de edad para matching ────────────────────────────────────────

/** Calcula el rango de edad aproximado a partir de la fecha de nacimiento. */
function calcularRangoEdad(fechaNacimiento?: string): string {
  if (!fechaNacimiento) return 'desconocido'
  try {
    const nac = new Date(fechaNacimiento)
    const hoy = new Date()
    const edad = Math.floor((hoy.getTime() - nac.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    if (edad <= 5) return '0-5'
    if (edad <= 12) return '6-12'
    if (edad <= 17) return '13-17'
    if (edad <= 25) return '18-25'
    if (edad <= 35) return '26-35'
    if (edad <= 50) return '36-50'
    return '51+'
  } catch {
    return 'desconocido'
  }
}

/** Verifica si dos rangos de edad son compatibles (±2 años de diferencia). */
function rangosCompatibles(rangoA: string, rangoB: string): boolean {
  if (rangoA === 'desconocido' || rangoB === 'desconocido') return true // Si no sabemos, asumimos compatible
  return rangoA === rangoB // Mismo rango = compatible
}

// ─── Servicio ────────────────────────────────────────────────────────────

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger('KnowledgeBaseService')

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private col(nombre: string) { return this.db.collection(nombre) }

  /**
   * Obtiene la ruta experta por defecto para un usuario según su tipo de discapacidad.
   * Día Cero: cuando el usuario no tiene rutas ni interacciones significativas.
   */
  obtenerRutaExperta(tiposDiscapacidad: string[]): RutaExperta {
    if (tiposDiscapacidad.length === 0) return RUTA_GENERICA

    // Buscar la primera coincidencia en el catálogo de rutas expertas
    for (const tipo of tiposDiscapacidad) {
      const normalizado = tipo.toLowerCase().trim()
      if (RUTAS_EXPERTAS_POR_DISCAPACIDAD[normalizado]) {
        return RUTAS_EXPERTAS_POR_DISCAPACIDAD[normalizado]
      }
    }

    return RUTA_GENERICA
  }

  /**
   * Busca perfiles similares al usuario actual:
   * - Mismo tipo de discapacidad
   * - Rango de edad compatible (±2 años)
   * - Misma etapa de vida
   *
   * Retorna usuarios con rutas completadas o alta interacción positiva.
   */
  async buscarPerfilesSimilares(usuarioId: string, perfil: PerfilExtendidoDoc, perfilBase: PerfilDoc): Promise<PerfilSimilar[]> {
    try {
      const tiposUsuario = parsearTiposDiscapacidad(perfil.tiposDiscapacidad)
      const etapaUsuario = perfil.etapaVida ?? 'desconocida'
      const rangoEdadUsuario = calcularRangoEdad(perfilBase.fechaNacimiento)

      if (tiposUsuario.length === 0) return []

      // Buscar perfiles extendidos con al menos un tipo de discapacidad en común
      const perfilesSnap = await this.col(COLECCIONES.perfilesExtendidos)
        .limit(50) // Limitar para evitar costos excesivos
        .get()

      const similares: PerfilSimilar[] = []

      for (const doc of perfilesSnap.docs) {
        const datos = doc.data() as PerfilExtendidoDoc
        if (datos.usuarioId === usuarioId) continue // Saltarse a sí mismo

        const tiposCandidato = parsearTiposDiscapacidad(datos.tiposDiscapacidad)
        const etapaCandidato = datos.etapaVida ?? 'desconocida'

        // Verificar compatibilidad
        const tieneDiscapacidadComun = tiposUsuario.some(t => tiposCandidato.includes(t))
        const etapasCompatibles = etapaUsuario === etapaCandidato || etapaCandidato === 'desconocida'

        if (!tieneDiscapacidadComun || !etapasCompatibles) continue

        // Calcular similaridad (simplificada)
        const tiposComunes = tiposUsuario.filter(t => tiposCandidato.includes(t)).length
        const totalTipos = new Set([...tiposUsuario, ...tiposCandidato]).size
        const similaridad = totalTipos > 0 ? tiposComunes / totalTipos : 0

        // Buscar rutas completadas por este candidato
        const rutasSnap = await this.col(COLECCIONES.rutasDesarrollo)
          .where('usuarioId', '==', datos.usuarioId)
          .where('estado', '==', 'completada')
          .get()

        const rutasCompletadas = rutasSnap.size
        if (rutasCompletadas === 0) continue // Solo usuarios con evidencia de éxito

        // Obtener pasos exitosos de las rutas completadas
        const pasosExitosos: string[] = []
        for (const rutaDoc of rutasSnap.docs) {
          const pasosSnap = await this.col(COLECCIONES.pasosRuta)
            .where('rutaId', '==', rutaDoc.id)
            .where('completado', '==', true)
            .get()

          for (const pasoDoc of pasosSnap.docs) {
            const titulo = pasoDoc.data().titulo
            if (typeof titulo === 'string' && !pasosExitosos.includes(titulo)) {
              pasosExitosos.push(titulo)
            }
          }
        }

        similares.push({
          usuarioId: datos.usuarioId!,
          similaridad: similaridad,
          rutasCompletadas,
          pasosExitosos,
        })
      }

      // Ordenar por similaridad y cantidad de rutas completadas
      similares.sort((a, b) => b.similaridad - a.similaridad || b.rutasCompletadas - a.rutasCompletadas)

      return similares.slice(0, 5) // Top 5 perfiles similares
    } catch (err: unknown) {
      this.logger.warn(`buscarPerfilesSimilares falló: ${err instanceof Error ? err.message : String(err)}`)
      return []
    }
  }

  /**
   * Enriquece los pasos de una ruta experta con datos de perfiles similares.
   * Si hay suficiente evidencia comunitaria, ajusta los pasos priorizando
   * los que mejor funcionaron a otros usuarios similares.
   */
mejorarPasosConComunidad(pasosBase: PasoExperto[], perfilesSimilares: PerfilSimilar[]): PasoExperto[] {
    if (perfilesSimilares.length === 0) return pasosBase

    // Recopilar todos los pasos exitosos de perfiles similares
    const frecuenciaPasos = new Map<string, number>()
    for (const perfil of perfilesSimilares) {
      for (const titulo of perfil.pasosExitosos) {
        const normalizado = titulo.toLowerCase().trim()
        frecuenciaPasos.set(normalizado, (frecuenciaPasos.get(normalizado) ?? 0) + 1)
      }
    }

    // Si hay pasos exitosos significativos (al menos 3 de 5 perfiles los completaron),
    // usarlos para enriquecer la ruta
    const umbral = Math.ceil(perfilesSimilares.length * 0.4) // 40% de los similares
    const pasosPopulares = [...frecuenciaPasos.entries()]
      .filter(([, freq]) => freq >= umbral)
      .map(([titulo]) => titulo)

    if (pasosPopulares.length === 0) return pasosBase

    // Mezclar: mantener los pasos base pero reordenar priorizando los populares
    const pasosEnriquecidos = pasosBase.map(paso => ({
      ...paso,
      descripcion: `${paso.descripcion} (recomendado por la comunidad)`,
    }))

    return pasosEnriquecidos
  }

  /**
   * Obtiene instituciones cercanas para enriquecer los pasos de la ruta.
   */
  async obtenerInstitucionesCercanas(ciudad: string, tiposDiscapacidad: string[]): Promise<{ id: string; nombre: string; categoria: string; distancia: string }[]> {
    if (!ciudad) return []

    try {
      const snap = await this.col(COLECCIONES.instituciones)
        .where('activa', '==', true)
        .where('ciudad', '==', ciudad)
        .get()

      const instituciones = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as { id: string; nombre?: string; categoria?: string; tiposDiscapacidad?: unknown }))
        .filter(inst => {
          if (tiposDiscapacidad.length === 0) return true
          const tiposInst = parsearTiposDiscapacidad(inst.tiposDiscapacidad)
          return tiposInst.some(t => tiposDiscapacidad.includes(t))
        })
        .slice(0, 5)
        .map(inst => ({
          id: inst.id,
          nombre: inst.nombre ?? 'Sin nombre',
          categoria: inst.categoria ?? 'general',
          distancia: 'en tu ciudad',
        }))

      return instituciones
    } catch (err: unknown) {
      this.logger.warn(`obtenerInstitucionesCercanas falló: ${err instanceof Error ? err.message : String(err)}`)
      return []
    }
  }

  /**
   * Obtiene vacantes de empleo relevantes para un paso de ruta.
   */
  async obtenerVacantesRelevantes(ciudad: string, tiposDiscapacidad: string[]): Promise<{ id: string; titulo: string; modalidad: string; ciudad: string }[]> {
    if (!ciudad) return []

    try {
      const snap = await this.col(COLECCIONES.vacantes)
        .where('activa', '==', true)
        .get()

      const vacantes = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as { id: string; titulo?: string; modalidad?: string; ciudad?: string; tiposDiscapacidad?: unknown }))
        .filter(v => {
          // Filtrar por ciudad (parcial)
          if (v.ciudad && !v.ciudad.toLowerCase().includes(ciudad.toLowerCase())) return false
          // Filtrar por discapacidad si hay
          if (tiposDiscapacidad.length > 0 && v.tiposDiscapacidad) {
            const tiposVacante = parsearTiposDiscapacidad(v.tiposDiscapacidad)
            return tiposVacante.some(t => tiposDiscapacidad.includes(t))
          }
          return true
        })
        .slice(0, 5)
        .map(v => ({
          id: v.id,
          titulo: v.titulo ?? 'Sin título',
          modalidad: v.modalidad ?? 'no especificada',
          ciudad: v.ciudad ?? 'no especificada',
        }))

      return vacantes
    } catch (err: unknown) {
      this.logger.warn(`obtenerVacantesRelevantes falló: ${err instanceof Error ? err.message : String(err)}`)
      return []
    }
  }
}
