import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { FEATURES_POR_DEFECTO, FeatureFlags } from '../../common/interfaces/feature-flags.interface'
import { StorageService } from '../storage/storage.service'
import { extractStoragePath } from '../../common/utils/storage-path.util'
import { obtenerDocumentosPorIds } from '../../common/utils/firestore-helpers'

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
    const perfil = { id: doc.id, ...doc.data()! }

    const perfilExtendidoSnap = await this.col(COLECCIONES.perfilesExtendidos)
      .where('usuarioId', '==', usuarioId).limit(1).get()
    const perfilExtendido = perfilExtendidoSnap.empty ? null : perfilExtendidoSnap.docs[0].data()

    return {
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
      } : null,
    }
  }

  async deleteAvatar(usuarioId: string) {
    const doc = await this.col(COLECCIONES.perfiles).doc(usuarioId).get()
    if (!doc.exists) throw new NotFoundException('Usuario no encontrado')

    const perfil = doc.data()!
    const urlAvatar: string | undefined = perfil.urlAvatar

    if (urlAvatar) {
      try {
        const filePath = extractStoragePath(urlAvatar)
        if (filePath) {
          await this.storage.delete(filePath)
        }
      } catch (err: any) {
        this.logger.warn(`No se pudo eliminar archivo de Storage: ${err.message}`)
      }
    }

    await this.col(COLECCIONES.perfiles).doc(usuarioId).update({ urlAvatar: null })
  }



  async updateAvatar(usuarioId: string, urlAvatar: string) {
    // 1. Obtener avatar anterior para limpiarlo de Storage
    const doc = await this.col(COLECCIONES.perfiles).doc(usuarioId).get()
    const urlAnterior = doc.exists ? doc.data()?.urlAvatar : undefined

    if (urlAnterior) {
      try {
        const filePath = extractStoragePath(urlAnterior)
        if (filePath) await this.storage.delete(filePath)
      } catch (err: any) {
        this.logger.warn(`No se pudo eliminar avatar anterior de Storage: ${err.message}`)
      }
    }

    // 2. Actualizar la URL en Firestore
    try {
      await this.col(COLECCIONES.perfiles).doc(usuarioId).update({ urlAvatar })
      return { urlAvatar }
    } catch (dbError: any) {
      console.error('Error al guardar avatarUrl en Firestore:', dbError)
      return { urlAvatar }
    }
  }

  async updateProfile(usuarioId: string, datos: any) {
    const datosSeguros = datos ?? {}
    const camposActualizables = ['nombreCompleto', 'ciudad', 'estado', 'urlAvatar', 'profesion', 'bio']
    const carga: Record<string, any> = {}
    for (const campo of camposActualizables) {
      if (datosSeguros[campo] !== undefined) {
        carga[campo] = datosSeguros[campo]
      }
    }
    if (Object.keys(carga).length === 0) {
      return this.getProfile(usuarioId)
    }
    await this.col(COLECCIONES.perfiles).doc(usuarioId).update(carga)
    return this.getProfile(usuarioId)
  }

  async saveProfilingData(usuarioId: string, datos: any) {
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

  async getDependents(usuarioId: string) {
    const snap = await this.col(COLECCIONES.dependientes)
      .where('tutorId', '==', usuarioId).get()

    const dependientes = snap.docs.map(d => this.formatearDependiente({ id: d.id, ...d.data() }))

    // Las cuentas PCD vinculadas guardan sus features reales en su perfil;
    // enriquecerlas para que la lista refleje el estado actualizado.
    const pcdIds = dependientes.filter(d => d.esCuentaVinculada).map(d => d.id)
    if (pcdIds.length > 0) {
      const mapaPerfiles = await obtenerDocumentosPorIds(this.db, COLECCIONES.perfiles, pcdIds)
      for (const dep of dependientes) {
        if (dep.esCuentaVinculada) {
          const perfil = mapaPerfiles.get(dep.id)
          if (perfil?.features) dep.features = { ...FEATURES_POR_DEFECTO, ...perfil.features }
        }
      }
    }

    dependientes.sort((a, b) => (a.fechaCreacion ?? '').localeCompare(b.fechaCreacion ?? ''))
    return dependientes
  }

  async addDependent(usuarioId: string, datos: any) {
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
      fechaCreacion: new Date().toISOString(),
    })
    const fila = await this.col(COLECCIONES.dependientes).doc(ref.id).get()
    return this.formatearDependiente({ id: fila.id, ...fila.data()! })
  }

  async updateDependent(usuarioId: string, id: string, datos: any) {
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
    return this.formatearDependiente({ id: fila.id, ...fila.data()! })
  }

  async getDependent(usuarioId: string, id: string) {
    const doc = await this.col(COLECCIONES.dependientes).doc(id).get()
    if (!doc.exists || doc.data()?.tutorId !== usuarioId) {
      throw new NotFoundException('Dependiente no encontrado')
    }
    const dependiente = this.formatearDependiente({ id: doc.id, ...doc.data()! })

    // Para cuentas PCD vinculadas, los features reales viven en su perfil
    if (dependiente.esCuentaVinculada) {
      const perfil = await this.col(COLECCIONES.perfiles).doc(dependiente.pcdUserId ?? id).get()
      if (perfil.exists && perfil.data()?.features) {
        dependiente.features = { ...FEATURES_POR_DEFECTO, ...perfil.data()!.features }
      }
    }
    return dependiente
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

  private formatearDependiente(d: any) {
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
      esCuentaVinculada: d.esCuentaVinculada === true || !!d.pcdUserId,
      pcdUserId: d.pcdUserId ?? null,
      features: d.features ?? { ...FEATURES_POR_DEFECTO },
      fechaCreacion: d.fechaCreacion,
    }
  }

  private parsearCampoJson(valor: any) {
    if (typeof valor === 'string') {
      try { return JSON.parse(valor) }
      catch { return valor }
    }
    return valor
  }

  private parsearObjeto(valor: any) {
    if (!valor) return {}
    try { const p = JSON.parse(valor); return p && typeof p === 'object' ? p : {} } catch { return {} }
  }

  // ─── Vinculación PCD ↔ Tutor ───────────────────────────────────────

  /**
   * Vincula una cuenta PCD existente a un Tutor.
   * Solo el tutor puede vincular. La PCD no debe estar ya vinculada a otro tutor.
   */
  async linkPcdToTutor(tutorId: string, pcdUserId: string) {
    const pcdDoc = await this.col(COLECCIONES.perfiles).doc(pcdUserId).get()
    if (!pcdDoc.exists) throw new NotFoundException('Usuario PCD no encontrado')

    const pcd = pcdDoc.data()!
    if (pcd.rol !== 'pcd') {
      throw new BadRequestException('Solo se pueden vincular cuentas con rol PCD')
    }
    if (pcd.tutorId) {
      throw new BadRequestException('Esta cuenta PCD ya está vinculada a un tutor')
    }

    await this.col(COLECCIONES.perfiles).doc(pcdUserId).update({ tutorId })
    await this.crearRegistroDependienteVinculado(tutorId, pcdUserId, pcd.nombreCompleto)
    return { vinculado: true, pcdUserId, tutorId }
  }

  /**
   * Registra la relación tutor ↔ PCD en la colección 'dependientes' para que
   * la persona vinculada aparezca en la lista de personas bajo cuidado del tutor.
   */
  private async crearRegistroDependienteVinculado(tutorId: string, pcdUserId: string, nombreCompleto?: string) {
    await this.col(COLECCIONES.dependientes).doc(pcdUserId).set({
      id: pcdUserId,
      tutorId,
      pcdUserId,
      esCuentaVinculada: true,
      rol: 'pcd',
      nombreCompleto: nombreCompleto ?? 'Sin nombre',
      parentesco: null,
      datosPerfil: '{}',
      fechaCreacion: new Date().toISOString(),
    }, { merge: true })
  }

  // ─── Features de dependiente ────────────────────────────────────────

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
