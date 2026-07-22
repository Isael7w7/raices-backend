import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { v4 as uuid } from 'uuid'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'

@Injectable()
export class UsersService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private col(nombre: string) { return this.db.collection(nombre) }

  async getProfile(usuarioId: string) {
    const doc = await this.col(COLECCIONES.perfiles).doc(usuarioId).get()
    if (!doc.exists) throw new NotFoundException('User not found')
    const perfil = { id: doc.id, ...doc.data()! }

    const perfilExtendidoSnap = await this.col(COLECCIONES.perfilesExtendidos)
      .where('usuarioId', '==', usuarioId).limit(1).get()
    const perfilExtendido = perfilExtendidoSnap.empty ? null : perfilExtendidoSnap.docs[0].data()

    return {
      ...perfil,
      perfilNecesidades: perfilExtendido ? {
        ...perfilExtendido,
        tiposDiscapacidad: this.parsearCampoJson(perfilExtendido.tiposDiscapacidad),
        necesidades: this.parsearCampoJson(perfilExtendido.necesidades),
        historialEducacion: this.parsearCampoJson(perfilExtendido.historialEducacion),
        historialTerapia: this.parsearCampoJson(perfilExtendido.historialTerapia),
        metasActuales: this.parsearCampoJson(perfilExtendido.metasActuales),
        areasApoyo: this.parsearCampoJson(perfilExtendido.areasApoyo),
        modosComunicacion: this.parsearCampoJson(perfilExtendido.modosComunicacion),
        necesidadesMovilidad: this.parsearCampoJson(perfilExtendido.necesidadesMovilidad),
        accesoTecnologia: this.parsearCampoJson(perfilExtendido.accesoTecnologia),
        zonasPreferidas: this.parsearCampoJson(perfilExtendido.zonasPreferidas),
      } : null,
    }
  }

  async updateProfile(usuarioId: string, datos: any) {
    const datosSeguros = datos ?? {}
    const camposActualizables = ['nombreCompleto', 'ciudad', 'estado', 'urlAvatar']
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
      const id = uuid()
      await this.col(COLECCIONES.perfilesExtendidos).doc(id).set({ id, usuarioId, ...carga })
    }
    return { exito: true }
  }

  async getDependents(usuarioId: string) {
    const snap = await this.col(COLECCIONES.dependientes)
      .where('tutorId', '==', usuarioId).get()

    // Quitamos .orderBy() de Firestore para evitar error de índice compuesto
    const dependientes = snap.docs.map(d => this.formatearDependiente({ id: d.id, ...d.data() }))
    dependientes.sort((a, b) => (a.fechaCreacion ?? '').localeCompare(b.fechaCreacion ?? ''))
    return dependientes
  }

  async addDependent(usuarioId: string, datos: any) {
    const id = uuid()
    await this.col(COLECCIONES.dependientes).doc(id).set({
      id, tutorId: usuarioId,
      nombreCompleto: datos.nombreCompleto ?? 'Sin nombre',
      parentesco: datos.parentesco ?? 'familiar',
      datosPerfil: JSON.stringify({
        tiposDiscapacidad: datos.tiposDiscapacidad ?? [],
        rangoEdad: datos.rangoEdad ?? null,
        etapaVida: datos.etapaVida ?? null,
        notas: datos.notas ?? '',
      }),
      fechaCreacion: new Date().toISOString(),
    })
    const fila = await this.col(COLECCIONES.dependientes).doc(id).get()
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

  async deleteDependent(usuarioId: string, id: string) {
    const existente = await this.col(COLECCIONES.dependientes).doc(id).get()
    if (!existente.exists || existente.data()?.tutorId !== usuarioId) throw new NotFoundException('Dependiente no encontrado')
    await this.col(COLECCIONES.dependientes).doc(id).delete()
    return { exito: true }
  }

  private formatearDependiente(d: any) {
    if (!d) return d
    const p = this.parsearObjeto(d.datosPerfil)
    return {
      id: d.id,
      nombreCompleto: d.nombreCompleto,
      parentesco: d.parentesco,
      tiposDiscapacidad: Array.isArray(p.tiposDiscapacidad) ? p.tiposDiscapacidad : [],
      rangoEdad: p.rangoEdad ?? null,
      etapaVida: p.etapaVida ?? null,
      notas: p.notas ?? '',
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
}
