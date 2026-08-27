import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException, ServiceUnavailableException, Logger } from '@nestjs/common'
import { Firestore, DocumentSnapshot, DocumentData } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES, getMaxDependientesPorTutor } from '../../database/firestore.constants'
import { FEATURES_POR_DEFECTO, FeatureFlags } from '../../common/interfaces/feature-flags.interface'
import { DependienteDoc, DependienteFormateado, PerfilExtendidoDoc } from '../../common/interfaces/firestore-documents.interface'
import { StorageService } from '../storage/storage.service'
import { extractStoragePath } from '../../common/utils/storage-path.util'
import { obtenerDocumentosPorIds, obtenerDocumentosPorCampo, registrarDependienteVinculado, parsearTiposDiscapacidad } from '../../common/utils/firestore-helpers'
import { paginar, ordenar, RespuestaPaginada } from '../../common/dto/paginacion.dto'
import { ActualizarPerfilDto } from './dto/actualizar-perfil.dto'
import { GuardarPerfilNecesidadesDto } from './dto/guardar-perfil-necesidades.dto'
import { CrearDependienteDto } from './dto/crear-dependiente.dto'

@Injectable()
export class UsersService {
  private readonly logger = new Logger('UsersService')

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly storage: StorageService,
  ) {}

  private col(nombre: string) { return this.db.collection(nombre) }

  async getProfile(usuarioId: string) {
    const doc = await this.col(COLECCIONES.perfiles).doc(usuarioId).get()
    if (!doc.exists) throw new NotFoundException('Usuario no encontrado')
    const perfil: Record<string, any> = { id: doc.id, ...doc.data()! }

    const perfilExtendidoSnap = await this.col(COLECCIONES.perfilesExtendidos)
      .where('usuarioId', '==', usuarioId).limit(1).get()
    const perfilExtendido = perfilExtendidoSnap.empty ? null : perfilExtendidoSnap.docs[0].data()

    const resultado: Record<string, any> = {
      ...perfil,
      perfilNecesidades: perfilExtendido ? {
        tiposDiscapacidad: this.parsearCampoJson(perfilExtendido.tiposDiscapacidad),
        severidadDiscapacidad: perfilExtendido.severidadDiscapacidad ?? null,
        modosComunicacion: this.parsearCampoJson(perfilExtendido.modosComunicacion),
        necesidadesMovilidad: this.parsearCampoJson(perfilExtendido.necesidadesMovilidad),
        accesoTecnologia: this.parsearCampoJson(perfilExtendido.accesoTecnologia),
        zonasPreferidas: this.parsearCampoJson(perfilExtendido.zonasPreferidas),
        necesidades: this.parsearCampoJson(perfilExtendido.necesidades),
        metasActuales: this.parsearCampoJson(perfilExtendido.metasActuales),
        areasApoyo: this.parsearCampoJson(perfilExtendido.areasApoyo),
        historialEducacion: this.parsearCampoJson(perfilExtendido.historialEducacion),
        historialTerapia: this.parsearCampoJson(perfilExtendido.historialTerapia),
        etapaVida: perfilExtendido.etapaVida ?? null,
        preocupacionesActuales: perfilExtendido.preocupacionesActuales ?? null,
        nivelApoyo: perfilExtendido.nivelApoyo ?? null,
        // ── Campos Spec MVP Raíces ──
        escalasVida: perfilExtendido.escalasVida ?? null,
        tieneDiagnostico: perfilExtendido.tieneDiagnostico ?? null,
        requiereEvaluacion: perfilExtendido.requiereEvaluacion ?? false,
        temporalidadOrigen: perfilExtendido.temporalidadOrigen ?? null,
        preferenciaFormato: perfilExtendido.preferenciaFormato ?? null,
        areasInteres: this.parsearCampoJson(perfilExtendido.areasInteres),
        viabilidadEconomica: perfilExtendido.viabilidadEconomica ?? null,
        historialInstituciones: this.parsearCampoJson(perfilExtendido.historialInstituciones),
        tonoContextual: perfilExtendido.tonoContextual ?? null,
      } : null,
    }

    // Para usuarios institución, adjuntar los datos básicos de su institución.
    // Se busca primero el documento canónico (id = UID) y, si no existe,
    // se cae a 'creadoPor' (instituciones legacy creadas con ID aleatorio).
    if (perfil.rol === 'institucion') {
      let instDoc: DocumentSnapshot<DocumentData> | null = await this.col(COLECCIONES.instituciones).doc(usuarioId).get()
      if (!instDoc.exists) {
        const porCreador = await this.col(COLECCIONES.instituciones)
          .where('creadoPor', '==', usuarioId).limit(1).get()
        instDoc = porCreador.empty ? null : porCreador.docs[0]
      }
      resultado.institucionId = instDoc ? instDoc.id : (perfil.institucionId ?? null)
      resultado.institucion = instDoc ? {
        id: instDoc.id,
        nombre: instDoc.data()?.nombre ?? null,
        categoria: instDoc.data()?.categoria ?? null,
        descripcion: instDoc.data()?.descripcion ?? null,
        telefono: instDoc.data()?.telefono ?? null,
        tiposDiscapacidad: parsearTiposDiscapacidad(instDoc.data()?.tiposDiscapacidad),
        ciudad: instDoc.data()?.ciudad ?? null,
        estado: instDoc.data()?.estado ?? null,
        urlLogo: instDoc.data()?.urlLogo ?? null,
        activa: instDoc.data()?.activa ?? false,
        verificada: instDoc.data()?.verificada ?? false,
        calificacionPromedio: instDoc.data()?.calificacionPromedio ?? 0,
        cantidadCalificaciones: instDoc.data()?.cantidadCalificaciones ?? 0,
      } : null
    }

    return resultado
  }

  async deleteAvatar(usuarioId: string) {
    const doc = await this.col(COLECCIONES.perfiles).doc(usuarioId).get()
    if (!doc.exists) throw new NotFoundException('Usuario no encontrado')

    await this.eliminarArchivoDeUrl(doc.data()!.urlAvatar)

    await this.col(COLECCIONES.perfiles).doc(usuarioId).update({ urlAvatar: null })
  }

  /**
   * Elimina de Storage el archivo asociado a una URL (GCS o fallback local).
   * Los fallos de Storage (o URLs no extraíbles) se registran y no rompen
   * el flujo principal.
   */
  private async eliminarArchivoDeUrl(url: string | undefined): Promise<void> {
    if (!url) return
    const filePath = extractStoragePath(url)
    if (!filePath) {
      this.logger.warn(`No se pudo extraer la ruta de almacenamiento de la URL: ${url}`)
      return
    }
    try {
      await this.storage.delete(filePath)
    } catch (err: any) {
      this.logger.warn(`No se pudo eliminar archivo de Storage: ${err?.message ?? err}`)
    }
  }

  async updateAvatar(usuarioId: string, urlAvatar: string) {
    const doc = await this.col(COLECCIONES.perfiles).doc(usuarioId).get()
    if (!doc.exists) throw new NotFoundException('Usuario no encontrado')
    const urlAnterior = doc.data()?.urlAvatar

    // 1. Persistir primero la nueva URL: si Firestore falla, el avatar
    // anterior sigue referenciado en la base de datos y el usuario no
    // pierde su foto. El archivo recién subido se elimina como rollback
    // para no dejar objetos huérfanos en Storage.
    try {
      await this.col(COLECCIONES.perfiles).doc(usuarioId).update({ urlAvatar })
    } catch (dbError: any) {
      this.logger.error(`Error al guardar avatarUrl en Firestore: ${dbError?.message ?? dbError}`)
      await this.eliminarArchivoDeUrl(urlAvatar)
      throw new ServiceUnavailableException('No se pudo guardar el avatar en la base de datos')
    }

    // 2. Limpiar el avatar anterior de Storage (fallo no bloqueante)
    await this.eliminarArchivoDeUrl(urlAnterior)

    return { urlAvatar }
  }

  async updateProfile(usuarioId: string, datos: ActualizarPerfilDto) {
    const datosSeguros = datos ?? ({} as ActualizarPerfilDto)
    const camposActualizables = ['nombreCompleto', 'ciudad', 'estado', 'urlAvatar', 'profesion', 'bio', 'curp', 'telefonoContacto', 'destinatarioRegistro', 'preferenciasAcompanamiento', 'fechaNacimiento', 'domicilio'] as const
    const carga: Record<string, unknown> = {}
    for (const campo of camposActualizables) {
      const valor = datosSeguros[campo]
      if (valor !== undefined) {
        carga[campo] = valor
      }
    }
    // Normalizar CURP a mayúsculas (formato oficial mexicano)
    if (typeof carga.curp === 'string') {
      carga.curp = (carga.curp as string).toUpperCase()
    }
    if (Object.keys(carga).length === 0) {
      return this.getProfile(usuarioId)
    }
    await this.col(COLECCIONES.perfiles).doc(usuarioId).update(carga)

    // Si el usuario institución cambia su nombre, propagar el cambio al
    // documento de 'instituciones' para mantener el directorio sincronizado.
    if (carga.nombreCompleto) {
      await this.sincronizarNombreInstitucion(usuarioId, carga.nombreCompleto as string)
    }

    return this.getProfile(usuarioId)
  }

  /**
   * Propaga el nombre actualizado de un usuario institución a su documento
   * en 'instituciones' (canónico por UID o creado vía POST /instituciones).
   */
  private async sincronizarNombreInstitucion(usuarioId: string, nombre: string) {
    const perfilDoc = await this.col(COLECCIONES.perfiles).doc(usuarioId).get()
    if (!perfilDoc.exists) return
    const rol = perfilDoc.data()?.rol
    if (rol !== 'institucion' && rol !== 'institution') return

    const canonico = await this.col(COLECCIONES.instituciones).doc(usuarioId).get()
    if (canonico.exists) {
      await canonico.ref.update({ nombre })
      return
    }
    const porCreador = await this.col(COLECCIONES.instituciones)
      .where('creadoPor', '==', usuarioId).limit(1).get()
    if (!porCreador.empty) {
      await porCreador.docs[0].ref.update({ nombre })
    }
  }

  async saveProfilingData(usuarioId: string, datos: GuardarPerfilNecesidadesDto) {
    const existe = await this.col(COLECCIONES.perfilesExtendidos)
      .where('usuarioId', '==', usuarioId).limit(1).get()
    const carga: Record<string, any> = {
      tiposDiscapacidad: JSON.stringify(datos.tiposDiscapacidad ?? []),
      severidadDiscapacidad: datos.severidadDiscapacidad ?? null,
      modosComunicacion: JSON.stringify(datos.modosComunicacion ?? []),
      necesidadesMovilidad: JSON.stringify(datos.necesidadesMovilidad ?? []),
      accesoTecnologia: JSON.stringify(datos.accesoTecnologia ?? []),
      zonasPreferidas: JSON.stringify(datos.zonasPreferidas ?? []),
      necesidades: JSON.stringify(datos.necesidades ?? []),
      metasActuales: JSON.stringify(datos.metasActuales ?? []),
      areasApoyo: JSON.stringify(datos.areasApoyo ?? []),
      historialEducacion: JSON.stringify(datos.historialEducacion ?? []),
      historialTerapia: JSON.stringify(datos.historialTerapia ?? []),
      etapaVida: datos.etapaVida ?? null,
      preocupacionesActuales: datos.preocupacionesActuales ?? null,
      nivelApoyo: datos.nivelApoyo ?? null,
      // ── Campos Spec MVP Raíces ──
      historialInstituciones: JSON.stringify(datos.historialInstituciones ?? []),
      tonoContextual: datos.tonoContextual ?? null,
    }
    if (!existe.empty) {
      await this.col(COLECCIONES.perfilesExtendidos).doc(existe.docs[0].id).update(carga)
    } else {
      const ref = this.col(COLECCIONES.perfilesExtendidos).doc()
      await ref.set({ id: ref.id, usuarioId, ...carga })
    }

    const perfilGuardado = {
      tiposDiscapacidad: this.parsearCampoJson(carga.tiposDiscapacidad),
      severidadDiscapacidad: carga.severidadDiscapacidad,
      modosComunicacion: this.parsearCampoJson(carga.modosComunicacion),
      necesidadesMovilidad: this.parsearCampoJson(carga.necesidadesMovilidad),
      accesoTecnologia: this.parsearCampoJson(carga.accesoTecnologia),
      zonasPreferidas: this.parsearCampoJson(carga.zonasPreferidas),
      necesidades: this.parsearCampoJson(carga.necesidades),
      metasActuales: this.parsearCampoJson(carga.metasActuales),
      areasApoyo: this.parsearCampoJson(carga.areasApoyo),
      historialEducacion: this.parsearCampoJson(carga.historialEducacion),
      historialTerapia: this.parsearCampoJson(carga.historialTerapia),
      etapaVida: carga.etapaVida,
      preocupacionesActuales: carga.preocupacionesActuales,
      nivelApoyo: carga.nivelApoyo,
    }
    return perfilGuardado
  }

  // ─── Escalas "Cómo vives hoy" ─────────────────────────────────────

  /**
   * Guarda la evaluación "Cómo vives hoy" con las 8 escalas, diagnóstico,
   * temporalidad, formato preferido, áreas de interés y viabilidad económica.
   * Si no tiene diagnóstico, genera el flag requiereEvaluacion para conectar
   * con la red de especialistas.
   */
  async saveEscalasVida(usuarioId: string, dto: import('./dto/guardar-escalas-vida.dto').GuardarEscalasVidaDto) {
    const carga: Record<string, any> = {
      escalasVida: {
        autonomia: dto.nivelAutonomia,
        independencia: dto.nivelIndependencia,
        comunicacion: dto.nivelComunicacion,
        comprension: dto.nivelComprension,
        energia: dto.nivelEnergia,
        movilidad: dto.nivelMovilidad,
        social: dto.nivelSocial,
        emocional: dto.nivelEmocional,
      },
      tieneDiagnostico: dto.tieneDiagnostico,
      // FLAG: si no tiene diagnóstico, marcar para sugerir especialistas
      requiereEvaluacion: !dto.tieneDiagnostico,
      temporalidadOrigen: dto.temporalidadOrigen ?? null,
      preferenciaFormato: dto.preferenciaFormato ?? null,
      areasInteres: JSON.stringify(dto.areasInteres ?? []),
      viabilidadEconomica: dto.viabilidadEconomica ?? null,
    }

    const existe = await this.col(COLECCIONES.perfilesExtendidos)
      .where('usuarioId', '==', usuarioId).limit(1).get()

    if (!existe.empty) {
      await this.col(COLECCIONES.perfilesExtendidos).doc(existe.docs[0].id).update(carga)
    } else {
      const ref = this.col(COLECCIONES.perfilesExtendidos).doc()
      await ref.set({ id: ref.id, usuarioId, ...carga })
    }

    return {
      escalasVida: carga.escalasVida,
      tieneDiagnostico: carga.tieneDiagnostico,
      requiereEvaluacion: carga.requiereEvaluacion,
      temporalidadOrigen: carga.temporalidadOrigen,
      preferenciaFormato: carga.preferenciaFormato,
      areasInteres: this.parsearCampoJson(carga.areasInteres),
      viabilidadEconomica: carga.viabilidadEconomica,
    }
  }

  // ─── Documentos de identidad (Validación diferida) ─────────────

  /**
   * Sube un documento de identidad (CURP o identificación oficial).
   * El documento se guarda en Storage y se registra en Firestore.
   * El estado se actualiza a 'pendiente' para revisión admin.
   */
  async subirDocumentoIdentidad(
    usuarioId: string,
    tipo: 'curp' | 'identificacion_oficial' | 'certificado_discapacidad',
    file: Express.Multer.File,
    numeroCurp?: string,
  ) {
    // Validar que el usuario exista
    const perfilDoc = await this.col(COLECCIONES.perfiles).doc(usuarioId).get()
    if (!perfilDoc.exists) throw new NotFoundException('Usuario no encontrado')

    // Validar CURP si se proporciona
    if (tipo === 'curp' && numeroCurp) {
      const { esCurpValida } = await import('../../common/validators/curp.validator')
      if (!esCurpValida(numeroCurp)) {
        throw new BadRequestException('La CURP no tiene un formato válido. Debe ser una CURP oficial mexicana de 18 caracteres')
      }
      // Guardar CURP normalizada en el perfil
      await this.col(COLECCIONES.perfiles).doc(usuarioId).update({ curp: numeroCurp.toUpperCase() })
    }

    // Subir archivo a Storage
    const urlDocumento = await this.storage.upload(
      file.buffer,
      file.originalname,
      `identidad/${usuarioId}`,
    )

    // Registrar documento en la subcolección de documentos de identidad
    const docRef = this.col(COLECCIONES.documentosIdentidad).doc()
    await docRef.set({
      id: docRef.id,
      usuarioId,
      tipo,
      urlDocumento,
      numeroCurp: numeroCurp?.toUpperCase() ?? null,
      estado: 'pendiente',
      fechaSubida: new Date().toISOString(),
    })

    // Actualizar estado de validación del perfil
    await this.actualizarEstadoValidacion(usuarioId)

    return {
      tipo,
      urlDocumento,
      estado: 'pendiente',
      fechaSubida: new Date().toISOString(),
      numeroCurp: numeroCurp?.toUpperCase() ?? null,
    }
  }

  /**
   * Obtiene el estado de validación de documentos de identidad del usuario.
   */
  async getEstadoValidacionIdentidad(usuarioId: string) {
    const perfilDoc = await this.col(COLECCIONES.perfiles).doc(usuarioId).get()
    if (!perfilDoc.exists) throw new NotFoundException('Usuario no encontrado')

    const perfil = perfilDoc.data()!

    // Buscar documentos de identidad del usuario
    const docsSnap = await this.col(COLECCIONES.documentosIdentidad)
      .where('usuarioId', '==', usuarioId).get()

    const documentos = docsSnap.docs.map(d => d.data())
    const tieneCurp = documentos.some(d => d.tipo === 'curp')
    const tieneIdentificacion = documentos.some(d => d.tipo === 'identificacion_oficial')
    const tieneCertificadoDiscapacidad = documentos.some(d => d.tipo === 'certificado_discapacidad')

    // Determinar estado general
    let estado: string = 'sin_documentos'
    if (tieneCurp || tieneIdentificacion) {
      // Si algún documento está pendiente → pendiente
      // Si todos están aprobados → aprobado
      // Si alguno está rechazado → rechazado
      const estados = documentos.map(d => d.estado)
      if (estados.includes('rechazado')) {
        estado = 'rechazado'
      } else if (estados.includes('pendiente')) {
        estado = 'pendiente'
      } else if (estados.every(e => e === 'aprobado')) {
        estado = 'aprobado'
      }
    }

    // Buscar último documento para fechas y motivo de rechazo
    const ultimoDoc = documentos.length > 0
      ? documentos.sort((a, b) => (b.fechaSubida ?? '').localeCompare(a.fechaSubida ?? ''))[0]
      : null

    return {
      estado,
      tieneCurp,
      tieneIdentificacion,
      tieneCertificadoDiscapacidad,
      numeroCurp: perfil.curp ?? null,
      motivoRechazo: ultimoDoc?.motivoRechazo ?? null,
      fechaSubida: ultimoDoc?.fechaSubida ?? null,
      fechaRevision: ultimoDoc?.fechaRevision ?? null,
    }
  }

  /**
   * Actualiza el estado de validación de identidad del perfil.
   * Llamado después de subir documentos o cuando admin aprueba/rechaza.
   */
  private async actualizarEstadoValidacion(usuarioId: string) {
    const docsSnap = await this.col(COLECCIONES.documentosIdentidad)
      .where('usuarioId', '==', usuarioId).get()

    if (docsSnap.empty) {
      await this.col(COLECCIONES.perfiles).doc(usuarioId).update({
        estadoValidacionIdentidad: 'sin_documentos',
      })
      return
    }

    const documentos = docsSnap.docs.map(d => d.data())
    const tieneCurp = documentos.some(d => d.tipo === 'curp')
    const tieneIdentificacion = documentos.some(d => d.tipo === 'identificacion_oficial')
    const tieneCertificadoDiscapacidad = documentos.some(d => d.tipo === 'certificado_discapacidad')

    // Determinar estado general
    let estado: string = 'sin_documentos'
    if (tieneCurp || tieneIdentificacion) {
      const estados = documentos.map(d => d.estado)
      if (estados.includes('rechazado')) {
        estado = 'rechazado'
      } else if (estados.includes('pendiente')) {
        estado = 'pendiente'
      } else if (estados.every(e => e === 'aprobado')) {
        estado = 'aprobado'
      }
    }

    await this.col(COLECCIONES.perfiles).doc(usuarioId).update({
      estadoValidacionIdentidad: estado,
      certificadoDiscapacidad: tieneCertificadoDiscapacidad,
    })
  }

  // ═══════════════════════════════════════════════════════════════════
  // Visibilidad diferenciada Cuidador/Padre ↔ PCD
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Permite a un padre/tutor O a una institución ver el perfil completo
   * de una PCD. Incluye datos extendidos (discapacidad, necesidades, escalas, etc.).
   *
   * - Padres/tutores: solo pueden ver PCDs vinculadas a su cuenta.
   * - Instituciones: pueden ver cualquier perfil PCD (flujo de descubrimiento B2B).
   */
  async getPerfilPcdComoTutor(actorId: string, actorRol: string, pcdUserId: string) {
    const perfilDoc = await this.col(COLECCIONES.perfiles).doc(pcdUserId).get()
    if (!perfilDoc.exists) throw new NotFoundException('Usuario PCD no encontrado')

    const perfil = perfilDoc.data()!
    if (perfil.rol !== 'pcd') {
      throw new BadRequestException('El usuario indicado no tiene rol PCD')
    }

    // Padre/tutor: solo puede ver PCDs vinculadas a su cuenta
    if (actorRol === 'padre_tutor' || actorRol === 'tutor') {
      if (perfil.tutorId !== actorId) {
        throw new ForbiddenException('Esta PCD no está vinculada a tu cuenta como padre/tutor')
      }
    }
    // Instituciones pueden ver cualquier perfil PCD (validación se hace en el controller con RolesGuard)
    else if (actorRol !== 'institucion' && actorRol !== 'admin') {
      throw new ForbiddenException('Rol insuficiente para ver perfil PCD')
    }

    // Obtener perfil extendido de la PCD
    const extSnap = await this.col(COLECCIONES.perfilesExtendidos)
      .where('usuarioId', '==', pcdUserId).limit(1).get()

    const perfilExtendido = extSnap.empty ? null : extSnap.docs[0].data()

    // Construir respuesta con datos del perfil de la PCD
    const resultado: Record<string, any> = {
      id: perfilDoc.id,
      nombreCompleto: perfil.nombreCompleto,
      email: perfil.email,
      rol: perfil.rol,
      ciudad: perfil.ciudad ?? null,
      estado: perfil.estado ?? null,
      urlAvatar: perfil.urlAvatar ?? null,
      verificado: perfil.verificado,
      fechaCreacion: perfil.fechaCreacion,
      // Datos de tutoría
      esMiPcd: true,
      tutorId: perfil.tutorId ?? null,
      // Datos extendidos de la PCD
      perfilNecesidades: perfilExtendido ? {
        tiposDiscapacidad: this.parsearCampoJson(perfilExtendido.tiposDiscapacidad),
        severidadDiscapacidad: perfilExtendido.severidadDiscapacidad ?? null,
        modosComunicacion: this.parsearCampoJson(perfilExtendido.modosComunicacion),
        necesidadesMovilidad: this.parsearCampoJson(perfilExtendido.necesidadesMovilidad),
        accesoTecnologia: this.parsearCampoJson(perfilExtendido.accesoTecnologia),
        zonasPreferidas: this.parsearCampoJson(perfilExtendido.zonasPreferidas),
        necesidades: this.parsearCampoJson(perfilExtendido.necesidades),
        metasActuales: this.parsearCampoJson(perfilExtendido.metasActuales),
        areasApoyo: this.parsearCampoJson(perfilExtendido.areasApoyo),
        historialEducacion: this.parsearCampoJson(perfilExtendido.historialEducacion),
        historialTerapia: this.parsearCampoJson(perfilExtendido.historialTerapia),
        etapaVida: perfilExtendido.etapaVida ?? null,
        preocupacionesActuales: perfilExtendido.preocupacionesActuales ?? null,
        nivelApoyo: perfilExtendido.nivelApoyo ?? null,
        // Campos Spec MVP Raíces
        escalasVida: perfilExtendido.escalasVida ?? null,
        tieneDiagnostico: perfilExtendido.tieneDiagnostico ?? null,
        requiereEvaluacion: perfilExtendido.requiereEvaluacion ?? false,
        temporalidadOrigen: perfilExtendido.temporalidadOrigen ?? null,
        preferenciaFormato: perfilExtendido.preferenciaFormato ?? null,
        areasInteres: this.parsearCampoJson(perfilExtendido.areasInteres),
        viabilidadEconomica: perfilExtendido.viabilidadEconomica ?? null,
        historialInstituciones: this.parsearCampoJson(perfilExtendido.historialInstituciones),
        tonoContextual: perfilExtendido.tonoContextual ?? null,
      } : null,
    }

    return resultado
  }

  /**
   * Permite a una PCD ver su propio perfil con todos los datos.
   * Método dedicado para la vista "Mi perfil" de la PCD.
   */
  async getMiPerfilPcd(usuarioId: string) {
    return this.getProfile(usuarioId)
  }

  async getDependents(usuarioId: string) {
    const snap = await this.col(COLECCIONES.dependientes)
      .where('tutorId', '==', usuarioId).get()

    const dependientes = snap.docs.map(d => this.formatearDependiente({ id: d.id, ...d.data() } as DependienteDoc)).filter((d): d is DependienteFormateado => d !== null)

    // Las cuentas PCD vinculadas guardan sus features y perfil de necesidades
    // en sus propios documentos; enriquecer la lista con esa información real.
    await this.enriquecerDependientes(dependientes)

    dependientes.sort((a, b) => (a.fechaCreacion ?? '').localeCompare(b.fechaCreacion ?? ''))
    return dependientes
  }

  /**
   * Enriquecimiento compartido para dependientes planos y cuentas PCD vinculadas:
   * para las vinculadas, sobrescribe features/tiposDiscapacidad/discapacidad/etapaVida
   * con los datos reales de sus documentos (perfiles y perfilesExtendidos) y adjunta
   * la foto real del perfil (fotoUrl).
   */
  private async enriquecerDependientes(dependientes: DependienteFormateado[]): Promise<void> {
    const pcdIds = dependientes.filter(d => d.esCuentaVinculada).map(d => d.pcdUserId ?? d.id)
    if (pcdIds.length === 0) return

    const [mapaPerfiles, mapaExtendidos] = await Promise.all([
      obtenerDocumentosPorIds(this.db, COLECCIONES.perfiles, pcdIds),
      obtenerDocumentosPorCampo(this.db, COLECCIONES.perfilesExtendidos, 'usuarioId', pcdIds),
    ])
    for (const dep of dependientes) {
      if (!dep.esCuentaVinculada) continue
      const pcdId = dep.pcdUserId ?? dep.id
      const perfil = mapaPerfiles.get(pcdId)
      if (perfil?.features) dep.features = { ...FEATURES_POR_DEFECTO, ...perfil.features }
      dep.fotoUrl = perfil?.urlAvatar ?? null
      const ext = mapaExtendidos.get(pcdId)
      if (ext) {
        const tipos = this.parsearCampoJson(ext.tiposDiscapacidad)
        dep.tiposDiscapacidad = Array.isArray(tipos) ? tipos : []
        dep.discapacidad = ext.severidadDiscapacidad ?? null
        dep.etapaVida = ext.etapaVida ?? dep.etapaVida ?? null
      }
    }
  }

  /**
   * Lista consolidada de "mis personas" (dependientes planos + cuentas PCD vinculadas)
   * bajo una interfaz común: { id, nombre, esCuentaVinculada, features, fotoUrl, ... }.
   * Soporta paginación, ordenamiento y búsqueda por nombre.
   */
  async getMisPersonas(
    usuarioId: string,
    pagina = 1,
    limite = 20,
    ordenarPor?: string,
    direccion: 'asc' | 'desc' = 'desc',
    buscar?: string,
  ): Promise<RespuestaPaginada<Record<string, unknown>>> {
    const snap = await this.col(COLECCIONES.dependientes)
      .where('tutorId', '==', usuarioId).get()

    const dependientes = snap.docs.map(d => this.formatearDependiente({ id: d.id, ...d.data() } as DependienteDoc)).filter((d): d is DependienteFormateado => d !== null)
    await this.enriquecerDependientes(dependientes)

    const personas: Record<string, unknown>[] = dependientes.map(d => ({
      id: d.id,
      nombre: d.nombreCompleto,
      esCuentaVinculada: d.esCuentaVinculada,
      features: d.features ?? { ...FEATURES_POR_DEFECTO },
      fotoUrl: d.fotoUrl ?? null,
      pcdUserId: d.pcdUserId ?? null,
      fechaCreacion: d.fechaCreacion ?? null,
    }))

    const filtradas = buscar
      ? personas.filter(p => ((p.nombre as string) ?? '').toLowerCase().includes(buscar.toLowerCase()))
      : personas
    const ordenadas = ordenar(filtradas, ordenarPor ?? 'fechaCreacion', direccion)
    const total = ordenadas.length
    const inicio = (pagina - 1) * limite
    return paginar(ordenadas.slice(inicio, inicio + limite), total, pagina, limite)
  }

  async getDependentsCount(usuarioId: string) {
    const snap = await this.col(COLECCIONES.dependientes)
      .where('tutorId', '==', usuarioId).get()
    const limite = getMaxDependientesPorTutor()
    return {
      total: snap.size,
      limite,
      restantes: Math.max(0, limite - snap.size),
    }
  }

  async addDependent(usuarioId: string, datos: CrearDependienteDto) {
    const ref = this.col(COLECCIONES.dependientes).doc()
    await ref.set({
      id: ref.id, tutorId: usuarioId,
      nombreCompleto: datos.nombreCompleto ?? 'Sin nombre',
      parentesco: datos.parentesco ?? 'familiar',
      rol: 'discapacitado',
      datosPerfil: JSON.stringify({
        tiposDiscapacidad: datos.tiposDiscapacidad ?? [],
        rangoEdad: datos.rangoEdad ?? null,
        etapaVida: datos.etapaVida ?? null,
        notas: datos.notas ?? '',
      }),
      // Esquema unificado de permisos: features inicializados con valores por defecto
      features: { ...FEATURES_POR_DEFECTO },
      fechaCreacion: new Date().toISOString(),
    })
    const fila = await this.col(COLECCIONES.dependientes).doc(ref.id).get()
    return this.formatearDependiente({ id: fila.id, ...fila.data()! } as DependienteDoc) as DependienteFormateado
  }

  async updateDependent(usuarioId: string, id: string, datos: CrearDependienteDto) {
    const existente = await this.col(COLECCIONES.dependientes).doc(id).get()
    if (!existente.exists || existente.data()?.tutorId !== usuarioId) throw new NotFoundException('Dependiente no encontrado')
    const perfilPrevio = this.parsearObjeto(existente.data()?.datosPerfil)
    await this.col(COLECCIONES.dependientes).doc(id).update({
      nombreCompleto: datos.nombreCompleto ?? existente.data()?.nombreCompleto,
      parentesco: datos.parentesco ?? existente.data()?.parentesco,
      datosPerfil: JSON.stringify({
        tiposDiscapacidad: datos.tiposDiscapacidad ?? perfilPrevio.tiposDiscapacidad ?? [],
        rangoEdad: datos.rangoEdad ?? perfilPrevio.rangoEdad ?? null,
        etapaVida: datos.etapaVida ?? perfilPrevio.etapaVida ?? null,
        notas: datos.notas ?? perfilPrevio.notas ?? '',
      }),
      fechaActualizacion: new Date().toISOString(),
    })
    const fila = await this.col(COLECCIONES.dependientes).doc(id).get()
    return this.formatearDependiente({ id: fila.id, ...fila.data()! } as DependienteDoc) as DependienteFormateado
  }

  async getDependent(usuarioId: string, id: string) {
    const doc = await this.col(COLECCIONES.dependientes).doc(id).get()
    if (!doc.exists || doc.data()?.tutorId !== usuarioId) {
      throw new NotFoundException('Dependiente no encontrado')
    }
    const dependiente = this.formatearDependiente({ id: doc.id, ...doc.data()! } as DependienteDoc) as DependienteFormateado

    // Para cuentas PCD vinculadas, features y discapacidad reales viven en su perfil
    if (dependiente.esCuentaVinculada) {
      const pcdId = dependiente.pcdUserId ?? id
      const [perfil, extSnap] = await Promise.all([
        this.col(COLECCIONES.perfiles).doc(pcdId).get(),
        this.col(COLECCIONES.perfilesExtendidos).where('usuarioId', '==', pcdId).limit(1).get(),
      ])
      if (perfil.exists && perfil.data()?.features) {
        dependiente.features = { ...FEATURES_POR_DEFECTO, ...perfil.data()!.features }
      }
      if (!extSnap.empty) {
        const ext = extSnap.docs[0].data()
        const tipos = this.parsearCampoJson(ext.tiposDiscapacidad)
        dependiente.tiposDiscapacidad = Array.isArray(tipos) ? tipos : []
        dependiente.discapacidad = ext.severidadDiscapacidad ?? null
        dependiente.etapaVida = ext.etapaVida ?? dependiente.etapaVida ?? null
      }
    }
    return dependiente as DependienteFormateado
  }

  async deleteDependent(usuarioId: string, id: string) {
    const existente = await this.col(COLECCIONES.dependientes).doc(id).get()
    if (!existente.exists || existente.data()?.tutorId !== usuarioId) throw new NotFoundException('Dependiente no encontrado')

    // Si es una cuenta PCD vinculada, desvincular también su perfil real
    // para no dejar la relación a medias.
    if (existente.data()?.esCuentaVinculada || existente.data()?.pcdUserId) {
      await this.col(COLECCIONES.perfiles)
        .doc(existente.data()?.pcdUserId ?? id)
        .update({ tutorId: null })
    }

    await this.col(COLECCIONES.dependientes).doc(id).delete()
  }

  private formatearDependiente(d: DependienteDoc | null): DependienteFormateado | null {
    if (!d) return d
    const p = this.parsearObjeto(d.datosPerfil)
    return {
      id: d.id,
      nombreCompleto: d.nombreCompleto,
      parentesco: d.parentesco ?? null,
      tiposDiscapacidad: Array.isArray(p.tiposDiscapacidad) ? p.tiposDiscapacidad : [],
      rangoEdad: p.rangoEdad ?? null,
      etapaVida: p.etapaVida ?? null,
      notas: p.notas ?? '',
      discapacidad: null,
      esCuentaVinculada: d.esCuentaVinculada === true || !!d.pcdUserId,
      pcdUserId: d.pcdUserId ?? null,
      features: d.features ?? { ...FEATURES_POR_DEFECTO },
      fechaCreacion: d.fechaCreacion,
    }
  }

  private parsearCampoJson(valor: unknown): unknown {
    if (typeof valor === 'string') {
      try { return JSON.parse(valor) }
      catch { return valor }
    }
    return valor
  }

  private parsearObjeto(valor: string | undefined): Record<string, any> {
    if (!valor) return {}
    try { const p = JSON.parse(valor); return p && typeof p === 'object' ? p : {} } catch { return {} }
  }

  // ─── Vinculación PCD ↔ Tutor ───────────────────────────────────────

  /**
   * Vincula una cuenta PCD existente a un Tutor buscando por correo electrónico.
   * Solo el tutor puede vincular. La PCD no debe estar ya vinculada a otro tutor.
   */
  async linkPcdToTutor(tutorId: string, email: string) {
    const snap = await this.col(COLECCIONES.perfiles)
      .where('email', '==', email)
      .limit(1)
      .get()

    if (snap.empty) {
      throw new NotFoundException('No se encontró un usuario PCD asociado a ese correo')
    }

    const pcdDoc = snap.docs[0]
    const pcdUserId = pcdDoc.id
    const pcd = pcdDoc.data()

    if (pcd.rol !== 'pcd') {
      throw new NotFoundException('No se encontró un usuario PCD asociado a ese correo')
    }
    if (pcd.tutorId) {
      throw new BadRequestException('Esta cuenta PCD ya está vinculada a un tutor')
    }

    await this.col(COLECCIONES.perfiles).doc(pcdUserId).update({ tutorId })
    // Registrar la relación evitando duplicados (promueve dependientes planos)
    await registrarDependienteVinculado(this.db, COLECCIONES.dependientes, tutorId, pcdUserId, pcd.nombreCompleto)
    return { vinculado: true, pcdUserId, tutorId }
  }

  /**
   * Desvincula una cuenta PCD de su tutor de forma atómica:
   * limpia `tutorId` del perfil y elimina las relaciones en 'dependientes'.
   * Solo el tutor dueño (o un administrador) puede desvincular.
   */
  async unlinkPcdFromTutor(actorId: string, actorRol: string, pcdUserId: string) {
    const pcdDoc = await this.col(COLECCIONES.perfiles).doc(pcdUserId).get()
    if (!pcdDoc.exists) throw new NotFoundException('Usuario PCD no encontrado')

    const pcd = pcdDoc.data()!
    const tutorId = pcd.tutorId
    if (!tutorId) throw new BadRequestException('Esta cuenta PCD no está vinculada a ningún tutor')
    if (actorRol !== 'admin' && actorRol !== 'institucion' && tutorId !== actorId) {
      throw new ForbiddenException('Solo el padre/tutor dueño puede desvincular esta cuenta')
    }

    // Buscar todas las relaciones tutor ↔ PCD (incluye registros promovidos)
    const relSnap = await this.col(COLECCIONES.dependientes)
      .where('tutorId', '==', tutorId)
      .where('pcdUserId', '==', pcdUserId)
      .get()

    const batch = this.db.batch()
    batch.update(this.col(COLECCIONES.perfiles).doc(pcdUserId), { tutorId: null })
    for (const doc of relSnap.docs) {
      batch.delete(doc.ref)
    }
    await batch.commit()

    return { desvinculado: true, pcdUserId, tutorId }
  }

  // ─── Features de dependiente ────────────────────────────────────────

  /**
   * Retorna los permisos (features) de un dependiente plano o cuenta PCD
   * vinculada. Solo el tutor dueño o un administrador pueden consultarlos;
   * para cuentas vinculadas se leen los features reales del perfil de la PCD
   * (fuente de verdad).
   */
  async getDependentPermissions(usuarioId: string, dependienteId: string, rol: string) {
    const doc = await this.col(COLECCIONES.dependientes).doc(dependienteId).get()
    if (!doc.exists) throw new NotFoundException('Dependiente no encontrado')
    const data = doc.data()!

    // Solo el tutor dueño o un administrador: se usa NotFound (no Forbidden)
    // para no filtrar la existencia de dependientes ajenos.
    if (rol !== 'admin' && data.tutorId !== usuarioId) {
      throw new NotFoundException('Dependiente no encontrado')
    }

    let features: FeatureFlags = data.features ?? { ...FEATURES_POR_DEFECTO }
    if (data.esCuentaVinculada || data.pcdUserId) {
      const pcdId = data.pcdUserId ?? dependienteId
      const pcdDoc = await this.col(COLECCIONES.perfiles).doc(pcdId).get()
      if (pcdDoc.exists && pcdDoc.data()?.features) {
        features = { ...FEATURES_POR_DEFECTO, ...pcdDoc.data()!.features }
      }
    }

    return {
      dependienteId,
      nombre: data.nombreCompleto ?? null,
      esCuentaVinculada: data.esCuentaVinculada === true || !!data.pcdUserId,
      pcdUserId: data.pcdUserId ?? null,
      features,
    }
  }

  /**
   * Actualiza las banderas de funcionalidades de un dependiente plano.
   */
  async updateDependentFeatures(usuarioId: string, dependienteId: string, features: Partial<FeatureFlags>) {
    const doc = await this.col(COLECCIONES.dependientes).doc(dependienteId).get()
    if (!doc.exists || doc.data()?.tutorId !== usuarioId) {
      throw new NotFoundException('Dependiente no encontrado')
    }

    // Si es una cuenta PCD vinculada, los features viven en su perfil real:
    // delegar para mantener una única fuente de verdad.
    if (doc.data()?.esCuentaVinculada || doc.data()?.pcdUserId) {
      return this.updateLinkedPcdFeatures(usuarioId, doc.data()?.pcdUserId ?? dependienteId, features)
    }

    const existentes: FeatureFlags = doc.data()?.features ?? { ...FEATURES_POR_DEFECTO }
    const actualizados: FeatureFlags = { ...existentes, ...features }

    await this.col(COLECCIONES.dependientes).doc(dependienteId).update({ features: actualizados })
    return { id: dependienteId, features: actualizados }
  }

  /**
   * Actualiza las banderas de funcionalidades de una PCD vinculada al tutor.
   */
  async updateLinkedPcdFeatures(tutorId: string, pcdUserId: string, features: Partial<FeatureFlags>) {
    const pcdDoc = await this.col(COLECCIONES.perfiles).doc(pcdUserId).get()
    if (!pcdDoc.exists) throw new NotFoundException('Usuario PCD no encontrado')

    const pcd = pcdDoc.data()!
    if (pcd.tutorId !== tutorId) {
      throw new ForbiddenException('Esta PCD no está vinculada a tu cuenta como tutor')
    }

    const existentes: FeatureFlags = pcd.features ?? { ...FEATURES_POR_DEFECTO }
    const actualizados: FeatureFlags = { ...existentes, ...features }

    await this.col(COLECCIONES.perfiles).doc(pcdUserId).update({ features: actualizados })
    return { id: pcdUserId, features: actualizados }
  }
}
