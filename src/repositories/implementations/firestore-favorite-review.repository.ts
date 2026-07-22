import { Injectable, Inject } from '@nestjs/common'
import { Firestore, CollectionReference } from 'firebase-admin/firestore'
import { randomUUID } from 'crypto'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import type {
  Resena,
  Favorito,
  CrearResenaDatos,
  IRepositorioFavoritoResena,
} from '../interfaces/favorite-review.repository.interface'

@Injectable()
export class RepositorioFavoritoResenaFirestore implements IRepositorioFavoritoResena {
  private readonly colFavoritos: CollectionReference
  private readonly colResenas: CollectionReference

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {
    this.colFavoritos = this.db.collection(COLECCIONES.favoritos)
    this.colResenas = this.db.collection(COLECCIONES.resenas)
  }

  // ── Favoritos ──────────────────────────────────────────────────────────

  async listarFavoritosPorUsuario(usuarioId: string): Promise<Favorito[]> {
    const snap = await this.colFavoritos.where('usuarioId', '==', usuarioId).get()
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Favorito))
  }

  async buscarFavoritoPorUsuarioEInstitucion(
    usuarioId: string,
    institucionId: string,
  ): Promise<Favorito | null> {
    const snap = await this.colFavoritos
      .where('usuarioId', '==', usuarioId)
      .where('institucionId', '==', institucionId)
      .limit(1)
      .get()
    if (snap.empty) return null
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as Favorito
  }

  async crearFavorito(usuarioId: string, institucionId: string): Promise<void> {
    await this.colFavoritos.doc(randomUUID()).set({
      usuarioId,
      institucionId,
      fechaCreacion: new Date().toISOString(),
    })
  }

  async eliminarFavorito(favoritoId: string): Promise<void> {
    await this.colFavoritos.doc(favoritoId).delete()
  }

  async obtenerIdsInstitucionesFavoritas(usuarioId: string): Promise<string[]> {
    const snap = await this.colFavoritos.where('usuarioId', '==', usuarioId).get()
    return snap.docs.map((d) => d.data().institucionId as string)
  }

  // ── Reseñas ────────────────────────────────────────────────────────────

  async listarResenasPorInstitucion(institucionId: string): Promise<Resena[]> {
    const snap = await this.colResenas
      .where('institucionId', '==', institucionId)
      .orderBy('fechaCreacion', 'desc')
      .get()
    return snap.docs.map((d) => this.resenaADominio(d.id, d.data()))
  }

  async buscarResenaPorUsuarioEInstitucion(
    usuarioId: string,
    institucionId: string,
  ): Promise<Resena | null> {
    const snap = await this.colResenas
      .where('usuarioId', '==', usuarioId)
      .where('institucionId', '==', institucionId)
      .limit(1)
      .get()
    if (snap.empty) return null
    return this.resenaADominio(snap.docs[0].id, snap.docs[0].data())
  }

  async buscarResenaPorId(id: string): Promise<Resena | null> {
    const doc = await this.colResenas.doc(id).get()
    if (!doc.exists) return null
    return this.resenaADominio(doc.id, doc.data()!)
  }

  async crearResena(datos: CrearResenaDatos): Promise<Resena> {
    const id = randomUUID()
    const ahora = new Date().toISOString()
    const resena: Resena = {
      id,
      usuarioId: datos.usuarioId,
      institucionId: datos.institucionId,
      calificacion: datos.calificacion,
      comentario: datos.comentario,
      fechaCreacion: ahora,
    }
    await this.colResenas.doc(id).set(resena)
    return resena
  }

  async actualizarResena(id: string, calificacion: number, comentario: string): Promise<void> {
    await this.colResenas.doc(id).update({ calificacion, comentario })
  }

  async listarResenasPorUsuario(usuarioId: string): Promise<Resena[]> {
    const snap = await this.colResenas
      .where('usuarioId', '==', usuarioId)
      .orderBy('fechaCreacion', 'desc')
      .get()
    return snap.docs.map((d) => this.resenaADominio(d.id, d.data()))
  }

  async listarTodasResenas(limite = 100): Promise<Resena[]> {
    const snap = await this.colResenas.orderBy('fechaCreacion', 'desc').limit(limite).get()
    return snap.docs.map((d) => this.resenaADominio(d.id, d.data()))
  }

  async eliminarResena(id: string): Promise<void> {
    await this.colResenas.doc(id).delete()
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private resenaADominio(
    id: string,
    data: FirebaseFirestore.DocumentData,
  ): Resena {
    return {
      id,
      usuarioId: data.usuarioId ?? '',
      institucionId: data.institucionId ?? '',
      calificacion: data.calificacion ?? 0,
      comentario: data.comentario ?? '',
      fechaCreacion: data.fechaCreacion ?? '',
    }
  }
}
