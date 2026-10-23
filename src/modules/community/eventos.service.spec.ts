import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { EventosService } from './eventos.service'
import { NotificationsService } from '../notifications/notifications.service'
import { FIRESTORE } from '../../database/firebase.provider'

function mockDoc(data: Record<string, any> | null, exists = true, docId = 'mock-doc-id') {
  return {
    exists, id: docId, data: () => data,
    ref: {
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    },
  }
}

function queryGet(docs: any[]) {
  return { where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs, size: docs.length }) }
}

const usuario = { id: 'u1', email: 'u1@test.com', rol: 'pcd', nombreCompleto: 'Ana PCD', verificado: false, features: {} } as any

describe('EventosService', () => {
  let service: EventosService
  let firestoreMock: Record<string, any>
  const notificacionesMock = { crear: jest.fn() }

  beforeEach(async () => {
    notificacionesMock.crear.mockReset().mockResolvedValue({ id: 'n1' })
    firestoreMock = {
      collection: jest.fn(),
      batch: jest.fn(() => ({ set: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) })),
      runTransaction: jest.fn(async (cb: any) => {
        let escritura = false
        const tx = {
          get: async (target: any) => {
            if (escritura) throw new Error('Firestore: lectura después de escritura en transacción')
            return target.get()
          },
          set: (ref: any, data: any) => { escritura = true; return ref.set(data) },
          update: (ref: any, data: any) => { escritura = true; return ref.update(data) },
          delete: (ref: any) => { escritura = true; return ref.delete() },
        }
        return cb(tx)
      }),
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventosService,
        { provide: FIRESTORE, useValue: firestoreMock },
        { provide: NotificationsService, useValue: notificacionesMock },
      ],
    }).compile()
    service = module.get<EventosService>(EventosService)
  })

  describe('listar', () => {
    it('retorna solo los próximos eventos ordenados por fecha de inicio', async () => {
      firestoreMock.collection
        .mockReturnValueOnce(queryGet([
          { id: 'pasado', data: () => ({ titulo: 'Viejo', fechaInicio: '2000-01-01T10:00:00.000Z', activo: true, creadorId: 'u2' }) },
          { id: 'lejano', data: () => ({ titulo: 'Futuro lejano', fechaInicio: '2099-06-01T10:00:00.000Z', activo: true, creadorId: 'u2' }) },
          { id: 'cercano', data: () => ({ titulo: 'Futuro cercano', fechaInicio: '2099-01-01T10:00:00.000Z', activo: true, creadorId: 'u2' }) },
        ]))
        .mockReturnValueOnce(queryGet([]))
        .mockReturnValueOnce(queryGet([{ id: 'u2', data: () => ({ nombreCompleto: 'Centro Raíces', urlAvatar: 'avatar' }) }]))

      const result = await service.listar('u1')

      expect(result.datos.map(e => e.id)).toEqual(['cercano', 'lejano'])
      expect(result.total).toBe(2)
      expect(result.datos[0].nombreCreador).toBe('Centro Raíces')
      expect(result.datos[0].asisto).toBe(false)
    })

    it('filtra por el día exacto con `fecha` (incluye eventos pasados de ese día)', async () => {
      firestoreMock.collection
        .mockReturnValueOnce(queryGet([
          { id: 'e1', data: () => ({ titulo: 'Mañana', fechaInicio: '2099-03-05T09:00:00.000Z', activo: true, creadorId: 'u2' }) },
          { id: 'e2', data: () => ({ titulo: 'Otro día', fechaInicio: '2099-03-06T09:00:00.000Z', activo: true, creadorId: 'u2' }) },
        ]))
        .mockReturnValueOnce(queryGet([]))
        .mockReturnValueOnce(queryGet([]))

      const result = await service.listar('u1', 1, 20, { fecha: '2099-03-05' })
      expect(result.datos.map(e => e.id)).toEqual(['e1'])
    })

    it('filtra por categoría', async () => {
      firestoreMock.collection
        .mockReturnValueOnce(queryGet([
          { id: 'e1', data: () => ({ titulo: 'Taller', categoria: 'taller', fechaInicio: '2099-01-01T00:00:00.000Z', activo: true, creadorId: 'u2' }) },
          { id: 'e2', data: () => ({ titulo: 'Partido', categoria: 'deporte', fechaInicio: '2099-01-02T00:00:00.000Z', activo: true, creadorId: 'u2' }) },
        ]))
        .mockReturnValueOnce(queryGet([]))
        .mockReturnValueOnce(queryGet([]))

      const result = await service.listar('u1', 1, 20, { categoria: 'deporte' })
      expect(result.datos.map(e => e.id)).toEqual(['e2'])
    })

    it('marca `asisto` cuando el usuario tiene asistencia registrada', async () => {
      firestoreMock.collection
        .mockReturnValueOnce(queryGet([
          { id: 'e1', data: () => ({ titulo: 'Evento', fechaInicio: '2099-01-01T00:00:00.000Z', activo: true, creadorId: 'u2' }) },
        ]))
        .mockReturnValueOnce(queryGet([{ id: 'e1_u1', data: () => ({ eventoId: 'e1', usuarioId: 'u1' }) }]))
        .mockReturnValueOnce(queryGet([]))

      const result = await service.listar('u1')
      expect(result.datos[0].asisto).toBe(true)
    })

    it('retorna página vacía sin consultas extra cuando no hay eventos', async () => {
      firestoreMock.collection.mockReturnValueOnce(queryGet([]))

      const result = await service.listar('u1', 2, 10)
      expect(result.datos).toEqual([])
      expect(result.total).toBe(0)
      expect(result.pagina).toBe(2)
      expect(result.limite).toBe(10)
      expect(firestoreMock.collection).toHaveBeenCalledTimes(1)
    })

    it('pagina los resultados', async () => {
      const eventos = Array.from({ length: 3 }, (_, i) => ({
        id: `e${i + 1}`,
        data: () => ({ titulo: `Evento ${i + 1}`, fechaInicio: `2099-01-0${i + 1}T00:00:00.000Z`, activo: true, creadorId: 'u2' }),
      }))
      firestoreMock.collection
        .mockReturnValueOnce(queryGet(eventos))
        .mockReturnValueOnce(queryGet([]))
        .mockReturnValueOnce(queryGet([]))

      const result = await service.listar('u1', 2, 2)
      expect(result.datos.map(e => e.id)).toEqual(['e3'])
      expect(result.total).toBe(3)
      expect(result.totalPaginas).toBe(2)
    })
  })

  describe('obtenerDetalle', () => {
    function colDoc(resultado: any) {
      return { doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(resultado) }) }
    }

    it('retorna el evento con organizador y asistencia del usuario', async () => {
      firestoreMock.collection
        .mockReturnValueOnce(colDoc(mockDoc({ titulo: 'Taller', fechaInicio: '2099-01-01', activo: true, creadorId: 'u2' }, true, 'e1')))
        .mockReturnValueOnce(colDoc(mockDoc({ eventoId: 'e1', usuarioId: 'u1' }, true, 'e1_u1')))
        .mockReturnValueOnce(colDoc(mockDoc({ nombreCompleto: 'Centro', urlAvatar: 'a' }, true, 'u2')))

      const result = await service.obtenerDetalle('e1', 'u1')
      expect(result.id).toBe('e1')
      expect(result.titulo).toBe('Taller')
      expect(result.asisto).toBe(true)
      expect(result.nombreCreador).toBe('Centro')
      expect(result.urlAvatarCreador).toBe('a')
    })

    it('retorna asisto=false cuando no hay asistencia', async () => {
      firestoreMock.collection
        .mockReturnValueOnce(colDoc(mockDoc({ titulo: 'Taller', creadorId: 'u2' }, true, 'e1')))
        .mockReturnValueOnce(colDoc(mockDoc(null, false, 'e1_u1')))
        .mockReturnValueOnce(colDoc(mockDoc({ nombreCompleto: 'Centro' }, true, 'u2')))

      const result = await service.obtenerDetalle('e1', 'u1')
      expect(result.asisto).toBe(false)
    })

    it('lanza NotFoundException cuando el evento no existe', async () => {
      firestoreMock.collection
        .mockReturnValueOnce(colDoc(mockDoc(null, false, 'no-existe')))

      await expect(service.obtenerDetalle('no-existe', 'u1')).rejects.toThrow(NotFoundException)
    })
  })

  describe('toggleAsistencia', () => {
    it('confirma la asistencia la primera vez con ID determinista', async () => {
      const setMock = jest.fn().mockResolvedValue(undefined)
      const updateMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ id: 'e1_u1', get: jest.fn().mockResolvedValue({ exists: false }), set: setMock, delete: jest.fn() }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ cantidadAsistentes: 4 }) }), update: updateMock }) })

      const result = await service.toggleAsistencia('e1', 'u1')
      expect(result).toEqual({ asistiendo: true, cantidadAsistentes: 5 })
      expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1_u1', eventoId: 'e1', usuarioId: 'u1' }))
      expect(updateMock).toHaveBeenCalledTimes(1)
    })

    it('cancela la asistencia si ya estaba confirmada', async () => {
      const deleteMock = jest.fn().mockResolvedValue(undefined)
      const updateMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ id: 'e1_u1', get: jest.fn().mockResolvedValue({ exists: true }), delete: deleteMock, set: jest.fn() }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ cantidadAsistentes: 4 }) }), update: updateMock }) })

      const result = await service.toggleAsistencia('e1', 'u1')
      expect(result).toEqual({ asistiendo: false, cantidadAsistentes: 3 })
      expect(deleteMock).toHaveBeenCalled()
      expect(updateMock).toHaveBeenCalledTimes(1)
    })

    it('lanza NotFoundException cuando el evento no existe', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ id: 'e1_u1', get: jest.fn().mockResolvedValue({ exists: false }), set: jest.fn(), delete: jest.fn() }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue({ exists: false }), update: jest.fn() }) })

      await expect(service.toggleAsistencia('e1', 'u1')).rejects.toThrow(NotFoundException)
    })
  })

  describe('crearEvento', () => {
    it('crea el evento con contador en cero y retorna la vista enriquecida', async () => {
      const setMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ id: 'e1', set: setMock }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc({ nombreCompleto: 'Ana PCD', urlAvatar: 'a' }, true, 'u1')) }) })

      const result = await service.crearEvento(usuario, {
        titulo: 'Taller de arte',
        descripcion: 'Sesión abierta',
        categoria: 'taller',
        fechaInicio: '2099-01-01T10:00:00.000Z',
        fechaFin: '2099-01-01T12:00:00.000Z',
        ubicacion: 'Auditorio',
        urlImagen: 'https://storage/banner.jpg',
      })

      expect(result.id).toBe('e1')
      expect(result.cantidadAsistentes).toBe(0)
      expect(result.activo).toBe(true)
      expect(result.asisto).toBe(false)
      expect(result.nombreCreador).toBe('Ana PCD')
      expect(setMock).toHaveBeenCalledWith(expect.objectContaining({
        id: 'e1', creadorId: 'u1', titulo: 'Taller de arte', categoria: 'taller', cantidadAsistentes: 0,
      }))
    })

    it('rechaza cuando la fecha de fin es anterior a la de inicio', async () => {
      await expect(service.crearEvento(usuario, {
        titulo: 'Mal evento',
        categoria: 'otro',
        fechaInicio: '2099-01-02T10:00:00.000Z',
        fechaFin: '2099-01-01T10:00:00.000Z',
      })).rejects.toThrow(BadRequestException)
      expect(firestoreMock.collection).not.toHaveBeenCalled()
    })
  })

  describe('eliminarEvento', () => {
    /** collection().doc() → ref con .get() que resuelve el snapshot y .update() registrado. */
    function mockEventoDoc(data: Record<string, any> | null, exists = true) {
      const ref = {
        get: jest.fn().mockResolvedValue(mockDoc(data, exists, 'e1')),
        update: jest.fn().mockResolvedValue(undefined),
      }
      firestoreMock.collection.mockReturnValueOnce({ doc: jest.fn().mockReturnValue(ref) })
      return ref
    }

    it('permite al creador eliminar con borrado lógico (activo=false)', async () => {
      const ref = mockEventoDoc({ creadorId: 'u1', activo: true })

      const result = await service.eliminarEvento('e1', 'u1', 'pcd')

      expect(result).toEqual({ eliminado: true })
      expect(ref.update).toHaveBeenCalledWith(expect.objectContaining({
        activo: false,
        eliminadoPor: 'u1',
        eliminadoEn: expect.any(String),
      }))
    })

    it('permite a un admin eliminar un evento que no creó', async () => {
      const ref = mockEventoDoc({ creadorId: 'u2', activo: true })

      const result = await service.eliminarEvento('e1', 'admin1', 'admin')

      expect(result.eliminado).toBe(true)
      expect(ref.update).toHaveBeenCalledWith(expect.objectContaining({ activo: false, eliminadoPor: 'admin1' }))
    })

    it('lanza ForbiddenException a un usuario que no es creador ni admin', async () => {
      mockEventoDoc({ creadorId: 'u2', activo: true })

      await expect(service.eliminarEvento('e1', 'u1', 'pcd')).rejects.toThrow(ForbiddenException)
      expect(firestoreMock.collection).toHaveBeenCalledTimes(1)
    })

    it('lanza NotFoundException cuando el evento no existe', async () => {
      mockEventoDoc(null, false)

      await expect(service.eliminarEvento('faltante', 'u1', 'admin')).rejects.toThrow(NotFoundException)
    })
  })

  describe('notificaciones de eventos', () => {
    it('notifica a los usuarios activos de la ciudad al publicar un evento cercano', async () => {
      const setMock = jest.fn().mockResolvedValue(undefined)
      firestoreMock.collection
        // 1. eventos: set
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ id: 'e1', set: setMock }) })
        // 2. perfiles por ciudad (notificación de evento cercano)
        .mockReturnValueOnce({
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              docs: [
                { id: 'u9', data: () => ({ activo: true, ciudad: 'Mérida' }) },
                { id: 'u1', data: () => ({ activo: true, ciudad: 'Mérida' }) }, // creador
                { id: 'u3', data: () => ({ activo: false, ciudad: 'Mérida' }) }, // inactivo
              ],
            }),
          }),
        })
        // 3. perfil del creador (enriquecimiento de la respuesta)
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc({ nombreCompleto: 'Ana', urlAvatar: 'a' }, true, 'u1')) }) })

      await service.crearEvento(usuario, {
        titulo: 'Taller de arte inclusivo',
        categoria: 'taller',
        fechaInicio: '2099-01-01T10:00:00.000Z',
        ciudad: 'Mérida',
      })
      // Deja terminar la notificación en segundo plano (fire-and-forget)
      await new Promise(r => setImmediate(r))

      // Solo u9: se excluye al creador (u1) y a los inactivos (u3)
      expect(notificacionesMock.crear).toHaveBeenCalledTimes(1)
      expect(notificacionesMock.crear).toHaveBeenCalledWith(
        'u9',
        'evento_cercano',
        expect.stringContaining('Nuevo evento'),
        expect.stringContaining('Taller de arte inclusivo'),
        'e1',
      )
    })

    it('sin ciudad no intenta notificar a vecinos', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ id: 'e1', set: jest.fn().mockResolvedValue(undefined) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc({ nombreCompleto: 'Ana' }, true, 'u1')) }) })

      await service.crearEvento(usuario, {
        titulo: 'Taller',
        categoria: 'taller',
        fechaInicio: '2099-01-01T10:00:00.000Z',
      })
      await new Promise(r => setImmediate(r))

      expect(notificacionesMock.crear).not.toHaveBeenCalled()
    })
  })

  describe('enviarRecordatorios24h', () => {
    it('avisa a los asistentes de eventos que inician en menos de 24h y los marca', async () => {
      const en22h = new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString()
      const refEvento = {
        get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ recordatorio24hEnviado: false }) }),
        update: jest.fn().mockResolvedValue(undefined),
      }
      const eventoSnap = {
        id: 'e1',
        ref: refEvento,
        data: () => ({ titulo: 'Taller inclusivo', fechaInicio: en22h, activo: true }),
      }

      firestoreMock.collection
        // 1. eventos activos
        .mockReturnValueOnce({ where: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue({ docs: [eventoSnap] }) }) })
        // 2. asistentes del evento
        .mockReturnValueOnce({
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              docs: [{ data: () => ({ usuarioId: 'a1' }) }, { data: () => ({ usuarioId: 'a2' }) }],
            }),
          }),
        })

      const result = await service.enviarRecordatorios24h()

      expect(result.avisados).toBe(2)
      expect(refEvento.update).toHaveBeenCalledWith(expect.objectContaining({ recordatorio24hEnviado: true }))
      expect(notificacionesMock.crear).toHaveBeenCalledTimes(2)
      expect(notificacionesMock.crear).toHaveBeenNthCalledWith(
        1, 'a1', 'evento_recordatorio',
        expect.stringContaining('24 horas'),
        expect.stringContaining('Taller inclusivo'),
        'e1',
      )
    })

    it('omite eventos ya recordados (sin duplicar avisos)', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              docs: [{ id: 'e1', ref: {}, data: () => ({ titulo: 'X', fechaInicio: new Date(Date.now() + 3600000).toISOString(), activo: true, recordatorio24hEnviado: true }) }],
            }),
          }),
        })

      const result = await service.enviarRecordatorios24h()

      expect(result.avisados).toBe(0)
      expect(notificacionesMock.crear).not.toHaveBeenCalled()
      expect(firestoreMock.collection).toHaveBeenCalledTimes(1)
    })

    it('omite eventos fuera de la ventana de 24 horas', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              docs: [{ id: 'e1', ref: {}, data: () => ({ titulo: 'X', fechaInicio: new Date(Date.now() + 72 * 3600000).toISOString(), activo: true }) }],
            }),
          }),
        })

      const result = await service.enviarRecordatorios24h()

      expect(result.avisados).toBe(0)
      expect(notificacionesMock.crear).not.toHaveBeenCalled()
    })
  })
})
