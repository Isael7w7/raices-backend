import { Injectable, Inject, Logger } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { parsearCampoJson } from '../../common/utils/firestore-helpers'
import { ETagInterceptor } from '../../common/interceptors/etag.interceptor'
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
 * Definición de una sección del onboarding: los campos que la completan, su
 * etiqueta amigable para la UI y los campos opcionales que se guardan pero
 * NO bloquean el avance.
 */
export interface SeccionOnboardingConfig {
  /** Clave técnica interna (navegación del Frontend; no se muestra en pantalla). */
  clave: SeccionOnboarding
  /** Etiqueta en lenguaje natural que la UI muestra al usuario. */
  etiqueta: string
  /** Campos obligatorios: mientras falte uno, la sección queda pendiente. */
  campos: (keyof SaveDraftOnboardingDto)[]
  /** Campos que se guardan si vienen, pero nunca bloquean el 100%. */
  camposOpcionales?: (keyof SaveDraftOnboardingDto)[]
}

/**
 * Sección pendiente con etiqueta amigable (contrato de `seccionesFaltantes`).
 * `clave` se mantiene solo para que el Frontend pueda navegar al paso
 * correspondiente; el texto que se muestra al usuario es `etiqueta`.
 */
export interface SeccionFaltante {
  clave: SeccionOnboarding
  etiqueta: string
  camposFaltantes: string[]
}

/**
 * Secciones obligatorias del onboarding y los campos del borrador que las
 * componen. El orden define `ultimoPasoCompletado` (paso = índice 1-based de
 * la última sección completada de forma consecutiva desde el inicio).
 *
 * Es la única fuente de verdad del progreso: agregar una sección aquí basta
 * para que aparezca en `pasosPendientes` y en el cálculo de porcentaje.
 *
 * Una sección con `campos: []` (solo opcionales) nunca queda pendiente: se
 * guarda si el usuario la responde, pero no bloquea el cierre del onboarding.
 * Esto evita el bucle del modal "Completa tu perfil" cuando un campo libre
 * (p. ej. observaciones) queda vacío.
 */
export const SECCIONES_ONBOARDING: SeccionOnboardingConfig[] = [
  { clave: 'datosGenerales', etiqueta: 'Datos generales', campos: ['fechaNacimiento', 'curp', 'ciudad'] },
  {
    clave: 'historialEducativo',
    etiqueta: 'Historial educativo y etapa de vida',
    campos: ['historialEducacion', 'etapaVida'],
  },
  { clave: 'terapias', etiqueta: 'Terapias y diagnóstico', campos: ['historialTerapia', 'tieneDiagnostico'] },
  { clave: 'perfilNecesidades', etiqueta: 'Perfil de necesidades', campos: ['tiposDiscapacidad', 'necesidades', 'metasActuales'] },
  { clave: 'escalasVida', etiqueta: 'Escalas de vida', campos: ['escalasVida'] },
  {
    clave: 'preferencias',
    etiqueta: 'Preferencias de acompañamiento',
    campos: ['preferenciasAcompanamiento', 'tonoContextual', 'areasInteres'],
  },
  {
    clave: 'observacionesGenerales',
    etiqueta: 'Observaciones generales (opcional)',
    campos: [],
    camposOpcionales: ['observacionesGenerales'],
  },
]

/** Secciones con campos obligatorios: las que realmente gobiernan el progreso. */
export const SECCIONES_BLOQUEANTES = SECCIONES_ONBOARDING.filter(s => s.campos.length > 0)

/**
 * Lista de campos OBLIGATORIOS del rol Tutor: únicamente los que el wizard
 * del Tutor (`TutorProfileWizard`) recopila y que este servicio persiste.
 * Los campos `historialEducacion`, `tieneDiagnostico`, `tiposDiscapacidad`,
 * `tonoContextual` y `areasInteres` pertenecen al formulario PCD: exigírselos
 * al Tutor hacía matemáticamente imposible el 100% y el modal "Completa tu
 * perfil" reaparecía en bucle (13% / 70%).
 *
 * La regla del rol PCD sigue usando `SECCIONES_ONBOARDING`, intacta.
 */
