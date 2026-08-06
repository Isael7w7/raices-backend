import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { paginar, ordenar, RespuestaPaginada } from '../../common/dto/paginacion.dto'

@Injectable()
export class ReviewsService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async findByInstitution(institucionId: string, pagina = 1, limite = 20, ordenarPor?: string, direccion?: 'asc' | 'desc', buscar?: string): Promise<RespuestaPaginada<any>> {
    const revSnap = await this.db.collection(COLECCIONES.resenas)
      .where('institucionId', '==', institucionId).get()

    // Quitamos .orderBy() de Firestore para evitar error de índice compuesto
    const resenas = revSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
    resenas.sort((a, b) => (b.fechaCreacion ?? '').localeCompare(a.fechaCreacion ?? ''))

    const usuariosIds = [...new Set(resenas.map(r => r.usuarioId))]
    const mapaUsuarios = new Map<string, any>()
    for (const uid of usuariosIds) {
      const doc = await this.db.collection(COLECCIONES.perfiles).doc(uid).get()
      if (doc.exists) mapaUsuarios.set(uid, doc.data())
    }

    let todos = resenas.map(r => ({
      id: r.id, calificacion: r.calificacion, comentario: r.comentario, fechaCreacion: r.fechaCreacion,
      nombreCompleto: mapaUsuarios.get(r.usuarioId)?.nombreCompleto ?? null,
      urlAvatar: mapaUsuarios.get(r.usuarioId)?.urlAvatar ?? null,
    }))

    if (buscar) {
      const termino = buscar.toLowerCase()
      todos = todos.filter(r =>
        (r.comentario ?? '').toLowerCase().includes(termino) ||
        (r.nombreCompleto ?? '').toLowerCase().includes(termino)
      )
    }
    todos = ordenar(todos, ordenarPor ?? 'fechaCreacion', direccion ?? 'desc')

