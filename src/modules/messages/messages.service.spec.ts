import { Test, TestingModule } from '@nestjs/testing'
import { ForbiddenException } from '@nestjs/common'
import { FieldValue } from 'firebase-admin/firestore'
import { MessagesService } from './messages.service'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'

type DocData = Record<string, any>
type Filtro = [string, string, unknown]

/**
 * Refs estables por id de documento: permite afirmar por identidad
 * (`toHaveBeenCalledWith(refDe('m1'), ...)`) en lugar de por estructura.
 */
const refs = new Map<string, { path: string }>()
function refDe(id: string): { path: string } {
  if (!refs.has(id)) refs.set(id, { path: id })
  return refs.get(id)!
}

/** Contador de ids autogenerados, como los que asigna Firestore con `collection.doc()`. */
let contadorAutoId = 0

/**
 * Colección de Firestore falsa: soporta `where(campo, op, valor)` encadenados y
 * filtra en memoria. Se usa en lugar de `mockReturnValueOnce` encadenados para que
 * los tests no dependan del número ni del orden de consultas que hace el servicio.
 *
 * Cada `.where()` devuelve una query NUEVA (como Firestore) copiando los filtros
 * previos: el servicio reutiliza la misma base para dos cadenas independientes y,
 * si se compartiera el array de filtros, la segunda consulta heredaría los
 * criterios de la primera.
 */
function crearQueryFalsa(docs: DocData[], filtros: Filtro[] = []): any {
  const coincide = (d: DocData, [campo, op, valor]: Filtro): boolean => {
    if (campo === '__name__') {
      if (op === 'in') return (valor as string[]).includes(d.id)
      return d.id === valor
    }
    return d[campo] === valor
  }

  const snapshotDe = (d: DocData) => ({ id: d.id, ref: refDe(d.id), exists: true, data: () => d })

  return {
    where: (campo: string, op: string, valor: unknown) =>
      crearQueryFalsa(docs, [...filtros, [campo, op, valor] as Filtro]),

    get: async () => {
      const filtrados = docs.filter(d => filtros.every(f => coincide(d, f)))
      return { docs: filtrados.map(snapshotDe), empty: filtrados.length === 0, size: filtrados.length }
    },

    doc: (docId?: string) => {
      const id = docId ?? `auto-${++contadorAutoId}`
      return {
        id,
        ref: refDe(id),
        get: async () => {
          const encontrado = docs.find(d => d.id === id)
          return { exists: !!encontrado, id, data: () => encontrado }
        },
        set: async (data: DocData) => {
          const existente = docs.find(d => d.id === id)
          if (existente) Object.assign(existente, data)
          else docs.push({ id, ...data })
        },
      }
    },
  }
}

/** Batch de Firestore falso con la misma superficie que usa el servicio. */
interface BatchFalsa {
  ops: { tipo: 'update' | 'set'; ref: { path: string }; data: DocData; merge?: boolean }[]
  update: jest.Mock
  set: jest.Mock
  commit: jest.Mock
}

/**
 * Batch de Firestore falso que SÍ aplica las escrituras sobre el array en memoria,
 * para poder comprobar el efecto real del borrado lógico (y no solo las llamadas).
 * Resuelve los sentinelas de `FieldValue` (`arrayUnion`, etc.).
 */
function crearBatchFalsa(docs: DocData[]): BatchFalsa {
  const ops: BatchFalsa['ops'] = []

  const aplicar = (campo: string, valor: unknown, destino: DocData) => {
    if (valor instanceof FieldValue) {
      // arrayUnion: agrega los elementos sin duplicar.
      destino[campo] = Array.from(new Set([...(destino[campo] ?? []), ...(valor as unknown as { elements: unknown[] }).elements]))
    } else {
      destino[campo] = valor
    }
  }

  const batch: BatchFalsa = {
    ops,
    update: jest.fn((ref: { path: string }, data: DocData) => {
      ops.push({ tipo: 'update', ref, data })
      return batch
    }),
    set: jest.fn((ref: { path: string }, data: DocData, opts?: { merge?: boolean }) => {
      ops.push({ tipo: 'set', ref, data, merge: opts?.merge })
      return batch
    }),
    commit: jest.fn(async () => {
      for (const op of ops) {
        const destino = docs.find(d => d.id === op.ref.path)
        if (!destino) continue
        Object.entries(op.data).forEach(([campo, valor]) => aplicar(campo, valor, destino))
      }
      ops.length = 0
    }),
  }

  return batch
}