export const SECCIONES_ONBOARDING_TUTOR: SeccionOnboardingConfig[] = [
  { clave: 'datosGenerales', etiqueta: 'Datos generales', campos: ['fechaNacimiento', 'curp', 'ciudad'] },
  {
    clave: 'historialEducativo',
    etiqueta: 'Historial educativo y etapa de vida',
    campos: ['etapaVida'],
  },
  {
    clave: 'preferencias',
    etiqueta: 'Preferencias de acompañamiento',
    campos: ['preferenciasAcompanamiento'],
  },
  {
    clave: 'observacionesGenerales',
    etiqueta: 'Observaciones generales (opcional)',
    campos: [],
    camposOpcionales: ['observacionesGenerales'],
  },
]

/** Todos los campos del formulario (obligatorios + opcionales), sin duplicados. */
export const CAMPOS_ONBOARDING = [
  ...new Set(SECCIONES_ONBOARDING.flatMap(s => [...s.campos, ...(s.camposOpcionales ?? [])])),
] as (keyof SaveDraftOnboardingDto)[]

/**
 * Campos del borrador que se promovem a `perfilesExtendidos` como string JSON
 * (mismo formato que escribe `UsersService.saveProfilingData`).
 */
const CAMPOS_PERFIL_EXTENDIDO_ARRAYS = [
  'historialEducacion',
  'historialTerapia',
  'tiposDiscapacidad',
  'necesidades',
  'metasActuales',
  'areasInteres',
] as const

/** Campos del borrador que se promovem a `perfilesExtendidos` como texto plano. */
const CAMPOS_PERFIL_EXTENDIDO_TEXTO = ['etapaVida', 'tonoContextual', 'observacionesGenerales'] as const

/** Resultado del cálculo de progreso (compartido por estado, borrador y cierre). */
export interface ProgresoOnboarding {
  onboardingCompleto: boolean
  porcentajeProgreso: number
  ultimoPasoCompletado: number
  pasosPendientes: SeccionOnboarding[]
  seccionesFaltantes: SeccionFaltante[]
}

/**
 * Las 3 etapas de navegación del ecosistema Raíces (Sidebar) y los módulos
 * del menú lateral que habilita cada una.
 *
 * Solo la Etapa 1 tiene progreso real hoy (onboarding). Las Etapas 2 y 3
 * quedan en 0% hasta que existan sus módulos (rutinas/terapias y caminos/
 * oportunidades/comunidad); el desbloqueo está encadenado: la etapa N se
 * desbloquea cuando la etapa N-1 está completada.
 */
export const ETAPAS_ONBOARDING = [
  { clave: 'etapa1', nombre: 'Conocer quién eres', modulos: ['inicio', 'perfil_pcd'] },
  { clave: 'etapa2', nombre: 'Conocer tu día a día', modulos: ['terapias', 'rutinas'] },
  { clave: 'etapa3', nombre: 'Reconocer tus logros e intereses', modulos: ['caminos', 'oportunidades', 'comunidad'] },
] as const

export type ClaveEtapa = (typeof ETAPAS_ONBOARDING)[number]['clave']