    const total = todos.length
    const inicio = (pagina - 1) * limite
    return paginar(todos.slice(inicio, inicio + limite), total, pagina, limite)
  }

  async submit(usuarioId: string, institucionId: string, calificacion: number, comentario: string) {
    // ID determinista (usuario_institución): impide reseñas duplicadas del
    // mismo usuario en la misma institución incluso bajo concurrencia, porque
    // el documento o existe o no existe (no hay ventana de doble creación).
    const refResena = this.db.collection(COLECCIONES.resenas).doc(`${usuarioId}_${institucionId}`)

    await this.db.runTransaction(async (tx) => {
      // Firestore exige TODAS las lecturas ANTES de cualquier escritura dentro
      // de una transacción: se leen la reseña y todas las reseñas de la
      // institución con una sola fotografía consistente, y luego se escribe.
      const [snapResena, todasRev] = await Promise.all([
        tx.get(refResena),
        tx.get(
          this.db.collection(COLECCIONES.resenas).where('institucionId', '==', institucionId),
        ),
      ])
      const esNueva = !snapResena.exists

      if (esNueva) {
        tx.set(refResena, {
          id: refResena.id, usuarioId, institucionId,
          calificacion, comentario, fechaCreacion: new Date().toISOString(),
        })
      } else {
        tx.update(refResena, { calificacion, comentario, fechaActualizacion: new Date().toISOString() })
      }

      // Promedio y contador calculados con la misma fotografía consistente de
      // la transacción: dos envíos simultáneos no pueden pisarse ni dejar
      // contadores incorrectos.
      const calificaciones = todasRev.docs.map(d => d.data().calificacion as number)
      const promedio = calificaciones.length === 0
        ? 0
        : calificaciones.reduce((s, r) => s + r, 0) / calificaciones.length
      tx.update(this.db.collection(COLECCIONES.instituciones).doc(institucionId), {
        calificacionPromedio: parseFloat(promedio.toFixed(2)),
        cantidadCalificaciones: calificaciones.length,
      })
    })

    return { id: refResena.id, usuarioId, institucionId, calificacion, comentario, fechaCreacion: new Date().toISOString() }
  }

  async myReviews(usuarioId: string, pagina = 1, limite = 20, ordenarPor?: string, direccion?: 'asc' | 'desc', buscar?: string): Promise<RespuestaPaginada<any>> {
    const revSnap = await this.db.collection(COLECCIONES.resenas)
      .where('usuarioId', '==', usuarioId).get()

    // Quitamos .orderBy() de Firestore para evitar error de índice compuesto
    const resenas = revSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
    resenas.sort((a, b) => (b.fechaCreacion ?? '').localeCompare(a.fechaCreacion ?? ''))

    const instIds = [...new Set(resenas.map(r => r.institucionId))]
    const mapaInst = new Map<string, any>()
    for (const iid of instIds) {
      const doc = await this.db.collection(COLECCIONES.instituciones).doc(iid).get()
      if (doc.exists) mapaInst.set(iid, doc.data())
    }

    let todos = resenas.map(r => ({
      ...r,
      nombreInstitucion: mapaInst.get(r.institucionId)?.nombre ?? null,
      categoria: mapaInst.get(r.institucionId)?.categoria ?? null,
    }))

    if (buscar) {
      const termino = buscar.toLowerCase()
      todos = todos.filter(r =>
        (r.comentario ?? '').toLowerCase().includes(termino) ||
        (r.nombreInstitucion ?? '').toLowerCase().includes(termino)
      )
    }
    todos = ordenar(todos, ordenarPor ?? 'fechaCreacion', direccion ?? 'desc')

    const total = todos.length
    const inicio = (pagina - 1) * limite
    return paginar(todos.slice(inicio, inicio + limite), total, pagina, limite)
  }

  async update(id: string, usuarioId: string, dto: { calificacion?: number; comentario?: string }) {
    const doc = await this.db.collection(COLECCIONES.resenas).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Reseña no encontrada')
    const resena = doc.data() as any
    if (resena.usuarioId !== usuarioId) throw new ForbiddenException('No tienes permiso para editar esta reseña')

    const campos: Record<string, any> = {}
    if (dto.calificacion !== undefined) campos.calificacion = dto.calificacion
    if (dto.comentario !== undefined) campos.comentario = dto.comentario
    if (Object.keys(campos).length === 0) return { id, ...resena }

    await doc.ref.update(campos)
    await this.recalcularPromedio(resena.institucionId)
    return { id, ...resena, ...campos }
  }

  async remove(id: string, usuarioId: string) {
    const doc = await this.db.collection(COLECCIONES.resenas).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Reseña no encontrada')
    const resena = doc.data() as any
    if (resena.usuarioId !== usuarioId) throw new ForbiddenException('No tienes permiso para eliminar esta reseña')

    const institucionId = resena.institucionId
    await doc.ref.delete()
    await this.recalcularPromedio(institucionId)
    return { eliminado: true }
  }

  /**
   * Recalcula el promedio de una institución de forma atómica: la lectura de
   * todas sus reseñas y la escritura del promedio ocurren en una sola
   * transacción, evitando carreras entre ediciones/eliminaciones simultáneas.
   */
  private async recalcularPromedio(institucionId: string) {
    await this.db.runTransaction(async (tx) => {
      const todasRev = await tx.get(
        this.db.collection(COLECCIONES.resenas).where('institucionId', '==', institucionId),
      )
      if (todasRev.empty) {
        tx.update(this.db.collection(COLECCIONES.instituciones).doc(institucionId), {
          calificacionPromedio: 0, cantidadCalificaciones: 0,
        })
      } else {
        const calificaciones = todasRev.docs.map(d => d.data().calificacion as number)
        const promedio = calificaciones.reduce((s, r) => s + r, 0) / calificaciones.length
        tx.update(this.db.collection(COLECCIONES.instituciones).doc(institucionId), {
          calificacionPromedio: parseFloat(promedio.toFixed(2)),
          cantidadCalificaciones: calificaciones.length,
        })
      }
    })
  }
}
