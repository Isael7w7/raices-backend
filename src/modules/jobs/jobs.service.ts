import { Injectable, Inject, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { parsearTiposDiscapacidad, obtenerDocumentosPorIds } from '../../common/utils/firestore-helpers'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { paginar, ordenar, RespuestaPaginada } from '../../common/dto/paginacion.dto'
import { NotificationsService } from '../notifications/notifications.service'
import { ActualizarEstadoPostulacionDto } from './dto/actualizar-estado-postulacion.dto'

@Injectable()
export class JobsService {
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly notificaciones: NotificationsService,
  ) {}

  async findAll(filtros: { ciudad?: string; modalidad?: string; tiposDiscapacidad?: string; pagina?: number; limite?: number; ordenarPor?: string; direccion?: 'asc' | 'desc'; buscar?: string } = {}): Promise<RespuestaPaginada<any>> {
    const pagina = filtros.pagina ?? 1
    const limite = filtros.limite ?? 20

    let q = this.db.collection(COLECCIONES.vacantes).where('activa', '==', true)
    if (filtros.modalidad) q = q.where('modalidad', '==', filtros.modalidad)

    // Quitamos .orderBy() de Firestore para evitar error de índice compuesto
    const snap = await q.get()
    let vacantes = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    // Ordenar en memoria por fecha de creación descendente
    vacantes.sort((a, b) => (b.fechaCreacion ?? '').localeCompare(a.fechaCreacion ?? ''))

    // Batch lookup de instituciones en lugar de N+1 queries
    const instIds = [...new Set(vacantes.map(v => v.institucionId))]
    const mapaInstRaw = await obtenerDocumentosPorIds(this.db, COLECCIONES.instituciones, instIds)
    const mapaInst = new Map<string, any>()
    mapaInstRaw.forEach((data, id) => mapaInst.set(id, { id, ...data }))

    if (filtros.ciudad) {
      const termino = filtros.ciudad.toLowerCase()
      vacantes = vacantes.filter(v => (v.ciudad ?? '').toLowerCase().includes(termino))
    }

    const todos = vacantes.map(v => {
      const inst = mapaInst.get(v.institucionId) ?? {}
      return {
        ...v,
        tiposDiscapacidad: parsearTiposDiscapacidad(v.tiposDiscapacidad),
        nombreInstitucion: inst.nombre ?? null,
        ciudadInstitucion: inst.ciudad ?? null,
        institucionVerificada: inst.verificada ?? false,
        institucionOwnerId: inst.creadoPor ?? null,
      }
    // Solo vacantes de instituciones activas Y aprobadas por un administrador
    }).filter(v => {
      const inst = mapaInst.get(v.institucionId)
      return inst && inst.activa === true && inst.verificada === true
    })

    let resultado = todos

    // Búsqueda por texto en título, descripción, nombre de institución
    if (filtros.buscar) {
      const termino = filtros.buscar.toLowerCase()
      resultado = resultado.filter(v =>
        (v.titulo ?? '').toLowerCase().includes(termino) ||
        (v.descripcion ?? '').toLowerCase().includes(termino) ||
        (v.nombreInstitucion ?? '').toLowerCase().includes(termino)
      )
    }

    resultado = ordenar(resultado, filtros.ordenarPor, filtros.direccion ?? 'desc')

    const total = resultado.length
    const inicio = (pagina - 1) * limite
    return paginar(resultado.slice(inicio, inicio + limite), total, pagina, limite)
  }

  async findOne(id: string) {
    const doc = await this.db.collection(COLECCIONES.vacantes).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Vacante no encontrada')
    const vacante = { id: doc.id, ...doc.data() } as any

    const instDoc = await this.db.collection(COLECCIONES.instituciones).doc(vacante.institucionId).get()
    const inst = instDoc.data() ?? {}

    vacante.tiposDiscapacidad = parsearTiposDiscapacidad(vacante.tiposDiscapacidad)
    return {
      ...vacante,
      nombreInstitucion: inst.nombre ?? null,
      ciudadInstitucion: inst.ciudad ?? null,
      descripcionInstitucion: inst.descripcion ?? null,
      telefonoInstitucion: inst.telefono ?? null,
      emailInstitucion: inst.email ?? null,
      sitioWebInstitucion: inst.sitioWeb ?? null,
      institucionVerificada: inst.verificada ?? false,
      institucionOwnerId: inst.creadoPor ?? null,
    }
  }

  async apply(usuarioId: string, vacanteId: string, cartaPresentacion: string) {
    const vacanteDoc = await this.db.collection(COLECCIONES.vacantes).doc(vacanteId).get()
    if (!vacanteDoc.exists || !vacanteDoc.data()?.activa) throw new NotFoundException('Vacante no encontrada o inactiva')

    const existente = await this.db.collection(COLECCIONES.postulaciones)
      .where('vacanteId', '==', vacanteId).where('usuarioId', '==', usuarioId).limit(1).get()
    if (!existente.empty) throw new ConflictException('Ya enviaste una solicitud para esta vacante')

    const ref = this.db.collection(COLECCIONES.postulaciones).doc()
    await ref.set({
      id: ref.id, vacanteId, usuarioId, cartaPresentacion, estado: 'pendiente',
      fechaCreacion: new Date().toISOString(),
    })
    return { id: ref.id, estado: 'pendiente' }
  }

  async actualizarEstadoPostulacion(postulacionId: string, user: CurrentUserPayload, dto: ActualizarEstadoPostulacionDto) {
    const postDoc = await this.db.collection(COLECCIONES.postulaciones).doc(postulacionId).get()
    if (!postDoc.exists) throw new NotFoundException('Postulación no encontrada')
    const postulacion = postDoc.data() as any

    const vacanteDoc = await this.db.collection(COLECCIONES.vacantes).doc(postulacion.vacanteId).get()
    if (!vacanteDoc.exists) throw new NotFoundException('Vacante no encontrada')
    const vacante = vacanteDoc.data() as any

    // Solo la institución dueña de la vacante (o admin) puede cambiar el estado
    if (user.rol !== 'admin') {
      const instSnap = await this.db.collection(COLECCIONES.instituciones)
        .where('creadoPor', '==', user.id).limit(1).get()
      if (instSnap.empty || instSnap.docs[0].id !== vacante.institucionId) {
        throw new ForbiddenException('No tienes permiso para cambiar el estado de esta postulación')
      }
    }

    const nuevoEstado = dto.estado
    if (postulacion.estado === nuevoEstado) {
      return { id: postulacionId, estado: nuevoEstado, fechaActualizacion: postulacion.fechaActualizacion ?? postulacion.fechaCreacion ?? new Date().toISOString() }
    }

    const fechaActualizacion = new Date().toISOString()
    await postDoc.ref.update({ estado: nuevoEstado, fechaActualizacion })

    // Notificar solo en desenlaces finales (aceptada/rechazada); un regreso a
    // 'pendiente' no debe disparar una notificación de rechazo engañosa.
    if (nuevoEstado === 'aceptada' || nuevoEstado === 'rechazada') {
      const aceptada = nuevoEstado === 'aceptada'
      await this.notificaciones.crear(
        postulacion.usuarioId,
        aceptada ? 'postulacion_aceptada' : 'postulacion_rechazada',
        aceptada ? '¡Tu postulación fue aceptada!' : 'Actualización de tu postulación',
        aceptada
          ? `La institución aceptó tu postulación para la vacante "${vacante.titulo ?? ''}".`
          : `Tu postulación para la vacante "${vacante.titulo ?? ''}" no fue aceptada.`,
        postulacionId,
      )
    }

    return { id: postulacionId, estado: nuevoEstado, fechaActualizacion }
  }

  async myApplications(usuarioId: string, pagina = 1, limite = 20, ordenarPor?: string, direccion?: 'asc' | 'desc', buscar?: string): Promise<RespuestaPaginada<any>> {
    const snap = await this.db.collection(COLECCIONES.postulaciones)
      .where('usuarioId', '==', usuarioId).get()

    // Quitamos .orderBy() de Firestore para evitar error de índice compuesto
    const postulaciones = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
    postulaciones.sort((a, b) => (b.fechaCreacion ?? '').localeCompare(a.fechaCreacion ?? ''))

    // Batch lookups de vacantes e instituciones en lugar de N+1 queries
    const vacanteIds = [...new Set(postulaciones.map(p => p.vacanteId))]
    const mapaVacantes = await obtenerDocumentosPorIds(this.db, COLECCIONES.vacantes, vacanteIds)

    const instIdsFromVacantes = [...new Set([...mapaVacantes.values()].map(v => v?.institucionId).filter(Boolean))] as string[]
    const mapaInst = await obtenerDocumentosPorIds(this.db, COLECCIONES.instituciones, instIdsFromVacantes)

    const todos = postulaciones.map(p => {
      const vacante = mapaVacantes.get(p.vacanteId) ?? {}
      const inst = mapaInst.get(vacante.institucionId) ?? {}
      return { ...p, titulo: vacante.titulo, modalidad: vacante.modalidad, nombreInstitucion: inst.nombre ?? null, institucionId: vacante.institucionId ?? null, institucionOwnerId: inst.creadoPor ?? null }
    })

    let resultado = todos
    if (buscar) {
      const termino = buscar.toLowerCase()
      resultado = resultado.filter(p =>
        (p.titulo ?? '').toLowerCase().includes(termino) ||
        (p.nombreInstitucion ?? '').toLowerCase().includes(termino)
      )
    }
    resultado = ordenar(resultado, ordenarPor, direccion ?? 'desc')

    const total = resultado.length
    const inicio = (pagina - 1) * limite
    return paginar(resultado.slice(inicio, inicio + limite), total, pagina, limite)
  }

  async postulantesDeMiInstitucion(
    user: CurrentUserPayload,
    filtros: {
      institucionId?: string
      estado?: string
      pagina?: number
      limite?: number
      ordenarPor?: string
      direccion?: 'asc' | 'desc'
      buscar?: string
    } = {},
  ): Promise<RespuestaPaginada<any>> {
    const pagina = filtros.pagina ?? 1
    const limite = filtros.limite ?? 20

    // Resolver la institución a consultar: para usuarios institución se usa la
    // propia (por creadoPor); para admins se requiere institucionId explícito.
    let institucionId: string
    if (user.rol === 'institucion') {
      const instSnap = await this.db.collection(COLECCIONES.instituciones)
        .where('creadoPor', '==', user.id).limit(1).get()
      if (instSnap.empty) {
        throw new NotFoundException('No tienes una institución registrada. Crea una institución primero.')
      }
      institucionId = instSnap.docs[0].id
    } else if (user.rol === 'admin') {
      if (!filtros.institucionId) {
        throw new BadRequestException('Como administrador, debes proporcionar el ID de la institución (institucionId).')
      }
      institucionId = filtros.institucionId
    } else {
      throw new ForbiddenException('Solo instituciones y administradores pueden consultar postulantes')
    }

    // Vacantes de la institución
    const vacantesSnap = await this.db.collection(COLECCIONES.vacantes)
      .where('institucionId', '==', institucionId).get()
    const vacantes = vacantesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
    if (vacantes.length === 0) return paginar([], 0, pagina, limite)
    const mapaVacantes = new Map(vacantes.map(v => [v.id, v]))

    // Postulaciones de esas vacantes (consultas `in` en lotes de 30)
    const idsVacantes = [...mapaVacantes.keys()]
    const postulaciones: any[] = []
    for (let i = 0; i < idsVacantes.length; i += 30) {
      const lote = idsVacantes.slice(i, i + 30)
      const snap = await this.db.collection(COLECCIONES.postulaciones)
        .where('vacanteId', 'in', lote)
        .get()
      postulaciones.push(...snap.docs.map(d => ({ id: d.id, ...d.data() } as any)))
    }
    // Ordenar en memoria por fecha de creación descendente
    postulaciones.sort((a, b) => (b.fechaCreacion ?? '').localeCompare(a.fechaCreacion ?? ''))

    // Enriquecer con datos del postulante (perfiles) en batch
    const usuarioIds = [...new Set(postulaciones.map(p => p.usuarioId).filter(Boolean))] as string[]
    const mapaUsuarios = await obtenerDocumentosPorIds(this.db, COLECCIONES.perfiles, usuarioIds)

    let todos = postulaciones.map(p => {
      const vacante = mapaVacantes.get(p.vacanteId) ?? {}
      const perfil = mapaUsuarios.get(p.usuarioId) ?? {}
      return {
        id: p.id,
        vacanteId: p.vacanteId,
        tituloVacante: vacante.titulo ?? null,
        modalidad: vacante.modalidad ?? null,
        usuarioId: p.usuarioId,
        nombrePostulante: perfil.nombreCompleto ?? null,
        emailPostulante: perfil.email ?? null,
        urlAvatar: perfil.urlAvatar ?? null,
        // Compatibilidad: el seed usa `mensaje`; el servicio escribe `cartaPresentacion`
        cartaPresentacion: p.cartaPresentacion ?? p.mensaje ?? null,
        estado: p.estado ?? 'pendiente',
        fechaCreacion: p.fechaCreacion ?? null,
      }
    })

    if (filtros.estado) {
      const termino = filtros.estado.toLowerCase()
      todos = todos.filter(p => (p.estado ?? '').toLowerCase() === termino)
    }

    if (filtros.buscar) {
      const termino = filtros.buscar.toLowerCase()
      todos = todos.filter(p =>
        (p.nombrePostulante ?? '').toLowerCase().includes(termino) ||
        (p.tituloVacante ?? '').toLowerCase().includes(termino)
      )
    }

    todos = ordenar(todos, filtros.ordenarPor, filtros.direccion ?? 'desc')

    const total = todos.length
    const inicio = (pagina - 1) * limite
    return paginar(todos.slice(inicio, inicio + limite), total, pagina, limite)
  }

  async getAppliedJobIds(usuarioId: string): Promise<string[]> {
    const snap = await this.db.collection(COLECCIONES.postulaciones)
      .where('usuarioId', '==', usuarioId).get()
    return snap.docs.map(d => d.data().vacanteId)
  }

  async createForUser(user: any, dto: any) {
    // Validar rol
    if (user.rol !== 'institucion' && user.rol !== 'admin') {
      throw new ForbiddenException('Solo instituciones y administradores pueden crear vacantes')
    }

    let institucionId = dto.institucionId

    if (user.rol === 'institucion') {
      // Buscar la institución del usuario por creadoPor
      const snap = await this.db.collection(COLECCIONES.instituciones)
        .where('creadoPor', '==', user.id).limit(1).get()
      if (snap.empty) {
        throw new NotFoundException('No tienes una institución registrada. Crea una institución primero.')
      }
      institucionId = snap.docs[0].id
    } else if (user.rol === 'admin' && !institucionId) {
      throw new BadRequestException('Como administrador, debes proporcionar el ID de la institución (institucionId).')
    }

    return this.createJob(institucionId, dto)
  }

  async createJob(institucionId: string, dto: any) {
    // La institución debe existir, estar activa y haber sido aprobada por un
    // administrador (verificada) antes de publicar vacantes en el directorio.
    const instDoc = await this.db.collection(COLECCIONES.instituciones).doc(institucionId).get()
    if (!instDoc.exists) throw new NotFoundException('Institución no encontrada')
    const inst = instDoc.data()!
    if (inst.activa !== true) {
      throw new ForbiddenException('La institución se encuentra inactiva')
    }
    if (inst.verificada !== true) {
      throw new ForbiddenException('La institución debe estar aprobada por un administrador para publicar vacantes')
    }

    const ref = this.db.collection(COLECCIONES.vacantes).doc()
    await ref.set({
      id: ref.id, institucionId, titulo: dto.titulo, descripcion: dto.descripcion ?? '',
      requisitos: dto.requisitos ?? '', modalidad: dto.modalidad ?? 'presencial',
      horario: dto.horario ?? '', rangoSalario: dto.rangoSalario ?? '',
      ciudad: dto.ciudad ?? '', estado: dto.estado ?? '',
      inclusivaDiscapacidad: dto.inclusivaDiscapacidad !== false,
      tiposDiscapacidad: Array.isArray(dto.tiposDiscapacidad)
        ? dto.tiposDiscapacidad
        : parsearTiposDiscapacidad(dto.tiposDiscapacidad),
      activa: true, fechaCreacion: new Date().toISOString(),
    })
    return this.findOne(ref.id)
  }

  async update(id: string, user: CurrentUserPayload, dto: any) {
    const doc = await this.db.collection(COLECCIONES.vacantes).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Vacante no encontrada')
    const vacante = doc.data() as any

    // Validar que la vacante pertenezca a la institución del usuario
    if (user.rol !== 'admin') {
      const instSnap = await this.db.collection(COLECCIONES.instituciones)
        .where('creadoPor', '==', user.id).limit(1).get()
      if (instSnap.empty || instSnap.docs[0].id !== vacante.institucionId) {
        throw new ForbiddenException('No tienes permiso para editar esta vacante')
      }
    }

    const camposActualizables: Record<string, any> = {}
    const camposPermitidos = [
      'titulo', 'descripcion', 'requisitos', 'modalidad', 'horario',
      'rangoSalario', 'ciudad', 'estado', 'inclusivaDiscapacidad',
      'tiposDiscapacidad', 'activa',
    ]
    for (const campo of camposPermitidos) {
      if (dto[campo] !== undefined) camposActualizables[campo] = dto[campo]
    }
    if (Object.keys(camposActualizables).length === 0) return this.findOne(id)

    camposActualizables.fechaActualizacion = new Date().toISOString()
    await doc.ref.update(camposActualizables)
    return this.findOne(id)
  }

  async remove(id: string, user: CurrentUserPayload) {
    const doc = await this.db.collection(COLECCIONES.vacantes).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Vacante no encontrada')
    const vacante = doc.data() as any

    // Validar propiedad o rol admin
    if (user.rol !== 'admin') {
      const instSnap = await this.db.collection(COLECCIONES.instituciones)
        .where('creadoPor', '==', user.id).limit(1).get()
      if (instSnap.empty || instSnap.docs[0].id !== vacante.institucionId) {
        throw new ForbiddenException('No tienes permiso para eliminar esta vacante')
      }
    }

    await doc.ref.update({ activa: false, fechaEliminacion: new Date().toISOString() })
    return { eliminado: true }
  }
}
