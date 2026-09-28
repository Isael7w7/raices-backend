import { Injectable, Inject, Logger } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { parsearCampoJson } from '../../common/utils/firestore-helpers'
import {
  BorradorOnboardingDoc,
  DependienteDoc,
  PerfilDoc,
  PerfilExtendidoDoc,
} from '../../common/interfaces/firestore-documents.interface'
import { SaveDraftOnboardingDto } from './dto/save-draft-onboarding.dto'

/** Nombre de una sección obligatoria del onboarding (Diapositiva 1). */
export type SeccionOnboarding =
  | 'datosGenerales'
  | 'historialEducativo'
  | 'terapias'
  | 'perfilNecesidades'
  | 'escalasVida'
  | 'preferencias'
  | 'observacionesGenerales'

/**
 * Secciones obligatorias del onboarding y los campos del borrador que las
 * componen. El orden define `ultimoPasoCompletado` (paso = índice 1-based de
 * la última sección completada de forma consecutiva desde el inicio).
 *
 * Es la única fuente de verdad del progreso: agregar una sección aquí basta
 * para que aparezca en `pasosPendientes` y en el cálculo de porcentaje.
 */
export const SECCIONES_ONBOARDING: { clave: SeccionOnboarding; campos: (keyof SaveDraftOnboardingDto)[] }[] = [
  { clave: 'datosGenerales', campos: ['fechaNacimiento', 'curp', 'ciudad'] },
  { clave: 'historialEducativo', campos: ['historialEducacion', 'etapaVida'] },
  { clave: 'terapias', campos: ['historialTerapia', 'tieneDiagnostico'] },
  { clave: 'perfilNecesidades', campos: ['tiposDiscapacidad', 'necesidades', 'metasActuales'] },
  { clave: 'escalasVida', campos: ['escalasVida'] },
  { clave: 'preferencias', campos: ['preferenciasAcompanamiento', 'tonoContextual', 'areasInteres'] },
  { clave: 'observacionesGenerales', campos: ['observacionesGenerales'] },
]

