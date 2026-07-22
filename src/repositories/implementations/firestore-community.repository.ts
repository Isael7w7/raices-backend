import { Injectable, Inject } from '@nestjs/common'
import { Firestore, CollectionReference, Query, FieldValue } from 'firebase-admin/firestore'
import { randomUUID } from 'crypto'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import type {
  GrupoComunidad,
  Publicacion,
  Comentario,
  MeGusta,
  CrearPublicacionDatos,
  CrearComentarioDatos,
  IRepositorioComunidad,
} from '../interfaces/community.repository.interface'

@Injectable()
export class RepositorioComunidadFirestore implements IRepositorioComunidad {
  private readonly colGrupos: CollectionReference
  private readonly colPublicaciones: CollectionReference
  private readonly colComentarios: CollectionReference
  private readonly colMeGustas: CollectionReference

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {
    this.colGrupos = this.db.collection(COLECCIONES.grupos)
    this.colPublicaciones = this.db.collection(COLECCIONES.publicaciones)
    this.colComentarios = this.db.collection(COLECCIONES.comentarios)
    this.colMeGustas = this.db.collection(COLECCIONES.meGustas)
  }

  // ── Grupos ────────────────────────────────────────────────────────────

  async listarGruposPublicos(): Promise<GrupoComunidad[]> {
    const snap = await this.colGrupos
      .where('esPublico', '==', true)
      .orderBy('cantidadMiembros', 'desc')
      .get()
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as GrupoComunidad))
  }

  // ── Publicaciones ─────────────────────────────────────────────────────

  async listarPublicaciones(grupoId?: string, limite = 20): Promise<Publicacion[]> {
    let q: Query = this.colPublicaciones
    if (grupoId) {
      q = q.where('grupoId', '==', grupoId)
    }
    const snap = await q.orderBy('fechaCreacion', 'desc').limit(limite).get()
    return snap.docs.map((d) => this.publicacionADominio(d.id, d.data()))
  }

  async buscarPublicacionPorId(id: string): Promise<Publicacion | null> {
    const doc = await this.colPublicaciones.doc(id).get()
    if (!doc.exists) return null
    return this.publicacionADominio(doc.id, doc.data()!)
  }

  async crearPublicacion(datos: CrearPublicacionDatos): Promise<Publicacion> {
    const id = randomUUID()
    const ahora = new Date().toISOString()
    const publicacion: Publicacion = {
      id,
      autorId: datos.autorId,
      contenido: datos.contenido,
      grupoId: datos.grupoId ?? null,
      cantidadMeGustas: 0,
      fechaCreacion: ahora,
    }
    await this.colPublicaciones.doc(id).set(publicacion)
    return publicacion
  }

  async incrementarMeGustas(publicacionId: string): Promise<void> {
    await this.colPublicaciones.doc(publicacionId).update({
      cantidadMeGustas: FieldValue.increment(1),
    })
  }

  async decrementarMeGustas(publicacionId: string): Promise<void> {
    await this.colPublicaciones.doc(publicacionId).update({
      cantidadMeGustas: FieldValue.increment(-1),
    })
  }

  async contarTodasPublicaciones(): Promise<number> {
    const snap = await this.colPublicaciones.get()
    return snap.size
  }

  // ── Comentarios ───────────────────────────────────────────────────────

  async listarComentariosPorPublicacion(publicacionId: string): Promise<Comentario[]> {
    const snap = await this.colComentarios
      .where('publicacionId', '==', publicacionId)
      .orderBy('fechaCreacion', 'asc')
      .get()
    return snap.docs.map((d) => this.comentarioADominio(d.id, d.data()))
  }

  async crearComentario(datos: CrearComentarioDatos): Promise<Comentario> {
    const id = randomUUID()
    const ahora = new Date().toISOString()
    const comentario: Comentario = {
      id,
      publicacionId: datos.publicacionId,
      autorId: datos.autorId,
      contenido: datos.contenido,
      fechaCreacion: ahora,
    }
    await this.colComentarios.doc(id).set(comentario)
    return comentario
  }

  // ── Likes ─────────────────────────────────────────────────────────────

  async listarMeGustasPorUsuario(usuarioId: string): Promise<MeGusta[]> {
    const snap = await this.colMeGustas.where('usuarioId', '==', usuarioId).get()
    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as MeGusta[]
  }

  async buscarMeGustaPorUsuarioYPublicacion(
    usuarioId: string,
    publicacionId: string,
  ): Promise<MeGusta | null> {
    const snap = await this.colMeGustas
      .where('usuarioId', '==', usuarioId)
      .where('publicacionId', '==', publicacionId)
      .limit(1)
      .get()
    if (snap.empty) return null
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as MeGusta
  }

  async crearMeGusta(usuarioId: string, publicacionId: string): Promise<void> {
    await this.colMeGustas.doc(randomUUID()).set({
      usuarioId,
      publicacionId,
    })
  }

  async eliminarMeGustaPorId(meGustaId: string): Promise<void> {
    await this.colMeGustas.doc(meGustaId).delete()
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private publicacionADominio(
    id: string,
    data: FirebaseFirestore.DocumentData,
  ): Publicacion {
    return {
      id,
      autorId: data.autorId ?? '',
      contenido: data.contenido ?? '',
      grupoId: data.grupoId ?? null,
      cantidadMeGustas: data.cantidadMeGustas ?? 0,
      fechaCreacion: data.fechaCreacion ?? '',
    }
  }

  private comentarioADominio(
    id: string,
    data: FirebaseFirestore.DocumentData,
  ): Comentario {
    return {
      id,
      publicacionId: data.publicacionId ?? '',
      autorId: data.autorId ?? '',
      contenido: data.contenido ?? '',
      fechaCreacion: data.fechaCreacion ?? '',
    }
  }
}
