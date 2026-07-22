import { Injectable, Inject } from '@nestjs/common'
import { Firestore, CollectionReference } from 'firebase-admin/firestore'
import { randomUUID } from 'crypto'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import type {
  PerfilUsuario,
  PerfilNecesidades,
  CrearPerfilDatos,
  ActualizarPerfilDatos,
  ActualizarPerfilNecesidadesDatos,
  IRepositorioPerfil,
} from '../interfaces/profile.repository.interface'

@Injectable()
export class RepositorioPerfilFirestore implements IRepositorioPerfil {
  private readonly colPerfiles: CollectionReference
  private readonly colPerfilesExtendidos: CollectionReference

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {
    this.colPerfiles = this.db.collection(COLECCIONES.perfiles)
    this.colPerfilesExtendidos = this.db.collection(COLECCIONES.perfilesExtendidos)
  }

  // ── Perfiles de usuario (perfiles) ──────────────────────────────────

  async buscarPorId(id: string): Promise<PerfilUsuario | null> {
    const doc = await this.colPerfiles.doc(id).get()
    if (!doc.exists) return null
    return this.perfilADominio(doc.id, doc.data()!)
  }

  async buscarPorEmail(email: string): Promise<PerfilUsuario | null> {
    const snap = await this.colPerfiles.where('email', '==', email).limit(1).get()
    if (snap.empty) return null
    const doc = snap.docs[0]
    return this.perfilADominio(doc.id, doc.data())
  }

  async crear(datos: CrearPerfilDatos): Promise<PerfilUsuario> {
    const ahora = new Date().toISOString()
    await this.colPerfiles.doc(datos.id).set({
      id: datos.id,
      email: datos.email,
      nombreCompleto: datos.nombreCompleto,
      rol: datos.rol,
      ciudad: datos.ciudad ?? null,
      estado: datos.estado ?? null,
      urlAvatar: null,
      activo: true,
      verificado: false,
      fechaCreacion: ahora,
    })
    return (await this.buscarPorId(datos.id))!
  }

  async actualizar(id: string, datos: ActualizarPerfilDatos): Promise<void> {
    const datosActualizados: Record<string, any> = { ...datos, fechaActualizacion: new Date().toISOString() }
    await this.colPerfiles.doc(id).update(datosActualizados)
  }

  async actualizarCampos(id: string, campos: Record<string, any>): Promise<void> {
    campos.fechaActualizacion = new Date().toISOString()
    await this.colPerfiles.doc(id).update(campos)
  }

  async eliminarSuave(id: string): Promise<void> {
    await this.colPerfiles.doc(id).update({
      activo: false,
      fechaActualizacion: new Date().toISOString(),
    })
  }

  async existePorEmail(email: string): Promise<boolean> {
    const snap = await this.colPerfiles.where('email', '==', email).limit(1).get()
    return !snap.empty
  }

  async listarTodos(campoOrden = 'fechaCreacion'): Promise<PerfilUsuario[]> {
    const snap = await this.colPerfiles.orderBy(campoOrden, 'desc').get()
    return snap.docs.map((d) => this.perfilADominio(d.id, d.data()))
  }

  async contarActivos(): Promise<number> {
    const snap = await this.colPerfiles.where('activo', '==', true).get()
    return snap.size
  }

  async contarTodos(): Promise<number> {
    const snap = await this.colPerfiles.get()
    return snap.size
  }

  async listarPorRol(rol: string): Promise<PerfilUsuario[]> {
    const snap = await this.colPerfiles.where('rol', '==', rol).get()
    return snap.docs.map((d) => this.perfilADominio(d.id, d.data()))
  }

  // ── Perfiles extendidos de necesidades (perfilesExtendidos) ──────────

  async buscarPerfilNecesidadesPorUsuario(usuarioId: string): Promise<PerfilNecesidades | null> {
    const snap = await this.colPerfilesExtendidos
      .where('usuarioId', '==', usuarioId)
      .limit(1)
      .get()
    if (snap.empty) return null
    return this.necesidadesADominio(snap.docs[0].id, snap.docs[0].data())
  }

