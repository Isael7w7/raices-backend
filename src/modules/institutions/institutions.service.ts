import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { parsearTiposDiscapacidad } from '../../common/utils/firestore-helpers'
import { CreateInstitucionDto } from './dto/create-institucion.dto'
import { UpdateInstitucionDto } from './dto/update-institucion.dto'
import { TipoDocumentoVerificacion } from './dto/subir-documento-verificacion.dto'
import { InstitucionDoc } from '../../common/interfaces/firestore-documents.interface'
import { StorageService } from '../storage/storage.service'
import { UsersService } from '../users/users.service'

/** Institución con ID resuelto, tal como se devuelve al cliente. */
type InstitucionConId = InstitucionDoc & { id: string }

@Injectable()
export class InstitutionsService {
  private readonly logger = new Logger('InstitutionsService')

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly storage: StorageService,
    private readonly users: UsersService,
  ) {}

  private col(nombre: string) { return this.db.collection(nombre) }

  /**
   * Resuelve el documento de la institución dueña de `usuarioId`:
   * primero el canónico (id = UID, creado en el registro) y como respaldo
   * los creados vía POST /instituciones (id aleatorio).
   */
  private async resolverInstitucion(usuarioId: string): Promise<{ id: string; data: InstitucionDoc }> {
    const canonico = await this.col(COLECCIONES.instituciones).doc(usuarioId).get()
    if (canonico.exists && canonico.data()?.activa !== false) {
      return { id: usuarioId, data: canonico.data()! }
    }

    const snap = await this.col(COLECCIONES.instituciones)
      .where('creadoPor', '==', usuarioId)
      .limit(10)
      .get()
    const doc = snap.docs.find(d => d.data()?.activa !== false)
    if (!doc) throw new NotFoundException('No tienes una institución registrada')
    return { id: doc.id, data: doc.data()! }
  }

  // ─── Listar instituciones (público) ────────────────────────────────
  async findAll(filtros: { page?: number; limit?: number; busqueda?: string; categoria?: string; ciudad?: string } = {}) {
    const page = Math.max(1, Number(filtros.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(filtros.limit) || 10))

    let q = this.col(COLECCIONES.instituciones)
      .where('activa', '==', true)
      .where('verificada', '==', true)
    if (filtros.categoria) q = q.where('categoria', '==', filtros.categoria)

    const snap = await q.get()
    let filas = snap.docs.map(d => this.parsear({ id: d.id, ...d.data() } as InstitucionConId))

    // Las empresas comparten la colección (subtipo `tipo: 'empresa'`) pero no
    // forman parte del directorio público de instituciones. Se filtra en
    // memoria para no exigir un índice compuesto y para que los documentos
    // legados sin el campo `tipo` sigan apareciendo.
    filas = filas.filter(f => f.tipo !== 'empresa')

    // Filtrar en memoria para campos que Firestore no indexa bien
    if (filtros.ciudad) {
      const termino = filtros.ciudad.toLowerCase()
      filas = filas.filter(f => (f.ciudad ?? '').toLowerCase().includes(termino))
    }

    if (filtros.busqueda) {
      const termino = filtros.busqueda.toLowerCase()
      filas = filas.filter(f =>
        (f.nombre ?? '').toLowerCase().includes(termino) ||
        (f.descripcion ?? '').toLowerCase().includes(termino) ||
        (f.ciudad ?? '').toLowerCase().includes(termino)
      )
    }

    // Ordenar por calificación promedio descendente
    filas.sort((a, b) => (b.calificacionPromedio ?? 0) - (a.calificacionPromedio ?? 0))

    const total = filas.length
    const inicio = (page - 1) * limit
    const paginadas = filas.slice(inicio, inicio + limit)

    return {
      datos: paginadas,
      paginacion: {
        total,
        pagina: page,
        limite: limit,
        totalPaginas: Math.ceil(total / limit),
      },
    }
  }

  // ─── Detalle de institución (público) ──────────────────────────────
  async findOne(id: string) {
    const fila = await this.findOneInterno(id)
    // El detalle público solo expone instituciones activas y verificadas
    // (misma regla que el listado): lo pendiente/inactivo no existe para
    // el público, y se responde 404 para no revelar su existencia.
    if (fila.activa !== true || fila.verificada !== true) {
      throw new NotFoundException('Institución no encontrada')
    }
    return fila
  }

  // ─── Detalle de institución (sin filtro de visibilidad) ────────────
  // Uso interno: create/updateMine/update y el endpoint protegido.
  // Privado para que ningún otro módulo pueda saltarse el filtro público.
  private async findOneInterno(id: string) {
    const doc = await this.col(COLECCIONES.instituciones).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Institución no encontrada')
    return this.parsear({ id: doc.id, ...doc.data()! })
  }

  // ─── Detalle de institución (admin o propietario) ──────────────────
  async findOneProtegido(id: string, usuarioId: string, rol: string) {
    const fila = await this.findOneInterno(id)
    const creadoPor = fila.creadoPor
    if (rol !== 'admin' && creadoPor !== usuarioId) {
      throw new ForbiddenException('No tienes permisos para consultar esta institución')
    }
    return fila
  }

  // ─── Mi institución (autenticado) ──────────────────────────────────
  async findMine(usuarioId: string) {
    // 1) Intentar con el documento canónico (id = UID, creado en el registro)
    const canonico = await this.col(COLECCIONES.instituciones).doc(usuarioId).get()
    if (canonico.exists && canonico.data()?.activa !== false) {
      return this.parsear({ id: canonico.id, ...canonico.data()! })
    }

    // 2) Fallback: instituciones creadas vía POST /instituciones (id aleatorio)
    try {
      const snap = await this.col(COLECCIONES.instituciones)
        .where('creadoPor', '==', usuarioId)
        .where('activa', '==', true)
        .orderBy('fechaCreacion', 'desc')
        .limit(1)
        .get()

      if (snap.empty) throw new NotFoundException('No tienes una institución registrada')
      const doc = snap.docs[0]
      return this.parsear({ id: doc.id, ...doc.data() })
    } catch (error: unknown) {
      // Fallback: si el índice compuesto de Firebase aún no está listo,
      // se obtienen todas las instituciones activas del usuario
      // y se ordenan en memoria por fechaCreacion descendente.
      const err = error as { message?: string; code?: string | number }
      const esErrorDeIndice =
        err?.message?.toLowerCase().includes('requires an index') ||
        err?.code === 'failed-precondition' ||
        err?.code === 9

      if (!esErrorDeIndice) throw error

      this.logger.warn(
        `Índice compuesto no disponible para findMine, usando ordenamiento en memoria. Usuario: ${usuarioId}`,
      )

      const fallbackSnap = await this.col(COLECCIONES.instituciones)
        .where('creadoPor', '==', usuarioId)
        .where('activa', '==', true)
        .get()

      if (fallbackSnap.empty) throw new NotFoundException('No tienes una institución registrada')

      const docs = fallbackSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as InstitucionConId))
        .sort((a, b) => {
          const tsA = new Date(a.fechaCreacion || 0).getTime()
          const tsB = new Date(b.fechaCreacion || 0).getTime()
          return tsB - tsA
        })

      return this.parsear(docs[0])
    }
  }

  // ─── Crear institución (autenticado) ───────────────────────────────
  async create(dto: CreateInstitucionDto, usuarioId: string, rol: string) {
    // Defensa en profundidad (el RolesGuard ya lo exige a nivel HTTP):
    // solo cuentas de institución o administradores pueden crear.
    if (rol !== 'institucion' && rol !== 'admin') {
      throw new ForbiddenException('Rol insuficiente: solo cuentas de institución o administradores pueden crear instituciones')
    }

    // Guard anti-duplicado: el usuario no puede tener más de una institución
    const [canonico, existente] = await Promise.all([
      this.col(COLECCIONES.instituciones).doc(usuarioId).get(),
      this.col(COLECCIONES.instituciones)
        .where('creadoPor', '==', usuarioId).limit(1).get(),
    ])
    if (canonico.exists || !existente.empty) {
      throw new BadRequestException('Ya tienes una institución registrada')
    }

    const ref = this.col(COLECCIONES.instituciones).doc()
    const documento = {
      id: ref.id,
      nombre: dto.nombre,
      descripcion: dto.descripcion ?? '',
      categoria: dto.categoria,
      subcategoria: dto.subcategoria ?? '',
      direccion: dto.direccion ?? '',
      ciudad: dto.ciudad ?? '',
      estado: dto.estado ?? '',
      lat: dto.lat ?? null,
      lng: dto.lng ?? null,
      telefono: dto.telefono ?? '',
      whatsapp: dto.whatsapp ?? '',
      email: dto.email ?? '',
      sitioWeb: dto.sitioWeb ?? '',
      urlLogo: dto.urlLogo ?? null,
      urlPortada: dto.urlPortada ?? null,
      tiposDiscapacidad: Array.isArray(dto.tiposDiscapacidad)
        ? dto.tiposDiscapacidad
        : parsearTiposDiscapacidad(dto.tiposDiscapacidad),
      edadMinima: dto.edadMinima ?? null,
      edadMaxima: dto.edadMaxima ?? null,
      horarioAtencion: dto.horarioAtencion ?? '',
      tipoPlan: dto.tipoPlan ?? 'gratuito',
      servicios: dto.servicios ?? [],
      fotos: dto.fotos ?? [],
      calificacionPromedio: 0,
      cantidadCalificaciones: 0,
      verificada: false,
      activa: true,
      creadoPor: usuarioId,
      fechaCreacion: new Date().toISOString(),
    }

    await ref.set(documento)
    return this.findOneInterno(ref.id)
  }

  // ─── Actualizar mi institución (autenticado) ───────────────────────
  async updateMine(usuarioId: string, dto: UpdateInstitucionDto) {
    const snap = await this.col(COLECCIONES.instituciones)
      .where('creadoPor', '==', usuarioId)
      .where('activa', '==', true)
      .limit(1)
      .get()

    if (snap.empty) throw new NotFoundException('No tienes una institución registrada')

    const docSnap = snap.docs[0]
    const id = docSnap.id

    const carga = this.buildUpdatePayload(dto)
    if (Object.keys(carga).length === 0) return this.findOneInterno(id)

    carga.fechaActualizacion = new Date().toISOString()
    await this.col(COLECCIONES.instituciones).doc(id).update(carga)
    return this.findOneInterno(id)
  }

  // ─── Eliminar mi institución (soft-delete, autenticado) ───────────
  async removeMine(usuarioId: string) {
    // Mismas reglas que updateMine: solo instituciones activas del usuario.
    // Una ya eliminada responde 404 (idempotente para el cliente).
    const snap = await this.col(COLECCIONES.instituciones)
      .where('creadoPor', '==', usuarioId)
      .where('activa', '==', true)
      .limit(1)
      .get()

    if (snap.empty) throw new NotFoundException('No tienes una institución registrada')

    const id = snap.docs[0].id
    await this.col(COLECCIONES.instituciones).doc(id).update({
      activa: false,
      fechaEliminacion: new Date().toISOString(),
    })
  }

  // ─── Actualizar institución por ID (admin o propietario) ───────────
  async update(id: string, dto: UpdateInstitucionDto, usuarioId: string, rol: string) {
    const doc = await this.col(COLECCIONES.instituciones).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Institución no encontrada')

    // Una institución eliminada (soft-delete) o inactiva no es editable:
    // responde 404 para no revelar su existencia (misma regla que findOne público).
    if (doc.data()?.activa !== true) {
      throw new NotFoundException('Institución no encontrada')
    }

    // Solo admin o el propietario pueden actualizar
    const creadoPor = doc.data()?.creadoPor
    if (rol !== 'admin' && creadoPor !== usuarioId) {
      throw new ForbiddenException('No tienes permisos para actualizar esta institución')
    }

    const carga = this.buildUpdatePayload(dto)
    if (Object.keys(carga).length === 0) return this.findOneInterno(id)

    carga.fechaActualizacion = new Date().toISOString()
    await this.col(COLECCIONES.instituciones).doc(id).update(carga)
    return this.findOneInterno(id)
  }

  // ─── Eliminar institución (soft-delete, admin o propietario) ──────
  async remove(id: string, usuarioId: string, rol: string) {
    const doc = await this.col(COLECCIONES.instituciones).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Institución no encontrada')

    const creadoPor = doc.data()?.creadoPor
    if (rol !== 'admin' && creadoPor !== usuarioId) {
      throw new ForbiddenException('No tienes permisos para eliminar esta institución')
    }

    await this.col(COLECCIONES.instituciones).doc(id).update({
      activa: false,
      fechaEliminacion: new Date().toISOString(),
    })
  }

  // ─── Helpers privados ──────────────────────────────────────────────
  private buildUpdatePayload(dto: UpdateInstitucionDto): Record<string, unknown> {
    const camposPermitidos = [
      'nombre', 'descripcion', 'categoria', 'subcategoria', 'direccion',
      'ciudad', 'estado', 'lat', 'lng', 'telefono', 'whatsapp', 'email',
      'sitioWeb', 'urlLogo', 'urlPortada', 'tiposDiscapacidad', 'edadMinima',
      'edadMaxima', 'horarioAtencion', 'tipoPlan', 'servicios', 'fotos',
    ]

    const carga: Record<string, unknown> = {}
    for (const campo of camposPermitidos) {
      const valor = (dto as unknown as Record<string, unknown>)[campo]
      if (valor !== undefined) {
        carga[campo] = valor
      }
    }

    // Normalizar tiposDiscapacidad si se envía
    if (carga.tiposDiscapacidad && !Array.isArray(carga.tiposDiscapacidad)) {
      carga.tiposDiscapacidad = parsearTiposDiscapacidad(carga.tiposDiscapacidad)
    }

    return carga
  }

  // ─── Verificación de cuentas institucionales (personas morales) ────

  /**
   * Sube un documento de verificación de la institución/empresa.
   *
   * - `csf` (indispensable): Constancia de Situación Fiscal, se guarda como
   *   `documentoCsf` en el documento de la institución.
   * - `identificacion_representante` (opcional): se registra como
   *   identificación oficial del representante para revisión del administrador.
   *
   * Las personas morales no tienen CURP: el campo `numeroCurp` (si el cliente
   * lo envía) se ignora por completo.
   */
  async subirDocumentoVerificacion(usuarioId: string, tipo: TipoDocumentoVerificacion, file: Express.Multer.File) {
    if (!file?.buffer) throw new BadRequestException('No se proporcionó ningún archivo')

    const institucion = await this.resolverInstitucion(usuarioId)

    if (tipo === 'csf') {
      const urlDocumento = await this.storage.upload(file.buffer, file.originalname, 'instituciones')
      const fecha = new Date().toISOString()
      await this.col(COLECCIONES.instituciones).doc(institucion.id).update({
        documentoCsf: urlDocumento,
        fechaDocumentoCsf: fecha,
        fechaActualizacion: fecha,
      })
      this.logger.log(`CSF subida para la institución ${institucion.id}`)
      return { tipo: 'csf', urlDocumento, estado: 'pendiente', fechaSubida: fecha }
    }

    // Identificación del representante: opcional. Se reutiliza el flujo de
    // documentos de identidad (queda pendiente de revisión) sin exigir CURP.
    const resultado = await this.users.subirDocumentoIdentidad(usuarioId, 'identificacion_oficial', file)
    return {
      tipo: 'identificacion_representante',
      urlDocumento: resultado.urlDocumento,
      estado: resultado.estado,
      fechaSubida: resultado.fechaSubida,
    }
  }

  /**
   * Estado y porcentaje de verificación de la institución/empresa.
   *
   * Pasos válidos para personas morales (sin CURP):
   *  1. `csf` — Constancia de Situación Fiscal (INDISPENSABLE)
   *  2. `aprobacion_admin` — Aprobación del administrador (INDISPENSABLE)
   *  3. `identificacion_representante` — identificación del representante
   *     legal (OPCIONAL, no afecta el porcentaje)
   */
  async getEstadoVerificacion(usuarioId: string) {
    const institucion = await this.resolverInstitucion(usuarioId)

    const docsSnap = await this.col(COLECCIONES.documentosIdentidad)
      .where('usuarioId', '==', usuarioId)
      .get()
    const documentos = docsSnap.docs.map(d => d.data())
    const tieneIdentificacion = documentos.some(d => d.tipo === 'identificacion_oficial')

    const tieneCsf = typeof institucion.data.documentoCsf === 'string' && institucion.data.documentoCsf.length > 0
    const verificada = institucion.data.verificada === true

    const pasos = [
      {
        clave: 'csf',
        titulo: 'Constancia de Situación Fiscal (CSF)',
        obligatorio: true,
        completado: tieneCsf,
        descripcion: 'Documento fiscal de la persona moral (RFC). Requisito indispensable.',
      },
      {
        clave: 'aprobacion_admin',
        titulo: 'Aprobación del Administrador',
        obligatorio: true,
        completado: verificada,
        descripcion: 'Revisión y aprobación de un administrador de Raíces.',
      },
      {
        clave: 'identificacion_representante',
        titulo: 'Identificación del Representante Legal',
        obligatorio: false,
        completado: tieneIdentificacion,
        descripcion: 'Opcional: INE/pasaporte del representante legal. La CURP no aplica a personas morales.',
      },
    ]

    const obligatorios = pasos.filter(p => p.obligatorio)
    const completados = obligatorios.filter(p => p.completado)

    return {
      institucionId: institucion.id,
      nombre: institucion.data.nombre ?? null,
      verificada,
      porcentaje: Math.round((completados.length / obligatorios.length) * 100),
      pasos,
      pasosPendientes: obligatorios.filter(p => !p.completado).map(p => p.clave),
      documentosFaltantes: tieneCsf ? [] : ['csf'],
    }
  }

  private parsear(fila: InstitucionConId) {
    if (!fila) return fila
    return {
      ...fila,
      tiposDiscapacidad: parsearTiposDiscapacidad(fila.tiposDiscapacidad),
    }
  }
}