function usuario(id: string, features: Record<string, boolean> = {
  chat: true, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true,
}, rol = 'pcd') {
  return { id, email: `${id}@test.com`, rol, nombreCompleto: 'Usuario', verificado: false, features } as any
}

describe('MessagesService', () => {
  let service: MessagesService
  let firestoreMock: Record<string, any>
  let mensajesEnBd: DocData[]
  let perfilesEnBd: DocData[]
  let batch: ReturnType<typeof crearBatchFalsa>

  beforeEach(async () => {
    mensajesEnBd = []
    perfilesEnBd = []
    batch = crearBatchFalsa(mensajesEnBd)

    firestoreMock = { collection: jest.fn(), batch: jest.fn() }
    firestoreMock.collection.mockImplementation((nombre: string) =>
      nombre === COLECCIONES.perfiles ? crearQueryFalsa(perfilesEnBd) : crearQueryFalsa(mensajesEnBd),
    )
    firestoreMock.batch.mockReturnValue(batch)

    const module: TestingModule = await Test.createTestingModule({
      providers: [MessagesService, { provide: FIRESTORE, useValue: firestoreMock }],
    }).compile()
    service = module.get<MessagesService>(MessagesService)
  })

  // ═══════════════════════════════════════════════════════════════════
  describe('getConversations', () => {
    it('agrupa por socio y toma el mensaje MÁS RECIENTE como último', async () => {
      mensajesEnBd = [
        { id: 'm1', remitenteId: 'u1', destinatarioId: 'u2', contenido: 'viejo', fechaCreacion: '2024-01-01', leido: true },
        { id: 'm2', remitenteId: 'u2', destinatarioId: 'u1', contenido: 'reciente', fechaCreacion: '2024-01-05', leido: false },
        { id: 'm3', remitenteId: 'u1', destinatarioId: 'u2', contenido: 'intermedio', fechaCreacion: '2024-01-03', leido: true },
      ]
      perfilesEnBd = [{ id: 'u2', nombreCompleto: 'Pedro', activo: true }]

      const result = await service.getConversations('u1')

      expect(result).toHaveLength(1)
      expect(result[0].socio.nombreCompleto).toBe('Pedro')
      expect(result[0].ultimoMensaje).toBe('reciente')
      expect(result[0].ultimoEn).toBe('2024-01-05')
      expect(result[0].noLeidos).toBe(1)
    })

    it('marca isDeleted cuando el perfil del socio ya no existe (usuario fantasma)', async () => {
      mensajesEnBd = [{ id: 'm1', remitenteId: 'u1', destinatarioId: 'fantasma', contenido: 'Hola', fechaCreacion: '2024-01-01', leido: true }]
      perfilesEnBd = []

      const result = await service.getConversations('u1')

      expect(result).toHaveLength(1)
      expect(result[0].isDeleted).toBe(true)
      expect(result[0].destinatarioActivo).toBe(false)
      // El historial NO se borra: sigue devolviéndose para poder mostrarlo.
      expect(result[0].ultimoMensaje).toBe('Hola')
      expect(result[0].socio.nombreCompleto).toBe('Usuario Eliminado')
    })

    it('marca isDeleted cuando la cuenta del socio está desactivada', async () => {
      mensajesEnBd = [{ id: 'm1', remitenteId: 'u1', destinatarioId: 'u2', contenido: 'Hola', fechaCreacion: '2024-01-01', leido: true }]
      perfilesEnBd = [{ id: 'u2', nombreCompleto: 'Pedro', activo: false, eliminado: true }]

      const result = await service.getConversations('u1')

      expect(result[0].isDeleted).toBe(true)
      expect(result[0].destinatarioActivo).toBe(false)
    })

    it('marca isDeleted por el flag eliminado aunque la cuenta siga activa', async () => {
      // Guarda contra la cual el borrado lógico depende solo de `eliminado: true`.
      mensajesEnBd = [{ id: 'm1', remitenteId: 'u1', destinatarioId: 'u2', contenido: 'Hola', fechaCreacion: '2024-01-01', leido: true }]
      perfilesEnBd = [{ id: 'u2', nombreCompleto: 'Pedro', activo: true, eliminado: true }]

      const [conv] = await service.getConversations('u1')

      expect(conv.isDeleted).toBe(true)
      expect(conv.destinatarioActivo).toBe(false)
      expect(conv.socio.nombreCompleto).toBe('Usuario Eliminado')
    })

    it('bloquea el envío a un socio eliminado que aún figura como activo', async () => {
      perfilesEnBd = [{ id: 'u2', nombreCompleto: 'Pedro', activo: true, eliminado: true }]
      await expect(service.sendMessage(usuario('u1'), 'u2', 'Hola')).rejects.toThrow()
    })

    it('no expone PII del socio eliminado (nombre, avatar y correo)', async () => {
      mensajesEnBd = [{ id: 'm1', remitenteId: 'u1', destinatarioId: 'u2', contenido: 'Hola', fechaCreacion: '2024-01-01', leido: true }]
      perfilesEnBd = [{ id: 'u2', nombreCompleto: 'Pedro', email: 'pedro@test.com', urlAvatar: 'https://x/a.png', activo: false }]

      const [conv] = await service.getConversations('u1')

      expect(conv.socio.nombreCompleto).toBe('Usuario Eliminado')
      expect((conv.socio as Record<string, unknown>).email).toBeUndefined()
      expect(conv.socio.urlAvatar).toBeNull()
    })

    it('marca isDeleted false para un socio activo', async () => {
      mensajesEnBd = [{ id: 'm1', remitenteId: 'u1', destinatarioId: 'u2', contenido: 'Hola', fechaCreacion: '2024-01-01', leido: true }]
      perfilesEnBd = [{ id: 'u2', nombreCompleto: 'Pedro', activo: true }]

      const [conv] = await service.getConversations('u1')

      expect(conv.isDeleted).toBe(false)
      expect(conv.destinatarioActivo).toBe(true)
      expect(conv.socio.nombreCompleto).toBe('Pedro')
    })

    it('oculta los mensajes que el usuario ya eliminó de su vista', async () => {
      mensajesEnBd = [
        { id: 'm1', remitenteId: 'u1', destinatarioId: 'u2', contenido: 'Hola', fechaCreacion: '2024-01-01', leido: true, eliminadoPor: ['u1'] },
        { id: 'm2', remitenteId: 'u1', destinatarioId: 'u3', contenido: 'Otro', fechaCreacion: '2024-01-02', leido: true },
      ]
      perfilesEnBd = [
        { id: 'u2', nombreCompleto: 'Pedro', activo: true },
        { id: 'u3', nombreCompleto: 'Ana', activo: true },
      ]

      const result = await service.getConversations('u1')

      expect(result).toHaveLength(1)
      expect(result[0].socio.id).toBe('u3')
    })

    it('return empty array when no conversations', async () => {
      const result = await service.getConversations('u1')
      expect(result).toHaveLength(0)
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  describe('getMessages', () => {
    it('should mark unread messages as read and return messages sorted', async () => {
      mensajesEnBd = [
        { id: 'm2', remitenteId: 'u2', destinatarioId: 'u1', contenido: 'Hola', fechaCreacion: '2024-01-02', leido: false },
        { id: 'm1', remitenteId: 'u1', destinatarioId: 'u2', contenido: 'Hi', fechaCreacion: '2024-01-01', leido: true },
      ]

      const result = await service.getMessages('u1', 'u2')

      expect(result).toHaveLength(2)
      expect(result.map(m => m.id)).toEqual(['m1', 'm2'])
      expect(batch.update).toHaveBeenCalledWith(refDe('m2'), { leido: true })
      expect(batch.update).toHaveBeenCalledTimes(1)
      expect(batch.commit).toHaveBeenCalledTimes(1)
    })

    it('should not commit batch when no unread messages', async () => {
      mensajesEnBd = [
        { id: 'm1', remitenteId: 'u1', destinatarioId: 'u2', contenido: 'Hola', fechaCreacion: '2024-01-01', leido: true },
      ]

      await service.getMessages('u1', 'u2')

      expect(batch.commit).not.toHaveBeenCalled()
    })

    it('should throw ForbiddenException when no conversation exists between users', async () => {
      await expect(service.getMessages('u1', 'stranger')).rejects.toThrow(ForbiddenException)
    })

    it('rechaza leer la propia conversación', async () => {
      await expect(service.getMessages('u1', 'u1')).rejects.toThrow(ForbiddenException)
    })

    it('403: no permite reabrir por URL una conversación que el usuario eliminó', async () => {
      mensajesEnBd = [
        { id: 'm1', remitenteId: 'u1', destinatarioId: 'u2', contenido: 'Hola', fechaCreacion: '2024-01-01', leido: true, eliminadoPor: ['u1'] },
      ]

      await expect(service.getMessages('u1', 'u2')).rejects.toThrow(ForbiddenException)
    })

    it('sigue mostrando el historial si lo eliminó la contraparte, no el usuario', async () => {
      mensajesEnBd = [
        { id: 'm1', remitenteId: 'u1', destinatarioId: 'u2', contenido: 'Hola', fechaCreacion: '2024-01-01', leido: true, eliminadoPor: ['u2'] },
      ]

      const result = await service.getMessages('u1', 'u2')

      expect(result).toHaveLength(1)
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  describe('sendMessage', () => {
    it('should send a message successfully', async () => {
      perfilesEnBd = [{ id: 'u2', activo: true }]
      const result = await service.sendMessage(usuario('u1'), 'u2', 'Hola')
      expect(result.contenido).toBe('Hola')
      expect(result.remitenteId).toBe('u1')
      expect(result.destinatarioId).toBe('u2')
      expect(mensajesEnBd).toHaveLength(1)
    })

    it('should throw ForbiddenException when sending to self', async () => {
      await expect(service.sendMessage(usuario('u1'), 'u1', 'Hola')).rejects.toThrow(ForbiddenException)
    })

    it('should throw ForbiddenException when destinatario does not exist', async () => {
      await expect(service.sendMessage(usuario('u1'), 'nonexistent', 'Hola')).rejects.toThrow(ForbiddenException)
    })

    it('should throw ForbiddenException when destinatario is a deactivated (ghost) account', async () => {
      perfilesEnBd = [{ id: 'u2', activo: false, eliminado: true }]
      await expect(service.sendMessage(usuario('u1'), 'u2', 'Hola')).rejects.toThrow('Usuario destinatario no existe')
    })

    it('should persist mediaUrl when multimedia is enabled', async () => {
      perfilesEnBd = [{ id: 'u2', activo: true }]
      const result = await service.sendMessage(usuario('u1'), 'u2', 'Mira esto', 'https://storage/media.jpg')
      expect(result.mediaUrl).toBe('https://storage/media.jpg')
      expect(mensajesEnBd[0].mediaUrl).toBe('https://storage/media.jpg')
    })

    it('should throw ForbiddenException when multimedia is disabled and mediaUrl is provided', async () => {
      await expect(
        service.sendMessage(usuario('u1', { multimedia: false }), 'u2', 'Mira esto', 'https://storage/media.jpg'),
      ).rejects.toThrow('Funcionalidad "multimedia" desactivada')
    })

    it('should allow admin to send media even if multimedia flag is false', async () => {
      perfilesEnBd = [{ id: 'u2', activo: true }]
      const result = await service.sendMessage(usuario('u1', { multimedia: false }, 'admin'), 'u2', 'Mira esto', 'https://storage/media.jpg')
      expect(result.mediaUrl).toBe('https://storage/media.jpg')
    })

    it('should allow text-only messages even when multimedia is disabled', async () => {
      perfilesEnBd = [{ id: 'u2', activo: true }]
      const result = await service.sendMessage(usuario('u1', { multimedia: false }), 'u2', 'Hola')
      expect(result.mediaUrl).toBeNull()
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  describe('deleteConversation', () => {
    beforeEach(() => {
      // Se muta el array en lugar de reasignarlo: el batch falso y el mock de
      // `collection` capturan estas referencias, y una reasignación los dejaría
      // apuntando a un array viejo (las escrituras no se verían al leer).
      mensajesEnBd.length = 0
      mensajesEnBd.push(
        { id: 'm1', remitenteId: 'u1', destinatarioId: 'u2', contenido: 'Hola', fechaCreacion: '2024-01-01', leido: true },
        { id: 'm2', remitenteId: 'u2', destinatarioId: 'u1', contenido: 'Hi', fechaCreacion: '2024-01-02', leido: true },
        { id: 'm3', remitenteId: 'u1', destinatarioId: 'u3', contenido: 'Otro', fechaCreacion: '2024-01-03', leido: true },
      )
    })

    it('marca ambos sentidos de la conversación con arrayUnion y merge', async () => {
      const result = await service.deleteConversation('u1', 'u2')

      expect(result).toEqual({ exito: true, mensaje: 'Conversación eliminada', eliminados: 2 })
      const rutas = batch.set.mock.calls.map((c: [{ path: string }]) => c[0].path)
      expect(rutas.sort()).toEqual(['m1', 'm2'])
      batch.set.mock.calls.forEach((c: [{ path: string }, DocData, { merge?: boolean }]) => {
        expect(c[1]).toHaveProperty('eliminadoPor')
        expect(c[2]).toEqual({ merge: true })
      })
      expect(batch.commit).toHaveBeenCalledTimes(1)
      // El marcador `eliminadoPor` quedó persistido en ambos sentidos.
      expect(mensajesEnBd.find(d => d.id === 'm1')?.eliminadoPor).toEqual(['u1'])
      expect(mensajesEnBd.find(d => d.id === 'm2')?.eliminadoPor).toEqual(['u1'])
    })

    it('NO destruye los mensajes: solo los oculta para quien eliminó (integridad de datos)', async () => {
      await service.deleteConversation('u1', 'u2')

      expect(mensajesEnBd).toHaveLength(3)
      expect(await service.getMessages('u2', 'u1')).toHaveLength(2) // la contraparte conserva su historial
      await expect(service.getMessages('u1', 'u2')).rejects.toThrow(ForbiddenException) // el solicitante ya no la ve
    })

    it('es idempotente: repetirla devuelve 200 con eliminados 0', async () => {
      await service.deleteConversation('u1', 'u2')
      const result = await service.deleteConversation('u1', 'u2')

      expect(result).toEqual({ exito: true, mensaje: 'No hay conversación que eliminar', eliminados: 0 })
    })

    it('devuelve 200 sin tocar la base si la conversación nunca existió', async () => {
      const result = await service.deleteConversation('u1', 'desconocido')

      expect(result.exito).toBe(true)
      expect(result.eliminados).toBe(0)
      expect(batch.commit).not.toHaveBeenCalled()
    })

    it('no toca conversaciones de otros socios', async () => {
      await service.deleteConversation('u1', 'u2')

      const convs = await service.getConversations('u1')
      expect(convs.map(c => c.socio.id)).toEqual(['u3'])
    })

    it('rechaza eliminar la propia conversación (usuario == socio)', async () => {
      await expect(service.deleteConversation('u1', 'u1')).rejects.toThrow(ForbiddenException)
    })

    it('pagina en lotes de 450 para no superar el límite de 500 ops de Firestore', async () => {
      mensajesEnBd = Array.from({ length: 1000 }, (_, i) => ({
        id: `m${i}`, remitenteId: 'u1', destinatarioId: 'u2', contenido: 'x', fechaCreacion: '2024-01-01', leido: true,
      }))

      const result = await service.deleteConversation('u1', 'u2')

      expect(result.eliminados).toBe(1000)
      expect(batch.commit).toHaveBeenCalledTimes(3) // 450 + 450 + 100
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      mensajesEnBd = [
        { id: 'm1', remitenteId: 'u2', destinatarioId: 'u1', leido: false },
        { id: 'm2', remitenteId: 'u2', destinatarioId: 'u1', leido: false },
        { id: 'm3', remitenteId: 'u2', destinatarioId: 'u1', leido: false, eliminadoPor: ['u1'] },
      ]

      expect(await service.getUnreadCount('u1')).toBe(2)
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  describe('marcarConversacionLeida', () => {
    it('marca como leídos los mensajes recibidos del socio y retorna el conteo', async () => {
      mensajesEnBd = [
        { id: 'm1', remitenteId: 'u2', destinatarioId: 'u1', leido: false },
        { id: 'm2', remitenteId: 'u2', destinatarioId: 'u1', leido: false },
        { id: 'm3', remitenteId: 'u2', destinatarioId: 'u1', leido: false, eliminadoPor: ['u1'] },
      ]

      const result = await service.marcarConversacionLeida('u1', 'u2')

      expect(result).toEqual({ actualizados: 2 })
      expect(batch.update).toHaveBeenCalledWith(refDe('m1'), { leido: true })
      expect(batch.update).toHaveBeenCalledWith(refDe('m2'), { leido: true })
      expect(batch.update).not.toHaveBeenCalledWith(refDe('m3'), { leido: true })
      expect(batch.commit).toHaveBeenCalledTimes(1)
    })

    it('no crea batch cuando no hay mensajes sin leer', async () => {
      const result = await service.marcarConversacionLeida('u1', 'u2')

      expect(result).toEqual({ actualizados: 0 })
      expect(firestoreMock.batch).not.toHaveBeenCalled()
    })

    it('rechaza marcar la propia conversación (usuario == socio)', async () => {
      await expect(service.marcarConversacionLeida('u1', 'u1')).rejects.toThrow(ForbiddenException)
      expect(firestoreMock.collection).not.toHaveBeenCalled()
    })

    it('pagina en múltiples batches con conversaciones de más de 450 mensajes', async () => {
      mensajesEnBd = Array.from({ length: 900 }, (_, i) => ({
        id: `m${i}`, remitenteId: 'u2', destinatarioId: 'u1', leido: false,
      }))

      const result = await service.marcarConversacionLeida('u1', 'u2')

      expect(result).toEqual({ actualizados: 900 })
      expect(batch.commit).toHaveBeenCalledTimes(2) // 450 + 450
    })
  })
})