  async guardarPerfilNecesidades(
    usuarioId: string,
    datos: ActualizarPerfilNecesidadesDatos,
  ): Promise<PerfilNecesidades> {
    const existente = await this.buscarPerfilNecesidadesPorUsuario(usuarioId)

    const carga: Record<string, any> = {
      tiposDiscapacidad: this.serializar(datos.tiposDiscapacidad),
      severidadDiscapacidad: datos.severidadDiscapacidad ?? null,
      modosComunicacion: this.serializar(datos.modosComunicacion),
      necesidadesMovilidad: this.serializar(datos.necesidadesMovilidad),
      accesoTecnologia: this.serializar(datos.accesoTecnologia),
      zonasPreferidas: this.serializar(datos.zonasPreferidas),
      necesidades: this.serializar(datos.necesidades),
      metasActuales: this.serializar(datos.metasActuales),
      areasApoyo: this.serializar(datos.areasApoyo),
      historialEducacion: this.serializar(datos.historialEducacion),
      historialTerapia: this.serializar(datos.historialTerapia),
      etapaVida: datos.etapaVida ?? null,
      preocupacionesActuales: datos.preocupacionesActuales ?? null,
      nivelApoyo: datos.nivelApoyo ?? null,
    }

    if (existente) {
      await this.colPerfilesExtendidos.doc(existente.id).update(carga)
      return (await this.buscarPerfilNecesidadesPorUsuario(usuarioId))!
    }

    const id = randomUUID()
    await this.colPerfilesExtendidos.doc(id).set({
      id,
      usuarioId,
      ...carga,
    })
    return (await this.buscarPerfilNecesidadesPorUsuario(usuarioId))!
  }

  async contarPerfilesNecesidades(): Promise<number> {
    const snap = await this.colPerfilesExtendidos.get()
    return snap.size
  }

  async listarTodosPerfilesNecesidades(): Promise<PerfilNecesidades[]> {
    const snap = await this.colPerfilesExtendidos.get()
    return snap.docs.map((d) => this.necesidadesADominio(d.id, d.data()))
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private perfilADominio(
    id: string,
    data: FirebaseFirestore.DocumentData,
  ): PerfilUsuario {
    return {
      id,
      email: data.email ?? '',
      nombreCompleto: data.nombreCompleto ?? '',
      rol: data.rol ?? '',
      ciudad: data.ciudad ?? '',
      estado: data.estado ?? '',
      urlAvatar: data.urlAvatar ?? null,
      activo: data.activo ?? false,
      verificado: data.verificado ?? false,
      fechaCreacion: data.fechaCreacion ?? '',
    }
  }

  private necesidadesADominio(
    id: string,
    data: FirebaseFirestore.DocumentData,
  ): PerfilNecesidades {
    return {
      id,
      usuarioId: data.usuarioId ?? '',
      tiposDiscapacidad: this.parsearArreglo(data.tiposDiscapacidad),
      severidadDiscapacidad: data.severidadDiscapacidad ?? null,
      modosComunicacion: this.parsearArreglo(data.modosComunicacion),
      necesidadesMovilidad: this.parsearArreglo(data.necesidadesMovilidad),
      accesoTecnologia: this.parsearArreglo(data.accesoTecnologia),
      zonasPreferidas: this.parsearArreglo(data.zonasPreferidas),
      necesidades: this.parsearArreglo(data.necesidades),
      metasActuales: this.parsearArreglo(data.metasActuales),
      areasApoyo: this.parsearArreglo(data.areasApoyo),
      historialEducacion: this.parsearArreglo(data.historialEducacion),
      historialTerapia: this.parsearArreglo(data.historialTerapia),
      etapaVida: data.etapaVida ?? null,
      preocupacionesActuales: data.preocupacionesActuales ?? null,
      nivelApoyo: data.nivelApoyo ?? null,
    }
  }

  private parsearArreglo(valor: any): string[] {
    if (!valor) return []
    try {
      const p = JSON.parse(valor)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }

  private serializar(arreglo: any[] | undefined): string {
    return JSON.stringify(arreglo ?? [])
  }
}