/** Estado de navegación de una etapa (contrato del Frontend). */
export interface EstadoEtapa {
  nombre: string
  completada: boolean
  desbloqueada: boolean
  porcentaje: number
}

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
   * Guardado parcial ("Quiero continuar después" / autoguardado por paso).
   *
   * 1. Lee el borrador previo del usuario/tutor y la base ya respondida en
   *    el perfil (perfiles + perfilesExtendidos).
   * 2. Fusión inteligente: solo los campos presentes en el payload
   *    (no null/undefined) sobrescriben; el resto se conserva intacto.
   * 3. Recalcula porcentajeProgreso, ultimoPasoCompletado,
   *    onboardingCompleto, pasosPendientes y seccionesFaltantes.
   * 4. UPSERT con `{ merge: true }`: refrescar la pantalla o cambiar de paso
   *    nunca borra respuestas ya guardadas.
   * 5. Invalida la caché ETag del usuario para que la siguiente lectura
   *    (GET /onboarding/estado, GET /usuarios/perfil) ya devuelva el avance.
   *
   * Nunca valida campos faltantes: un payload parcial nunca produce 400.
   */
  async saveDraft(usuarioId: string, dto: SaveDraftOnboardingDto) {
    const [previo, base, perfil] = await Promise.all([
      this.leerBorrador(usuarioId),
      this.baseDesdePerfil(usuarioId),
      this.leerPerfil(usuarioId),
    ])

    const borrador = this.fusionar(previo, dto)
    const vista = { ...base, ...borrador }
    const progreso = this.calcularProgreso(vista, {
      rol: perfil?.rol,
      cierreExplicito: this.cierreConfirmado(previo, perfil),
    })

    const ahora = new Date().toISOString()
    const documento: BorradorOnboardingDoc = {
      id: usuarioId,
      usuarioId,
      ...borrador,
      ...progreso,
      fechaCreacion: previo.fechaCreacion ?? ahora,
      fechaActualizacion: ahora,
    }
    await this.col(COLECCIONES.borradoresOnboarding).doc(usuarioId).set(documento, { merge: true })

    // Sin esto, GET /onboarding/estado y GET /usuarios/perfil (ambos con
    // @UseETag) podrían devolver 304 con el avance anterior durante el TTL.
    ETagInterceptor.clearUsuarioCache(usuarioId)

    return { borrador: vista, ...progreso }
  }

  // ─── Consolidación de cierre (finalización del formulario) ─────────

  /**
   * Cierre explícito del formulario (finalización del último paso): el usuario
   * confirmó que terminó, así que el onboarding se consolida SIEMPRE al 100%.
   *
   * 1. Funde el borrador con lo ya guardado en el perfil.
   * 2. Promueve las respuestas a la colección definitiva `perfilesExtendidos`.
   * 3. Marca `onboardingCompleto: true` y `porcentajeProgreso: 100` en
   *    `perfiles` y en el propio borrador.
   * 4. Registra la acreditación del tutor sin exigir documentos: la
   *    acreditación nunca es un paso bloqueante del onboarding.
   * 5. Invalida la caché ETag para que el modal "Completa tu perfil" no se
   *    vuelva a mostrar en la siguiente lectura.
   *
   * Es idempotente: llamarlo de nuevo no altera el resultado.
   */
  async completar(usuarioId: string) {
    return this.consolidarInterno(usuarioId, { forzar: true })
  }

  /**
   * Consolidación disparada por otros endpoints del formulario
   * (p. ej. `POST /usuarios/perfil-necesidades`): promueve lo respondido a
   * `perfilesExtendidos` y marca el onboarding como completo SOLO si las
   * secciones obligatorias están realmente cubiertas. Si aún falta algo, deja
   * el progreso real (nunca un 100% falso).
   */
  async consolidar(usuarioId: string) {
    return this.consolidarInterno(usuarioId, { forzar: false })
  }

  /**
   * Núcleo de la consolidación compartido por `completar` y `consolidar`.
   * @param opciones.forzar Fija 100% aunque falten secciones (cierre explícito).
   */
  private async consolidarInterno(usuarioId: string, opciones: { forzar: boolean }) {
    const [previo, base, perfil] = await Promise.all([
      this.leerBorrador(usuarioId),
      this.baseDesdePerfil(usuarioId),
      this.leerPerfil(usuarioId),
    ])

    const respuestas = { ...base, ...this.fusionar(previo, {}) }
    const progresoReal = this.calcularProgreso(respuestas, {
      rol: perfil?.rol,
      cierreExplicito: this.cierreConfirmado(previo, perfil),
    })
    const ahora = new Date().toISOString()

    const progreso: ProgresoOnboarding = opciones.forzar
      ? {
          onboardingCompleto: true,
          porcentajeProgreso: 100,
          ultimoPasoCompletado: SECCIONES_BLOQUEANTES.length,
          pasosPendientes: [],
          seccionesFaltantes: [],
        }
      : progresoReal

    // 1) El borrador queda sellado con el progreso final (UPSERT, nunca borra).
    const documento: BorradorOnboardingDoc = {
      id: usuarioId,
      usuarioId,
      ...respuestas,
      ...progreso,
      consolidado: true,
      fechaConsolidacion: ahora,
      fechaCreacion: previo.fechaCreacion ?? ahora,
      fechaActualizacion: ahora,
    }
    await this.col(COLECCIONES.borradoresOnboarding).doc(usuarioId).set(documento, { merge: true })

    // 2) Promoción a la colección definitiva del perfil.
    await this.promoverAPerfilExtendido(usuarioId, respuestas, progreso, ahora)

    // 3) Marcado del perfil + acreditación del tutor sin bloquear.
    await this.marcarPerfil(usuarioId, respuestas, progreso, perfil, ahora)

    ETagInterceptor.clearUsuarioCache(usuarioId)

    return {
      ...progreso,
      completado: progreso.onboardingCompleto,
      consolidado: true,
      fechaCompletado: ahora,
    }
  }

  /**
   * Copia las respuestas del borrador a `perfilesExtendidos` (colección
   * definitiva). Mantiene el formato de almacenamiento existente: los
   * arreglos se guardan como string JSON (`'["tea"]'`), igual que en
   * `UsersService.saveProfilingData`, y `escalasVida` como objeto nativo.
   */
  private async promoverAPerfilExtendido(
    usuarioId: string,
    respuestas: Record<string, unknown>,
    progreso: ProgresoOnboarding,
    ahora: string,
  ): Promise<void> {
    const carga: Record<string, unknown> = {}

    for (const campo of CAMPOS_PERFIL_EXTENDIDO_ARRAYS) {
      const valor = respuestas[campo]
      if (Array.isArray(valor) && valor.length > 0) carga[campo] = JSON.stringify(valor)
    }
    for (const campo of CAMPOS_PERFIL_EXTENDIDO_TEXTO) {
      const valor = respuestas[campo]
      if (typeof valor === 'string' && valor.trim().length > 0) carga[campo] = valor.trim()
    }
    const escalas = respuestas.escalasVida
    if (escalas && typeof escalas === 'object' && Object.keys(escalas).length > 0) carga.escalasVida = escalas
    if (typeof respuestas.tieneDiagnostico === 'boolean') carga.tieneDiagnostico = respuestas.tieneDiagnostico

    carga.onboardingCompleto = progreso.onboardingCompleto
    carga.porcentajeProgreso = progreso.porcentajeProgreso
    carga.fechaActualizacion = ahora

    const existente = await this.col(COLECCIONES.perfilesExtendidos)
      .where('usuarioId', '==', usuarioId).limit(1).get()

    if (!existente.empty) {
      await this.col(COLECCIONES.perfilesExtendidos).doc(existente.docs[0].id).update(carga)
    } else {
      const ref = this.col(COLECCIONES.perfilesExtendidos).doc()
      await ref.set({ id: ref.id, usuarioId, fechaCreacion: ahora, ...carga })
    }
  }

  /**
   * Marca `perfiles/{usuarioId}` con el cierre del onboarding y promueve los
   * datos que viven en el documento de perfil (CURP, fecha de nacimiento,
   * ciudad y preferencias de acompañamiento).
   *
   * Para roles `padre_tutor` / `tutor` la acreditación se REGISTRA (mismo
   * valor `pendiente` que se asigna en el registro) pero nunca se exige como
   * bloqueante: el onboarding no depende de subir documentos.
   */
  private async marcarPerfil(
    usuarioId: string,
    respuestas: Record<string, unknown>,
    progreso: ProgresoOnboarding,
    perfil: PerfilDoc | null,
    ahora: string,
  ): Promise<void> {
    const carga: Record<string, unknown> = {
      onboardingCompleto: progreso.onboardingCompleto,
      porcentajeProgreso: progreso.porcentajeProgreso,
      fechaActualizacion: ahora,
    }
    if (progreso.onboardingCompleto) carga.fechaOnboardingCompletado = ahora

    if (typeof respuestas.curp === 'string' && respuestas.curp.trim()) carga.curp = respuestas.curp.trim().toUpperCase()
    if (typeof respuestas.fechaNacimiento === 'string' && respuestas.fechaNacimiento.trim()) {
      carga.fechaNacimiento = respuestas.fechaNacimiento.trim()
    }
    if (typeof respuestas.ciudad === 'string' && respuestas.ciudad.trim()) carga.ciudad = respuestas.ciudad.trim()
    if (typeof respuestas.preferenciasAcompanamiento === 'string') {
      carga.preferenciasAcompanamiento = respuestas.preferenciasAcompanamiento
    }
    if (typeof respuestas.tonoContextual === 'string') carga.tonoContextual = respuestas.tonoContextual

    // Acreditación del tutor: se registra solo si nunca se asignó; nunca
    // bloquea el cierre y no se sobrescribe un 'aprobado'/'rechazado' previo.
    const esTutor = perfil?.rol === 'padre_tutor' || perfil?.rol === 'tutor'
    if (esTutor && !perfil?.estadoAcreditacionTutor) carga.estadoAcreditacionTutor = 'pendiente'

    await this.col(COLECCIONES.perfiles).doc(usuarioId).set(carga, { merge: true })
  }

  // ─── GET /onboarding/estado ───────────────────────────────────────

  /**
   * Estado del onboarding para el Frontend: progreso + variables de
   * contexto (destinatarioPerfil y nombrePcd) derivadas de datos ya
   * existentes (perfiles.destinatarioRegistro, nombre del perfil o del
   * dependiente del tutor). Nunca lanza 500 por datos faltantes.
   *
   * El progreso se calcula sobre la fusión del borrador con lo ya guardado
   * en `perfiles` + `perfilesExtendidos`, por lo que refleja el avance real.
   * `seccionesFaltantes` es la lista CON ETIQUETAS AMIGABLES que la UI debe
   * mostrar; `pasosPendientes` se conserva por compatibilidad con clientes
   * que aún navigan por clave técnica.
   */
  async obtenerEstado(usuarioId: string) {
    try {
      const [previo, base, perfil] = await Promise.all([
        this.leerBorrador(usuarioId),
        this.baseDesdePerfil(usuarioId),
        this.leerPerfil(usuarioId),
      ])

      const vista = { ...base, ...this.fusionar(previo, {}) }
      const progreso = this.calcularProgreso(vista, {
        rol: perfil?.rol,
        cierreExplicito: this.cierreConfirmado(previo, perfil),
      })
      const destinatarioPerfil = this.destinatarioPerfil(perfil)
      const nombrePcd = await this.nombrePcd(usuarioId, perfil, destinatarioPerfil)

      return {
        ...progreso,
        completado: progreso.onboardingCompleto,
        ...this.calcularEtapas(progreso),
        destinatarioPerfil,
        nombrePcd,
      }
    } catch (err: unknown) {
      // Firestore inaccesible o colección nueva sin crear: el estado nunca
      // debe romper el onboarding; se responde "sin avanzar" para reintentar.
      this.logger.warn(`obtenerEstado falló para usuario ${usuarioId}: ${err instanceof Error ? err.message : String(err)}`)
      const progreso: ProgresoOnboarding = {
        onboardingCompleto: false,
        porcentajeProgreso: 0,
        ultimoPasoCompletado: 0,
        pasosPendientes: SECCIONES_BLOQUEANTES.map(s => s.clave),
        seccionesFaltantes: SECCIONES_BLOQUEANTES.map(s => ({ clave: s.clave, etiqueta: s.etiqueta, camposFaltantes: [...s.campos].map(String) })),
      }
      return {
        ...progreso,
        completado: false,
        ...this.calcularEtapas(progreso),
        destinatarioPerfil: 'PARA_MI',
        nombrePcd: null,
      }
    }
  }

  /**
   * Indica si la etapa dada está COMPLETADA para el usuario.
   * Usado por {@link EtapaGuard}; nunca lanza (obtenerEstado es defensivo),
   * por lo que ante un fallo de Firestore responde false (fail-closed).
   */
  async etapaCompletada(usuarioId: string, etapa: number): Promise<boolean> {
    const estado = await this.obtenerEstado(usuarioId)
    const clave = `etapa${etapa}`
    const etapaInfo = (estado.etapas as Record<string, EstadoEtapa | undefined>)[clave]
    return etapaInfo?.completada ?? false
  }

  // ─── Navegación por etapas (Sidebar) ─────────────────────────────

  /**
   * Calcula el estado de las 3 etapas del Sidebar a partir del progreso:
   *
   * - Etapa 1: refleja el onboarding (completada = onboardingCompleto,
   *   porcentaje = porcentajeProgreso). Siempre desbloqueada.
   * - Etapa 2 y 3: 0% hasta que existan sus módulos; se desbloquean
   *   encadenadamente (N desbloqueada ⇔ etapa N-1 completada).
   * - modulosPermitidos: unión de los módulos de las etapas desbloqueadas.
   *
   * Cuando lleguen los módulos de rutinas/caminos, aquí se calcula el
   * porcentaje real de las etapas 2 y 3.
   */
  private calcularEtapas(progreso: { onboardingCompleto: boolean; porcentajeProgreso: number }): {
    etapas: Record<ClaveEtapa, EstadoEtapa>
    modulosPermitidos: string[]
  } {
    // Solo la Etapa 1 tiene datos reales hoy (onboarding).
    const completadas: Record<ClaveEtapa, boolean> = {
      etapa1: progreso.onboardingCompleto,
      etapa2: false, // Pendiente: módulo de rutinas/apoyos/terapias
      etapa3: false, // Pendiente: módulo de caminos/oportunidades/comunidad
    }
    const porcentajes: Record<ClaveEtapa, number> = {
      etapa1: progreso.porcentajeProgreso,
      etapa2: 0,
      etapa3: 0,
    }

    const etapas = {} as Record<ClaveEtapa, EstadoEtapa>
    const modulosPermitidos: string[] = []
    let previaCompletada = true // La primera etapa siempre está desbloqueada

    for (const etapa of ETAPAS_ONBOARDING) {
      const desbloqueada = previaCompletada
      etapas[etapa.clave] = {
        nombre: etapa.nombre,
        completada: completadas[etapa.clave],
        desbloqueada,
        porcentaje: porcentajes[etapa.clave],
      }
      if (desbloqueada) modulosPermitidos.push(...etapa.modulos)
      previaCompletada = completadas[etapa.clave]
    }

    return { etapas, modulosPermitidos }
  }

  // ─── Fusión (merge) ───────────────────────────────────────────────

  /**
   * Combina el borrador previo con el payload: cada campo presente en el
   * payload (distinto de null/undefined) sobrescribe; los campos ausentes
   * o anulados conservan el valor previo. Nunca propaga campos desconocidos.
   */
  private fusionar(previo: BorradorOnboardingDoc, dto: Partial<SaveDraftOnboardingDto>): Record<string, unknown> {
    const resultado: Record<string, unknown> = {}
    for (const campo of CAMPOS_ONBOARDING) {
      const anterior = (previo as Record<string, unknown>)[campo]
      if (anterior !== undefined && anterior !== null) resultado[campo] = anterior

      const nuevo = (dto as Record<string, unknown>)[campo]
      if (nuevo !== undefined && nuevo !== null) resultado[campo] = nuevo
    }
    return resultado
  }

  // ─── Progreso ─────────────────────────────────────────────────────

  /**
   * Recalcula el progreso a partir de la vista combinada (perfil + borrador):
   *
   * - porcentajeProgreso: campos OBLIGATORIOS respondidos / campos obligatorios
   *   totales (0-100). Los campos opcionales (p. ej. observaciones) no entran
   *   en el cálculo: pueden quedar vacíos sin frenar el cierre.
   * - seccionCompletada: todos los campos obligatorios de la sección
   *   respondidos (un false explícito, p.ej. tieneDiagnostico, cuenta como
   *   respondido). Las secciones solo-opcionales nunca bloquean.
   * - ultimoPasoCompletado: índice (1-based) de la última sección obligatoria
   *   completada de forma consecutiva desde el inicio; 0 si ninguna.
   * - pasosPendientes: claves de las secciones incompletas (contrato legacy).
   * - seccionesFaltantes: las mismas secciones con etiqueta amigable y los
   *   campos concretos que faltan, para que la UI no muestre claves técnicas.
   * - onboardingCompleto: true solo cuando no queda nada pendiente.
   */
  private calcularProgreso(
    vista: Record<string, unknown>,
    opciones: { rol?: string; cierreExplicito?: boolean } = {},
  ): ProgresoOnboarding {
    // ── ROL TUTOR: bifurcación temprana con sus propios requiredFields ──
    if (this.esTutor(opciones.rol)) {
      // El backend ya confirmó el cierre (flag `onboardingCompleto`): 100%.
      if (opciones.cierreExplicito) return this.progresoCompleto()
      return this.progresoPorSecciones(vista, SECCIONES_ONBOARDING_TUTOR)
    }

    // ── ROL PCD / resto: misma regla de siempre, sin cambios ──────────
    return this.progresoPorSecciones(vista, SECCIONES_ONBOARDING)
  }

  /** Regla por rol: solo `tutor` / `padre_tutor` usan la lista reducida. */
  private esTutor(rol?: string): boolean {
    return rol === 'tutor' || rol === 'padre_tutor'
  }

  /** Progreso definitivo cuando el cierre ya fue confirmado por el backend. */
  private progresoCompleto(): ProgresoOnboarding {
    return {
      onboardingCompleto: true,
      porcentajeProgreso: 100,
      ultimoPasoCompletado: SECCIONES_BLOQUEANTES.length,
      pasosPendientes: [],
      seccionesFaltantes: [],
    }
  }

  /** true si el borrador/perfil ya traen el cierre confirmado del onboarding. */
  private cierreConfirmado(previo: BorradorOnboardingDoc, perfil: PerfilDoc | null): boolean {
    return (
      (previo.consolidado === true && previo.onboardingCompleto === true) ||
      perfil?.onboardingCompleto === true
    )
  }

  /**
   * Núcleo de cálculo compartido por ambos roles: recorre la lista de
   * secciones que reciba (PCD: `SECCIONES_ONBOARDING`; Tutor:
   * `SECCIONES_ONBOARDING_TUTOR`). La semántica no cambia para PCD.
   */
  private progresoPorSecciones(
    vista: Record<string, unknown>,
    secciones: SeccionOnboardingConfig[],
  ): ProgresoOnboarding {
    let camposRespondidos = 0
    let camposTotales = 0
    let ultimoPasoCompletado = 0
    let consecucionRota = false
    const pasosPendientes: SeccionOnboarding[] = []
    const seccionesFaltantes: SeccionFaltante[] = []

    for (const seccion of secciones) {
      // Sección solo-opcional: se guarda si viene, pero nunca bloquea.
      if (seccion.campos.length === 0) continue

      const camposFaltantes = seccion.campos.filter(c => !this.campoRespondido(vista[c]))
      camposTotales += seccion.campos.length
      camposRespondidos += seccion.campos.length - camposFaltantes.length
      const completada = camposFaltantes.length === 0

      if (completada && !consecucionRota) {
        ultimoPasoCompletado++
      } else if (!completada) {
        consecucionRota = true
        pasosPendientes.push(seccion.clave)
        seccionesFaltantes.push({
          clave: seccion.clave,
          etiqueta: seccion.etiqueta,
          camposFaltantes: camposFaltantes.map(String),
        })
      }
    }

    return {
      onboardingCompleto: pasosPendientes.length === 0,
      porcentajeProgreso: camposTotales > 0 ? Math.round((camposRespondidos / camposTotales) * 100) : 0,
      ultimoPasoCompletado,
      pasosPendientes,
      seccionesFaltantes,
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
   *
   * Cubre TODOS los campos del formulario, no solo una parte: los que solo
   * viven en `perfiles` (preferenciasAcompanamiento, tonoContextual) y en
   * `perfilesExtendidos` (observacionesGenerales) se leen aquí. Si un campo
   * quedara fuera, su sección nunca se completaría y el modal
   * "Completa tu perfil" reaparecería en bucle aunque el usuario haya
   * terminado el formulario.
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
        if (perfil.preferenciasAcompanamiento) base.preferenciasAcompanamiento = perfil.preferenciasAcompanamiento
        if (perfil.tonoContextual) base.tonoContextual = perfil.tonoContextual
      }
      if (ext) {
        this.asignarArreglo(base, 'historialEducacion', ext.historialEducacion)
        this.asignarArreglo(base, 'historialTerapia', ext.historialTerapia)
        this.asignarArreglo(base, 'tiposDiscapacidad', ext.tiposDiscapacidad)
        this.asignarArreglo(base, 'necesidades', ext.necesidades)
        this.asignarArreglo(base, 'metasActuales', ext.metasActuales)
        this.asignarArreglo(base, 'areasInteres', ext.areasInteres)
        if (ext.etapaVida) base.etapaVida = ext.etapaVida
        if (ext.tonoContextual) base.tonoContextual = ext.tonoContextual
        if (ext.observacionesGenerales) base.observacionesGenerales = ext.observacionesGenerales
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
