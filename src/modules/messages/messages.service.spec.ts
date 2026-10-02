import { Test, TestingModule } from '@nestjs/testing'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { MessagesService } from './messages.service'
import { FIRESTORE } from '../../database/firebase.provider'

function mockDoc(data: Record<string, any> | null, exists = true, docId = 'mock-doc-id') {
  return { exists, id: docId, data: () => data }
}

function usuario(id: string, features: Record<string, boolean> = {
  chat: true, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true,
}, rol = 'pcd') {
  return { id, email: `${id}@test.com`, rol, nombreCompleto: 'Usuario', verificado: false, features } as any
}

describe('MessagesService', () => {
  let service: MessagesService
  let firestoreMock: Record<string, any>

  beforeEach(async () => {
    firestoreMock = { collection: jest.fn(), batch: jest.fn() }
    const module: TestingModule = await Test.createTestingModule({
      providers: [MessagesService, { provide: FIRESTORE, useValue: firestoreMock }],
    }).compile()
    service = module.get<MessagesService>(MessagesService)
  })

  describe('getConversations', () => {
    it('should return conversations with socio data', async () => {
      const sentMsgs = [{ id: 'm1', remitenteId: 'u1', destinatarioId: 'u2', contenido: 'Hola', fechaCreacion: '2024-01-01', leido: true }]
      const receivedMsgs = [{ id: 'm2', remitenteId: 'u2', destinatarioId: 'u1', contenido: 'Hi', fechaCreacion: '2024-01-02', leido: false }]

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: sentMsgs.map(m => ({ id: m.id, data: () => m })) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: receivedMsgs.map(m => ({ id: m.id, data: () => m })) }) })
        // conversacionesOcultas: ninguna conversación oculta
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [] as never[] }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [{ id: 'u2', data: () => ({ nombreCompleto: 'Pedro', activo: true }) }] }) })

      const result = await service.getConversations('u1')
      expect(result).toHaveLength(1)
      expect(result[0].socio.nombreCompleto).toBe('Pedro')
    })

    it('should return empty array when no conversations', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [] as never[] }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [] as never[] }) })

      const result = await service.getConversations('u1')
      expect(result).toHaveLength(0)
    })

    it('excluye conversaciones ocultas sin mensajes posteriores al borrado', async () => {
      const sentMsgs = [{ id: 'm1', remitenteId: 'u1', destinatarioId: 'u2', contenido: 'Hola', fechaCreacion: '2024-01-01T00:00:00.000Z', leido: true }]
      const receivedMsgs = [{ id: 'm2', remitenteId: 'u3', destinatarioId: 'u1', contenido: 'Hola 2', fechaCreacion: '2024-01-02T00:00:00.000Z', leido: false }]
      // u2 fue ocultada después de todos los mensajes; u3 nunca
      const ocultas = [{ id: 'u1_u2', data: () => ({ usuarioId: 'u1', socioId: 'u2', ocultoEn: '2024-06-01T00:00:00.000Z' }) }]

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: sentMsgs.map(m => ({ id: m.id, data: () => m })) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: receivedMsgs.map(m => ({ id: m.id, data: () => m })) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: ocultas }) })
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({
            docs: [
              { id: 'u2', data: () => ({ nombreCompleto: 'Pedro', activo: true }) },
              { id: 'u3', data: () => ({ nombreCompleto: 'Ana', activo: true }) },
            ],
          }),
        })

      const result = await service.getConversations('u1')
      expect(result).toHaveLength(1)
      expect(result[0].socio.nombreCompleto).toBe('Ana')
    })

    it('reincluye conversación oculta cuando hay un mensaje posterior al borrado', async () => {
      const sentMsgs = [{ id: 'm1', remitenteId: 'u1', destinatarioId: 'u2', contenido: 'Hola', fechaCreacion: '2024-01-01T00:00:00.000Z', leido: true }]
      const receivedMsgs = [{ id: 'm2', remitenteId: 'u2', destinatarioId: 'u1', contenido: 'Nuevo', fechaCreacion: '2024-07-01T00:00:00.000Z', leido: false }]
      const ocultas = [{ id: 'u1_u2', data: () => ({ usuarioId: 'u1', socioId: 'u2', ocultoEn: '2024-06-01T00:00:00.000Z' }) }]

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: sentMsgs.map(m => ({ id: m.id, data: () => m })) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: receivedMsgs.map(m => ({ id: m.id, data: () => m })) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: ocultas }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [{ id: 'u2', data: () => ({ nombreCompleto: 'Pedro', activo: true }) }] }) })

      const result = await service.getConversations('u1')
      expect(result).toHaveLength(1)
      expect(result[0].socio.nombreCompleto).toBe('Pedro')
    })

    // ═════════════════════════════════════════════════════════════════
    // Usuario fantasma (perfil inexistente / eliminado / desactivado)
    // ═════════════════════════════════════════════════════════════════

    /** Monta el mock de collection() para una conversación con un solo mensaje. */
    function mockUnaConversacion(perfilDoc: { id: string; data: () => Record<string, unknown> } | null) {
      const sentMsgs = [{ id: 'm1', remitenteId: 'u1', destinatarioId: 'u2', contenido: 'Hola', fechaCreacion: '2024-01-01', leido: true }]
      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: sentMsgs.map(m => ({ id: m.id, data: () => m })) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [] as never[] }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [] as never[] }) })
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: perfilDoc ? [perfilDoc] : [] }),
        })
    }

    it('marca isDeleted y conserva el historial cuando el perfil ya no existe', async () => {
      mockUnaConversacion(null)

      const result = await service.getConversations('u1')

      expect(result).toHaveLength(1)
      expect(result[0].isDeleted).toBe(true)
      expect(result[0].destinatarioActivo).toBe(false)
      expect(result[0].socio.nombreCompleto).toBe('Usuario Eliminado')
      // El historial NO se borra: sigue devolviéndose para poder mostrarlo.
      expect(result[0].ultimoMensaje).toBe('Hola')
    })

    it('marca isDeleted por el flag eliminado aunque la cuenta siga activa', async () => {
      mockUnaConversacion({ id: 'u2', data: () => ({ nombreCompleto: 'Pedro', activo: true, eliminado: true }) })

      const [conv] = await service.getConversations('u1')

      expect(conv.isDeleted).toBe(true)
      expect(conv.destinatarioActivo).toBe(false)
      expect(conv.socio.nombreCompleto).toBe('Usuario Eliminado')
    })

    it('no expone PII del socio eliminado (nombre, avatar y correo)', async () => {
      mockUnaConversacion({
        id: 'u2',
        data: () => ({ nombreCompleto: 'Pedro', email: 'pedro@test.com', urlAvatar: 'https://x/a.png', activo: false }),
      })

      const [conv] = await service.getConversations('u1')

      expect(conv.socio.nombreCompleto).toBe('Usuario Eliminado')
      expect((conv.socio as Record<string, unknown>).email).toBeUndefined()
      expect(conv.socio.urlAvatar).toBeNull()
    })

    it('marca isDeleted false para un socio activo', async () => {
      mockUnaConversacion({ id: 'u2', data: () => ({ nombreCompleto: 'Pedro', activo: true }) })

      const [conv] = await service.getConversations('u1')

      expect(conv.isDeleted).toBe(false)
      expect(conv.destinatarioActivo).toBe(true)
      expect(conv.socio.nombreCompleto).toBe('Pedro')
    })
  })

  describe('getMessages', () => {
    it('should mark unread messages as read and return messages', async () => {
      const batch = { update: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) }
      const unreadSnap = { docs: [{ ref: { update: jest.fn() } }], empty: false }
      const sentSnap = { docs: [{ id: 'm1', data: () => ({ contenido: 'Hola' }) }] }
      const receivedSnap = { docs: [{ id: 'm2', data: () => ({ contenido: 'Hi' }) }] }
      // IDOR protection: verification query returns non-empty (conversation exists)
      const verifySnap = { docs: [{ id: 'm0' }], empty: false }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(verifySnap) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(verifySnap) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(unreadSnap) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(sentSnap) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(receivedSnap) })
      firestoreMock.batch.mockReturnValue(batch)

      const result = await service.getMessages('u1', 'u2')
      expect(result).toHaveLength(2)
      expect(batch.commit).toHaveBeenCalled()
    })

    it('should not commit batch when no unread messages', async () => {
      const batch = { update: jest.fn(), commit: jest.fn() }
      const emptySnap = { docs: [] as never[], empty: true }
      const sentSnap = { docs: [] as never[] }
      const receivedSnap = { docs: [] as never[] }
      // IDOR protection: verification query returns non-empty (conversation exists)
      const verifySnap = { docs: [{ id: 'm0' }], empty: false }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(verifySnap) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(verifySnap) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(emptySnap) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(sentSnap) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(receivedSnap) })
      firestoreMock.batch.mockReturnValue(batch)

      await service.getMessages('u1', 'u2')
      expect(batch.commit).not.toHaveBeenCalled()
    })

    it('should throw ForbiddenException when no conversation exists between users', async () => {
      const emptySnap = { docs: [] as never[], empty: true }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(emptySnap) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(emptySnap) })

      await expect(service.getMessages('u1', 'stranger')).rejects.toThrow(ForbiddenException)
    })
  })

  describe('sendMessage', () => {
    it('should send a message successfully', async () => {
      const destDoc = mockDoc({ id: 'u2', activo: true }, true, 'u2')

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(destDoc) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ set: jest.fn().mockResolvedValue(undefined) }) })

      const result = await service.sendMessage(usuario('u1'), 'u2', 'Hola')
      expect(result.contenido).toBe('Hola')
      expect(result.remitenteId).toBe('u1')
      expect(result.destinatarioId).toBe('u2')
    })

    it('should throw ForbiddenException when sending to self', async () => {
      await expect(service.sendMessage(usuario('u1'), 'u1', 'Hola')).rejects.toThrow(ForbiddenException)
    })

    it('should throw ForbiddenException when destinatario does not exist', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }) })

      await expect(service.sendMessage(usuario('u1'), 'nonexistent', 'Hola')).rejects.toThrow(ForbiddenException)
    })

    it('should throw ForbiddenException when destinatario está desactivado', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc({ id: 'u2', activo: false }, true, 'u2')) }) })

      await expect(service.sendMessage(usuario('u1'), 'u2', 'Hola')).rejects.toThrow(ForbiddenException)
    })

    it('should throw ForbiddenException when destinatario tiene eliminado: true aunque siga activo', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc({ id: 'u2', activo: true, eliminado: true }, true, 'u2')) }) })

      await expect(service.sendMessage(usuario('u1'), 'u2', 'Hola')).rejects.toThrow(ForbiddenException)
    })

    it('should persist mediaUrl when multimedia is enabled', async () => {
      const setMock = jest.fn().mockResolvedValue(undefined)
      const destDoc = mockDoc({ id: 'u2', activo: true }, true, 'u2')

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(destDoc) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ set: setMock }) })

      const result = await service.sendMessage(usuario('u1'), 'u2', 'Mira esto', 'https://storage/media.jpg')

      expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ mediaUrl: 'https://storage/media.jpg' }))
      expect(result.mediaUrl).toBe('https://storage/media.jpg')
    })

    it('should throw ForbiddenException when multimedia is disabled and mediaUrl is provided', async () => {
      await expect(
        service.sendMessage(usuario('u1', { multimedia: false }), 'u2', 'Mira esto', 'https://storage/media.jpg'),
      ).rejects.toThrow('Funcionalidad "multimedia" desactivada')
    })

    it('should allow admin to send media even if multimedia flag is false', async () => {
      const destDoc = mockDoc({ id: 'u2', activo: true }, true, 'u2')

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(destDoc) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ set: jest.fn().mockResolvedValue(undefined) }) })

      const result = await service.sendMessage(usuario('u1', { multimedia: false }, 'admin'), 'u2', 'Mira esto', 'https://storage/media.jpg')
      expect(result.mediaUrl).toBe('https://storage/media.jpg')
    })

    it('should allow text-only messages even when multimedia is disabled', async () => {
      const destDoc = mockDoc({ id: 'u2', activo: true }, true, 'u2')

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(destDoc) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ set: jest.fn().mockResolvedValue(undefined) }) })

      const result = await service.sendMessage(usuario('u1', { multimedia: false }), 'u2', 'Hola')
      expect(result.mediaUrl).toBeNull()
    })
  })

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ size: 5 }) })

      const result = await service.getUnreadCount('u1')
      expect(result).toBe(5)
    })
  })

  describe('marcarConversacionLeida', () => {
    it('marca como leídos los mensajes recibidos del socio y retorna el conteo', async () => {
      const refs = [{ ref: { update: jest.fn() } }, { ref: { update: jest.fn() } }, { ref: { update: jest.fn() } }]
      const batch = { update: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) }

      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: false, docs: refs }),
      })
      firestoreMock.batch.mockReturnValue(batch)

      const result = await service.marcarConversacionLeida('u1', 'u2')

      expect(result).toEqual({ actualizados: 3 })
      expect(batch.update).toHaveBeenCalledTimes(3)
      refs.forEach(r => expect(batch.update).toHaveBeenCalledWith(r.ref, { leido: true }))
      expect(batch.commit).toHaveBeenCalledTimes(1)
    })

    it('no crea batch cuando no hay mensajes sin leer', async () => {
      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      })

      const result = await service.marcarConversacionLeida('u1', 'u2')

      expect(result).toEqual({ actualizados: 0 })
      expect(firestoreMock.batch).not.toHaveBeenCalled()
    })

    it('rechaza marcar la propia conversación (usuario == socio)', async () => {
      await expect(service.marcarConversacionLeida('u1', 'u1')).rejects.toThrow(ForbiddenException)
      expect(firestoreMock.collection).not.toHaveBeenCalled()
    })

    it('pagina en múltiples batches con conversaciones de más de 450 mensajes', async () => {
      const refs = Array.from({ length: 900 }, () => ({ ref: { update: jest.fn() } }))
      const batch = { update: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) }

      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: false, docs: refs }),
      })
      firestoreMock.batch.mockReturnValue(batch)

      const result = await service.marcarConversacionLeida('u1', 'u2')

      expect(result).toEqual({ actualizados: 900 })
      expect(batch.commit).toHaveBeenCalledTimes(2) // 450 + 450
    })
  })

  describe('ocultarConversacion (borrar chat)', () => {
    it('rechaza borrar la propia conversación', async () => {
      await expect(service.ocultarConversacion('u1', 'u1')).rejects.toThrow(ForbiddenException)
      expect(firestoreMock.collection).not.toHaveBeenCalled()
    })

    it('retorna 404 cuando no hay mensajes entre ambos (protección IDOR)', async () => {
      const vacio = { docs: [] as never[], empty: true }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(vacio) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(vacio) })

      await expect(service.ocultarConversacion('u1', 'stranger')).rejects.toThrow(NotFoundException)
    })

    it('crea el documento oculto y marca como leídos los recibidos', async () => {
      const existe = { docs: [{ id: 'm1' }], empty: false }
      const setMock = jest.fn().mockResolvedValue(undefined)
      const batch = { update: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) }
      const noLeidos = { docs: [{ ref: { update: jest.fn() } }], empty: false }

      firestoreMock.collection
        // verificación de pertenencia (enviados/recibidos)
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(existe) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [] as never[], empty: true }) })
        // doc de conversación oculta
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ set: setMock }) })
        // marcarConversacionLeida → mensajes sin leer
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(noLeidos) })
      firestoreMock.batch.mockReturnValue(batch)

      const result = await service.ocultarConversacion('u1', 'u2')

      expect(result).toEqual({ ocultado: true, socioId: 'u2' })
      expect(setMock).toHaveBeenCalledWith({ usuarioId: 'u1', socioId: 'u2', ocultoEn: expect.any(String) })
      expect(batch.commit).toHaveBeenCalledTimes(1)
    })

    it('sin mensajes sin leer no crea batch de lectura', async () => {
      const existe = { docs: [{ id: 'm1' }], empty: false }
      const setMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(existe) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [] as never[], empty: true }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ set: setMock }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ empty: true, docs: [] as never[] }) })

      const result = await service.ocultarConversacion('u1', 'u2')

      expect(result.ocultado).toBe(true)
      expect(firestoreMock.batch).not.toHaveBeenCalled()
    })
  })
})
