import { Injectable, Inject, Logger } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { parsearCampoJson, parsearTiposDiscapacidad } from '../../common/utils/firestore-helpers'
import { InstitucionDoc, InteraccionDoc, PerfilExtendidoDoc, PerfilDoc, EspecialistaDoc } from '../../common/interfaces/firestore-documents.interface'
import { RegistrarInteraccionDto, TipoInteraccion } from './dto/registrar-interaccion.dto'
import { InstitucionRecomendadaDto } from './dto/respuestas-recomendaciones.dto'

/** Las 8 escalas de la evaluación "Cómo vives hoy" (Spec MVP Raíces). */
const CLAVES_ESCALAS_VIDA = [
  'autonomia',
  'independencia',
  'comunicacion',
  'comprension',
  'energia',
  'movilidad',
  'social',
  'emocional',
] as const

/** Ventana de comportamiento para los pesos (días) */
const VENTANA_DIAS = 30

/** Puntos por tipo de interacción */
const PUNTOS_POR_TIPO: Record<TipoInteraccion, number> = {
  guardar: 10,
  ver_detalle: 5,
  click_card: 2,
}

/** Ponderadores del score final */
const PESO_INTERESES = 0.6
const PESO_COMPORTAMIENTO = 0.4

/** Resultado con scores de una institución para el usuario */
type Recomendacion = InstitucionDoc & {
  id: string
  score_intereses: number
  score_comportamiento: number
  final_score: number
}

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger('RecommendationsService')

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private col(nombre: string) { return this.db.collection(nombre) }

  // ─── FASE 1: registrar interacción ─────────────────────────────────
  async registrar(usuarioId: string, dto: RegistrarInteraccionDto) {
    const ref = this.col(COLECCIONES.interacciones).doc()
    const documento: Omit<InteraccionDoc, 'id'> & { id: string } = {
      id: ref.id,
      usuarioId,
      institucionId: dto.institucionId,
      tipo: dto.tipo,
      categoria: dto.categoria ?? null,
      // ISO string por consistencia con el resto del proyecto (fechaCreacion):
      // comparable lexicográficamente y serializable sin pérdida.
      createdAt: new Date().toISOString(),
    }
    await ref.set(documento)
    return { exito: true, id: ref.id, mensaje: 'Interacción registrada' }
  }

  // ─── FASE 2: pesos de comportamiento por categoría (30 días) ───────
  async pesos(usuarioId: string): Promise<Record<string, number>> {
    try {
      const limite = new Date(Date.now() - VENTANA_DIAS * 24 * 60 * 60 * 1000).toISOString()

      const snap = await this.col(COLECCIONES.interacciones)
        .where('usuarioId', '==', usuarioId)
        .where('createdAt', '>=', limite)
        .get()

      return this.calcularPesos(snap.docs.map(d => d.data() as InteraccionDoc))
    } catch (err: any) {
      // Colección inexistente, índice compuesto pendiente o error transitorio:
      // la ausencia de interacciones nunca debe romper el endpoint → pesos vacíos.
      this.logger.warn(`pesos falló para usuario ${usuarioId}: ${err?.message ?? err}`)
      return {}
    }
  }

  /** Agrupa en memoria los puntos por categoría. Privado: reutilizado por `recomendaciones`. */
  private calcularPesos(interacciones: InteraccionDoc[]): Record<string, number> {
    const pesos: Record<string, number> = {}
    for (const inter of interacciones) {
      if (!inter.categoria) continue
      const puntos = PUNTOS_POR_TIPO[inter.tipo as TipoInteraccion] ?? 0
      pesos[inter.categoria] = (pesos[inter.categoria] ?? 0) + puntos
    }
    return pesos
  }

  // ─── FASE 2: recomendaciones personalizadas ────────────────────────
  async recomendaciones(usuarioId: string, pagina = 1, limite = 20) {
    try {
      // Cada fuente de datos se lee de forma defensiva (nunca lanza): un usuario
      // recién registrado puede no tener perfil extendido ni interacciones, y las
      // colecciones pueden estar vacías o fallar transitoriamente.
      const [perfil, pesos, instituciones] = await Promise.all([
        this.obtenerPerfilExtendido(usuarioId),
        this.pesos(usuarioId),
        this.obtenerInstitucionesActivas(),
      ])

      // Null-Safety sobre el perfil: el documento puede no existir, venir como
      // objeto anidado `perfilNecesidades` (compatibilidad con getProfile) o
      // traer campos null/undefined → se normaliza con fallbacks neutros.
      const necesidades = this.leerObjeto((perfil as Record<string, any>).perfilNecesidades)
      const metas = this.leerArregloDeTexto(perfil.metasActuales ?? necesidades.metasActuales)
      const areasInteres = this.leerArregloDeTexto(perfil.areasInteres ?? necesidades.areasInteres)
      // escalasVida: si no existe el documento o algún valor es null/undefined,
      // se asignan valores neutros (0) en lugar de leer propiedades de undefined.
      const escalasVida = this.normalizarEscalasVida(perfil.escalasVida ?? necesidades.escalasVida)

      const maxPeso = Math.max(0, ...Object.values(pesos))

      const puntuadas: Recomendacion[] = instituciones
        .map(inst => {
          const scoreIntereses = this.scoreDeIntereses(metas, areasInteres, escalasVida, inst)
          const scoreComportamiento = maxPeso > 0 ? ((pesos[inst.categoria ?? ''] ?? 0)) / maxPeso : 0
          return {
            ...inst,
            score_intereses: redondear(scoreIntereses),
            score_comportamiento: redondear(scoreComportamiento),
            final_score: redondear(scoreIntereses * PESO_INTERESES + scoreComportamiento * PESO_COMPORTAMIENTO),
          }
        })

      puntuadas.sort((a, b) => b.final_score - a.final_score)

      pagina = Math.max(1, Number(pagina) || 1)
      limite = Math.min(50, Math.max(1, Number(limite) || 20))
      const total = puntuadas.length
      const inicio = (pagina - 1) * limite

      return {
        datos: puntuadas.slice(inicio, inicio + limite),
        paginacion: {
          total,
          pagina,
          limite,
          totalPaginas: Math.ceil(total / limite),
        },
      }
    } catch (err: any) {
      // Última red de seguridad: nunca responder 500 por datos faltantes o
      // errores esperados; se devuelve una página vacía estructurada.
      this.logger.error(`recomendaciones falló para usuario ${usuarioId}: ${err?.message ?? err}`, err?.stack)
      pagina = Math.max(1, Number(pagina) || 1)
      limite = Math.min(50, Math.max(1, Number(limite) || 20))
      return {
        datos: [],
        paginacion: { total: 0, pagina, limite, totalPaginas: 0 },
      }
    }
  }

  /** Perfil extendido del usuario; nunca lanza. Si no existe o falla, retorna {} (perfil vacío). */
  private async obtenerPerfilExtendido(usuarioId: string): Promise<PerfilExtendidoDoc> {
    try {
      const snap = await this.col(COLECCIONES.perfilesExtendidos)
        .where('usuarioId', '==', usuarioId).limit(1).get()
      return (snap.empty ? {} : snap.docs[0].data()) as PerfilExtendidoDoc
    } catch (err: any) {
      this.logger.warn(`obtenerPerfilExtendido falló para usuario ${usuarioId}: ${err?.message ?? err}`)
      return {}
    }
  }

  /** Instituciones activas; nunca lanza. Si la consulta falla, retorna lista vacía. */
  private async obtenerInstitucionesActivas(): Promise<(InstitucionDoc & { id: string })[]> {
    try {
      const snap = await this.col(COLECCIONES.instituciones).where('activa', '==', true).get()
      return snap.docs.map(d => ({ id: d.id, ...d.data() })) as (InstitucionDoc & { id: string })[]
    } catch (err: any) {
      this.logger.warn(`obtenerInstitucionesActivas falló: ${err?.message ?? err}`)
      return []
    }
  }

  /**
   * Parsea un campo a string[] de forma segura (Null-Safety):
   * null/undefined → [], arrays → solo strings no vacíos, strings JSON válidos
   * (arrays) se parsean; JSON inválido u otros tipos → [] (nunca rompe).
   */
  private leerArregloDeTexto(valor: any): string[] {
    if (valor == null) return []
    const arr = typeof valor === 'string' ? parsearCampoJson(valor) : valor
    if (!Array.isArray(arr)) return []
    return arr
      .filter((t: any) => typeof t === 'string' && t.trim().length > 0)
      .map((t: string) => t.trim())
  }

  /** Parsea un objeto que puede venir como JSON string, objeto nativo o null. Nunca lanza. */
  private leerObjeto(valor: any): Record<string, any> {
    if (valor == null) return {}
    const obj = typeof valor === 'string'
      ? (() => { try { return JSON.parse(valor) ?? {} } catch { return {} } })()
      : valor
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {}
  }

  /**
   * Normaliza escalasVida (8 escalas) con valores por defecto neutros (0):
   * si el documento no existe o los valores son null/undefined, se usa 0 en
   * lugar de intentar leer propiedades de undefined. Acepta strings numéricos.
   */
  private normalizarEscalasVida(valor: any): Record<string, number> {
    const base: Record<string, number> = {}
    for (const clave of CLAVES_ESCALAS_VIDA) base[clave] = 0
    const obj = this.leerObjeto(valor)
    for (const clave of CLAVES_ESCALAS_VIDA) {
      const v = obj[clave]
      const num = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN)
      if (Number.isFinite(num)) base[clave] = num
    }
    return base
  }

  /**
   * Score de coincidencia entre los intereses/metas del perfil y una institución.
   * Cada token de interés/meta presente en el texto de la institución suma;
   * se normaliza dividiendo entre el número de tokens.
   *
   * Cuando el usuario no definió metas/áreas pero sí completó escalasVida,
   * las escalas con nivel ≤ 2 (mayor necesidad de apoyo) aportan tokens
   * genéricos de interés; si todo son defaults neutros (0, usuario nuevo),
   * no aportan nada y el score queda en 0 sin romper la ejecución.
   */
  private scoreDeIntereses(metas: string[], areasInteres: string[], escalasVida: Record<string, number>, inst: InstitucionDoc): number {
    const tokensEscalas = Object.entries(escalasVida)
      .filter(([, nivel]) => nivel > 0 && nivel <= 2)
      .map(([nombre]) => nombre)

    const tokens = [...metas, ...areasInteres, ...tokensEscalas]
      .filter(t => typeof t === 'string' && t.trim().length > 0)
      .map(t => t.trim().toLowerCase())

    if (tokens.length === 0) return 0

    const textoInstitucion = [
      inst.nombre,
      inst.descripcion,
      inst.categoria,
      ...this.leerArregloDeTexto(inst.servicios),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    const coincidencias = tokens.filter(token => textoInstitucion.includes(token)).length
    return coincidencias / tokens.length
  }

  // ─── REVELACIÓN PROGRESIVA ────────────────────────────────────────

  /**
   * Evalúa si el usuario ha completado el onboarding obligatorio.
   * Retorna un objeto con el estado de completitud y campos faltantes.
   */
  async verificarOnboarding(usuarioId: string) {
    const perfilSnap = await this.col(COLECCIONES.perfiles).doc(usuarioId).get()
    if (!perfilSnap.exists) {
      return { onboardingCompleto: false, camposFaltantes: ['perfil'], porcentaje: 0 }
    }
    const perfil = perfilSnap.data() as PerfilDoc
    const camposRequeridos: string[] = []
    const camposCompletados: string[] = []

    // Campos obligatorios del perfil base
    if (perfil.nombreCompleto) camposCompletados.push('nombreCompleto')
    else camposRequeridos.push('nombreCompleto')

    if (perfil.fechaNacimiento) camposCompletados.push('fechaNacimiento')
    else camposRequeridos.push('fechaNacimiento')

    if (perfil.curp) camposCompletados.push('curp')
    else camposRequeridos.push('curp')

    // Para PCD: verificar perfil de necesidades
    if (perfil.rol === 'pcd') {
      const extSnap = await this.col(COLECCIONES.perfilesExtendidos)
        .where('usuarioId', '==', usuarioId).limit(1).get()
      if (!extSnap.empty) {
        const ext = extSnap.docs[0].data() as PerfilExtendidoDoc
        if (ext.tiposDiscapacidad) camposCompletados.push('tiposDiscapacidad')
        else camposRequeridos.push('tiposDiscapacidad')

        if (ext.tieneDiagnostico !== undefined && ext.tieneDiagnostico !== null) camposCompletados.push('tieneDiagnostico')
        else camposRequeridos.push('tieneDiagnostico')
      } else {
        camposRequeridos.push('perfilNecesidades')
      }

      // Verificar certificado de discapacidad
      const tieneCert = perfil.certificadoDiscapacidad === true
      if (tieneCert) camposCompletados.push('certificadoDiscapacidad')
      else camposRequeridos.push('certificadoDiscapacidad')
    }

    // Para padre_tutor: verificar acreditación
    if (perfil.rol === 'padre_tutor' || perfil.rol === 'tutor') {
      if (perfil.estadoAcreditacionTutor === 'aprobado') camposCompletados.push('acreditacionTutor')
      else camposRequeridos.push('acreditacionTutor')
    }

    const total = camposRequeridos.length + camposCompletados.length
    const porcentaje = total > 0 ? Math.round((camposCompletados.length / total) * 100) : 0

    return {
      onboardingCompleto: camposRequeridos.length === 0,
      camposFaltantes: camposRequeridos,
      porcentaje,
    }
  }

  // ─── RECOMENDACIÓN DE ESPECIALISTAS ───────────────────────────────

  /**
   * Recomienda especialistas individuales basándose en la edad, condición
   * y ubicación/modalidad de la PCD.
   */
  async especialistasRecomendados(usuarioId: string, pagina = 1, limite = 20) {
    // 1. Obtener perfil del usuario y perfil extendido
    const [perfilSnap, extSnap] = await Promise.all([
      this.col(COLECCIONES.perfiles).doc(usuarioId).get(),
      this.col(COLECCIONES.perfilesExtendidos)
        .where('usuarioId', '==', usuarioId).limit(1).get(),
    ])

    if (!perfilSnap.exists) {
      return { datos: [], paginacion: { total: 0, pagina: 1, limite, totalPaginas: 0 } }
    }

    const perfil = perfilSnap.data() as PerfilDoc
    const perfilExt = extSnap.empty ? {} : extSnap.docs[0].data() as PerfilExtendidoDoc

    // 2. Calcular edad de la PCD
    let edad: number | null = null
    if (perfil.fechaNacimiento) {
      const nac = new Date(perfil.fechaNacimiento)
      const hoy = new Date()
      edad = hoy.getFullYear() - nac.getFullYear() - (
        (hoy.getMonth() < nac.getMonth() || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())) ? 1 : 0
      )
    }

    // 3. Obtener tipos de discapacidad del perfil extendido
    const tiposDiscapacidad = parsearTiposDiscapacidad(perfilExt.tiposDiscapacidad)

    // 4. Obtener todos los especialistas activos
    const especialistasSnap = await this.col(COLECCIONES.especialistas)
      .where('activo', '==', true).get()

    const todosEspecialistas: (EspecialistaDoc & { id: string })[] =
      especialistasSnap.docs.map(d => ({ id: d.id, ...d.data() }))

    // 5. Calcular score de matching para cada especialista
    const puntuados = todosEspecialistas.map(esp => {
      let score = 0
      let totalFactores = 0

      // Factor 1: Coincidencia de tipos de discapacidad (peso: 0.4)
      if (tiposDiscapacidad.length > 0) {
        const espTipos = parsearTiposDiscapacidad(esp.tiposDiscapacidad)
        const coincide = tiposDiscapacidad.some(td => espTipos.includes(td))
        if (coincide) score += 0.4
        totalFactores += 0.4
      }

      // Factor 2: Rango de edad (peso: 0.3)
      if (edad !== null) {
        const edadMin = esp.edadMinima ?? 0
        const edadMax = esp.edadMaxima ?? 99
        if (edad >= edadMin && edad <= edadMax) {
          score += 0.3
        }
        totalFactores += 0.3
      }

      // Factor 3: Calificación promedio (peso: 0.2)
      if ((esp.calificacionPromedio ?? 0) > 0) {
        score += 0.2 * ((esp.calificacionPromedio ?? 0) / 5)
      }
      totalFactores += 0.2

      // Factor 4: Ubicación/Modalidad (peso: 0.1)
      if (esp.ciudad && perfil.estado && esp.ciudad.toLowerCase() === perfil.ciudad?.toLowerCase()) {
        score += 0.1
      } else if (esp.modalidad === 'virtual' || esp.modalidad === 'en_linea') {
        score += 0.05 // Bonus por virtual (sin restricción geográfica)
      }
      totalFactores += 0.1

      const finalScore = totalFactores > 0 ? Math.round((score / totalFactores) * 1000) / 1000 : 0

      return {
        ...esp,
        score_edad: edad !== null && (edad >= (esp.edadMinima ?? 0) && edad <= (esp.edadMaxima ?? 99)) ? 1 : 0,
        score_discapacidad: tiposDiscapacidad.length > 0 && tiposDiscapacidad.some(td => parsearTiposDiscapacidad(esp.tiposDiscapacidad).includes(td)) ? 1 : 0,
        final_score: finalScore,
      }
    })

    // 6. Ordenar por final_score descendente
    puntuados.sort((a, b) => b.final_score - a.final_score)

    // 7. Paginar
    pagina = Math.max(1, Number(pagina) || 1)
    limite = Math.min(50, Math.max(1, Number(limite) || 20))
    const total = puntuados.length
    const inicio = (pagina - 1) * limite

    return {
      datos: puntuados.slice(inicio, inicio + limite),
      paginacion: {
        total,
        pagina,
        limite,
        totalPaginas: Math.ceil(total / limite),
      },
    }
  }
}

function redondear(valor: number): number {
  return Math.round(valor * 1000) / 1000
}