/** Mapeo de perfiles.destinatarioRegistro → contrato del Frontend. */
const DESTINATARIO_POR_REGISTRO: Record<string, 'PARA_MI' | 'PARA_MI_HIJO'> = {
  para_mi: 'PARA_MI',
  para_hijo: 'PARA_MI_HIJO',
  para_familiar: 'PARA_MI_HIJO',
  para_cuidado: 'PARA_MI_HIJO',
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger('OnboardingService')

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private col(nombre: string) { return this.db.collection(nombre) }

  // ─── POST /onboarding/borrador · guardado parcial ─────────────────

  /**
   * Guardado parcial ("Quiero continuar después").
   *
   * 1. Lee el borrador previo del usuario/tutor y la base ya respondida en
   *    el perfil (perfiles + perfilesExtendidos).
   * 2. Fusión inteligente: solo los campos presentes en el payload
   *    (no null/undefined) sobrescriben; el resto se conserva intacto.
   * 3. Recalcula porcentajeProgreso, ultimoPasoCompletado,
   *    onboardingCompleto y pasosPendientes.
   *
   * Nunca valida campos faltantes: un payload parcial nunca produce 400.
   */
  async saveDraft(usuarioId: string, dto: SaveDraftOnboardingDto) {
    const [previo, base] = await Promise.all([
      this.leerBorrador(usuarioId),
      this.baseDesdePerfil(usuarioId),
    ])

    const borrador = this.fusionar(previo, dto)
    const vista = { ...base, ...borrador }
    const progreso = this.calcularProgreso(vista)

    const ahora = new Date().toISOString()
    const documento: BorradorOnboardingDoc = {
      id: usuarioId,
      usuarioId,
      ...borrador,
      ...progreso,
      fechaCreacion: previo.fechaCreacion ?? ahora,
      fechaActualizacion: ahora,
    }
    await this.col(COLECCIONES.borradoresOnboarding).doc(usuarioId).set(documento)

    return { borrador: vista, ...progreso }
  }

  // ─── GET /onboarding/estado ───────────────────────────────────────

  /**
   * Estado del onboarding para el Frontend: progreso + variables de
   * contexto (destinatarioPerfil y nombrePcd) derivadas de datos ya
   * existentes (perfiles.destinatarioRegistro, nombre del perfil o del
   * dependiente del tutor). Nunca lanza 500 por datos faltantes.
   */
  async obtenerEstado(usuarioId: string) {
    try {
      const [previo, base, perfil] = await Promise.all([
        this.leerBorrador(usuarioId),
        this.baseDesdePerfil(usuarioId),
        this.leerPerfil(usuarioId),
      ])

      const vista = { ...base, ...this.fusionar(previo, {}) }
      const progreso = this.calcularProgreso(vista)
      const destinatarioPerfil = this.destinatarioPerfil(perfil)
      const nombrePcd = await this.nombrePcd(usuarioId, perfil, destinatarioPerfil)

      return { ...progreso, destinatarioPerfil, nombrePcd }
    } catch (err: unknown) {
      // Firestore inaccesible o colección nueva sin crear: el estado nunca
      // debe romper el onboarding; se responde "sin avanzar" para reintentar.
      this.logger.warn(`obtenerEstado falló para usuario ${usuarioId}: ${err instanceof Error ? err.message : String(err)}`)
      return {
        onboardingCompleto: false,
        porcentajeProgreso: 0,
        ultimoPasoCompletado: 0,
        destinatarioPerfil: 'PARA_MI',
        nombrePcd: null,
        pasosPendientes: SECCIONES_ONBOARDING.map(s => s.clave),
      }
    }
  }

  // ─── Fusión (merge) ───────────────────────────────────────────────

  /**
   * Combina el borrador previo con el payload: cada campo presente en el
   * payload (distinto de null/undefined) sobrescribe; los campos ausentes
   * o anulados conservan el valor previo. Nunca propaga campos desconocidos.
   */
  private fusionar(previo: BorradorOnboardingDoc, dto: Partial<SaveDraftOnboardingDto>): Record<string, unknown> {
    const resultado: Record<string, unknown> = {}
    for (const seccion of SECCIONES_ONBOARDING) {
      for (const campo of seccion.campos) {
        const anterior = (previo as Record<string, unknown>)[campo]
        if (anterior !== undefined && anterior !== null) resultado[campo] = anterior

        const nuevo = (dto as Record<string, unknown>)[campo]
        if (nuevo !== undefined && nuevo !== null) resultado[campo] = nuevo
      }
    }
    return resultado
  }

  // ─── Progreso ─────────────────────────────────────────────────────

  /**
   * Recalcula el progreso a partir de la vista combinada (perfil + borrador):
   *
   * - porcentajeProgreso: campos respondidos / campos totales (0-100).
   * - seccionCompletada: todos los campos de la sección respondidos
   *   (un false explícito, p.ej. tieneDiagnostico, cuenta como respondido).
   * - ultimoPasoCompletado: índice (1-based) de la última sección
   *     completada de forma consecutiva desde el inicio; 0 si ninguna.
   * - pasosPendientes: claves de las secciones incompletas.
   * - onboardingCompleto: true solo cuando no queda nada pendiente.
   */
  private calcularProgreso(vista: Record<string, unknown>) {
    let camposRespondidos = 0
    let camposTotales = 0
    let ultimoPasoCompletado = 0
    let consecucionRota = false
    const pasosPendientes: SeccionOnboarding[] = []

    for (const seccion of SECCIONES_ONBOARDING) {
      const completada = seccion.campos.every(c => this.campoRespondido(vista[c]))
      camposTotales += seccion.campos.length
      camposRespondidos += seccion.campos.filter(c => this.campoRespondido(vista[c])).length

      if (completada && !consecucionRota) {
        ultimoPasoCompletado++
      } else if (!completada) {
        consecucionRota = true
        pasosPendientes.push(seccion.clave)
      }
    }

    return {
      onboardingCompleto: pasosPendientes.length === 0,
      porcentajeProgreso: camposTotales > 0 ? Math.round((camposRespondidos / camposTotales) * 100) : 0,
      ultimoPasoCompletado,
      pasosPendientes,
    }
  }

  /** Un campo se considera respondido si trae contenido real. `false` sí cuenta. */
  private campoRespondido(valor: unknown): boolean {
    if (valor === undefined || valor === null) return false
    if (typeof valor === 'boolean') return true
    if (typeof valor === 'string') return valor.trim().length > 0
    if (Array.isArray(valor)) return valor.length > 0
    if (typeof valor === 'object') return Object.keys(valor).length > 0
    return true
  }

  // ─── Lecturas defensivas (nunca lanzan) ───────────────────────────

  /** Borrador previo del usuario; {} si no existe o falla la lectura. */
  private async leerBorrador(usuarioId: string): Promise<BorradorOnboardingDoc> {
    try {
      const snap = await this.col(COLECCIONES.borradoresOnboarding).doc(usuarioId).get()
      return snap.exists ? (snap.data() as BorradorOnboardingDoc) : {}
    } catch (err: unknown) {
      this.logger.warn(`leerBorrador falló para ${usuarioId}: ${err instanceof Error ? err.message : String(err)}`)
      return {}
    }
  }

  /** Perfil base del usuario; null si no existe o falla. */
  private async leerPerfil(usuarioId: string): Promise<PerfilDoc | null> {
    try {
      const snap = await this.col(COLECCIONES.perfiles).doc(usuarioId).get()
      return snap.exists ? (snap.data() as PerfilDoc) : null
    } catch (err: unknown) {
      this.logger.warn(`leerPerfil falló para ${usuarioId}: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }

  /**
   * Base de respuestas ya existentes en el perfil (registro + perfil de
   * necesidades), para que el progreso refleje también lo contestado fuera
   * del borrador. Nunca lanza.
   */
  private async baseDesdePerfil(usuarioId: string): Promise<Record<string, unknown>> {
    try {
      const [perfilSnap, extSnap] = await Promise.all([
        this.col(COLECCIONES.perfiles).doc(usuarioId).get(),
        this.col(COLECCIONES.perfilesExtendidos).where('usuarioId', '==', usuarioId).limit(1).get(),
      ])
      const perfil = perfilSnap.exists ? (perfilSnap.data() as PerfilDoc) : null
      const ext = extSnap.empty ? null : (extSnap.docs[0].data() as PerfilExtendidoDoc)

      const base: Record<string, unknown> = {}
      if (perfil) {
        if (perfil.fechaNacimiento) base.fechaNacimiento = perfil.fechaNacimiento
        if (perfil.curp) base.curp = perfil.curp
        if (perfil.ciudad) base.ciudad = perfil.ciudad
      }
      if (ext) {
        this.asignarArreglo(base, 'historialEducacion', ext.historialEducacion)
        this.asignarArreglo(base, 'tiposDiscapacidad', ext.tiposDiscapacidad)
        this.asignarArreglo(base, 'necesidades', ext.necesidades)
        this.asignarArreglo(base, 'metasActuales', ext.metasActuales)
        this.asignarArreglo(base, 'areasInteres', ext.areasInteres)
        if (ext.historialTerapia) {
          const terapias = parsearCampoJson(ext.historialTerapia)
          if (Array.isArray(terapias) && terapias.length > 0) base.historialTerapia = terapias
        }
        if (ext.etapaVida) base.etapaVida = ext.etapaVida
        if (ext.escalasVida && Object.keys(ext.escalasVida).length > 0) base.escalasVida = ext.escalasVida
        if (ext.tieneDiagnostico !== undefined && ext.tieneDiagnostico !== null) base.tieneDiagnostico = ext.tieneDiagnostico
      }
      return base
    } catch (err: unknown) {
      this.logger.warn(`baseDesdePerfil falló para ${usuarioId}: ${err instanceof Error ? err.message : String(err)}`)
      return {}
    }
  }

  /** Asigna un campo del perfil extendido (string JSON o array) solo si tiene contenido. */
  private asignarArreglo(destino: Record<string, unknown>, campo: string, valor: unknown): void {
    const parseado = parsearCampoJson(valor)
    if (Array.isArray(parseado) && parseado.length > 0 && parseado.every(v => typeof v === 'string')) {
      destino[campo] = parseado
    }
  }

  // ─── Variables de contexto (Diapositiva 1) ────────────────────────

  /**
   * destinatarioPerfil a partir de perfiles.destinatarioRegistro:
   * para_mi → PARA_MI; cualquier otro destinatario (hijo, familiar,
   * cuidado) → PARA_MI_HIJO. Sin dato, se infiere del rol.
   */
  private destinatarioPerfil(perfil: PerfilDoc | null): 'PARA_MI' | 'PARA_MI_HIJO' {
    const registro = perfil?.destinatarioRegistro
    if (registro && DESTINATARIO_POR_REGISTRO[registro]) return DESTINATARIO_POR_REGISTRO[registro]
    if (registro === 'para_mi') return 'PARA_MI'
    if (registro) return 'PARA_MI_HIJO'
    // Sin destinatario registrado: el rol del dueño de la cuenta indica si
    // el perfil es propio (pcd) o de un tercero (padre_tutor/tutor).
    if (perfil?.rol === 'padre_tutor' || perfil?.rol === 'tutor') return 'PARA_MI_HIJO'
    return 'PARA_MI'
  }

  /**
   * nombrePcd (ej. "Diego"):
   * - PARA_MI → nombre del propio usuario.
   * - PARA_MI_HIJO → nombre del primer dependiente del tutor (preferiendo
   *   la cuenta PCD vinculada); null si aún no existe.
   * Nunca lanza.
   */
  private async nombrePcd(
    usuarioId: string,
    perfil: PerfilDoc | null,
    destinatarioPerfil: 'PARA_MI' | 'PARA_MI_HIJO',
  ): Promise<string | null> {
    if (destinatarioPerfil === 'PARA_MI') return perfil?.nombreCompleto ?? null
    try {
      const snap = await this.col(COLECCIONES.dependientes).where('tutorId', '==', usuarioId).get()
      const dependientes = snap.docs.map(d => d.data() as DependienteDoc)
      const vinculada = dependientes.find(d => d.esCuentaVinculada || d.pcdUserId)
      const elegido = vinculada ?? dependientes[0]
      return elegido?.nombreCompleto ?? perfil?.nombreCompleto ?? null
    } catch (err: unknown) {
      this.logger.warn(`nombrePcd falló para ${usuarioId}: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }
}
