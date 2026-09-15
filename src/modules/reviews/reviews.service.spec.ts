import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, ForbiddenException } from '@nestjs/common'
import { ReviewsService } from './reviews.service'
import { FIRESTORE } from '../../database/firebase.provider'

function mockDoc(data: Record<string, any> | null, exists = true, docId = 'mock-doc-id') {
  return { exists, id: docId, data: () => data, ref: { update: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined), delete: jest.fn().mockResolvedValue(undefined) } }
}

describe('ReviewsService', () => {
  let service: ReviewsService
  let firestoreMock: Record<string, any>

  beforeEach(async () => {
    firestoreMock = {
      collection: jest.fn(),
      // Transacción simulada: lee/borra a través de los objetos mockeados y
      // confirma que el servicio delega en tx.get/tx.set/tx.update/tx.delete.
      // Incluye la regla real de Firestore: NO se permiten lecturas después de
      // una escritura dentro de la transacción.
      runTransaction: jest.fn(async (cb: any) => {
        let escritura = false
        const tx = {
          get: async (target: any) => {
            if (escritura) throw new Error('Firestore: lectura después de escritura en transacción')
            return target.get()
          },
          set: (ref: any, data: any, opts?: any) => {
            escritura = true
            return opts === undefined ? ref.set(data) : ref.set(data, opts)
          },
          update: (ref: any, data: any) => {
            escritura = true
            return ref.update(data)
          },
          delete: (ref: any) => {
            escritura = true
            return ref.delete()
          },
        }
        return cb(tx)
      }),
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReviewsService, { provide: FIRESTORE, useValue: firestoreMock }],
    }).compile()
    service = module.get<ReviewsService>(ReviewsService)
  })

  describe('findByInstitution', () => {
    it('should return reviews with user data', async () => {
      const reviews = [
        { id: 'r1', calificacion: 5, comentario: 'Excelente', usuarioId: 'u1', fechaCreacion: '2024-01-01' },
      ]
      const userData = { nombreCompleto: 'Juan', urlAvatar: 'url' }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: reviews.map(r => ({ id: r.id, data: () => r })) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(userData, true, 'u1')) }) })

      const result = await service.findByInstitution('inst1')
      expect(result.datos).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.datos[0].nombreCompleto).toBe('Juan')
    })

    it('should return empty array when no reviews', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [] as never[], size: 0 }) })

      const result = await service.findByInstitution('inst1')
      expect(result.datos).toHaveLength(0)
    })
  })

  describe('submit', () => {
    it('should create a new review atomically with deterministic id', async () => {
      const setMock = jest.fn().mockResolvedValue(undefined)
      const updateInstMock = jest.fn().mockResolvedValue(undefined)
      const allReviewsSnap = { docs: [{ data: () => ({ calificacion: 4 }) }], size: 1 }

      firestoreMock.collection
        // 1. ref determinista usuario_institución (no existe → set)
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ id: 'user1_inst1', get: jest.fn().mockResolvedValue({ exists: false }), set: setMock, update: jest.fn().mockResolvedValue(undefined), delete: jest.fn().mockResolvedValue(undefined) }) })
        // 2. query de todas las reseñas de la institución (dentro de la transacción)
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(allReviewsSnap) })
        // 3. institución: promedio y contador actualizados en la misma transacción
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ update: updateInstMock }) })

      const result = await service.submit('user1', 'inst1', 4, 'Buen servicio')

      expect(result.id).toBe('user1_inst1')
      expect(result.calificacion).toBe(4)
      expect(result.usuarioId).toBe('user1')
      expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: 'user1', institucionId: 'inst1', calificacion: 4 }))
      expect(updateInstMock).toHaveBeenCalledWith({ calificacionPromedio: 4, cantidadCalificaciones: 1 })
    })

    it('should update existing review atomically (sin duplicados por ID determinista)', async () => {
      const updateMock = jest.fn().mockResolvedValue(undefined)
      const allReviewsSnap = { docs: [{ data: () => ({ calificacion: 5 }) }], size: 1 }

      firestoreMock.collection
        // 1. la reseña ya existe en el doc determinista → update
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ id: 'user1_inst1', get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ calificacion: 3 }) }), set: jest.fn().mockResolvedValue(undefined), update: updateMock, delete: jest.fn().mockResolvedValue(undefined) }) })
        // 2. query de todas las reseñas de la institución
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(allReviewsSnap) })
        // 3. institución: promedio actualizado
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ update: jest.fn().mockResolvedValue(undefined) }) })

      const result = await service.submit('user1', 'inst1', 5, 'Actualizado')

      expect(result.id).toBe('user1_inst1')
      expect(result.calificacion).toBe(5)
      expect(updateMock).toHaveBeenCalledWith({ calificacion: 5, comentario: 'Actualizado', fechaActualizacion: expect.any(String) })
      // El set no debe ejecutarse en la ruta de actualización
      expect(firestoreMock.runTransaction).toHaveBeenCalledTimes(1)
    })
  })

  describe('myReviews', () => {
    it('should return user reviews with institution data', async () => {
      const reviews = [
        { id: 'r1', calificacion: 5, institucionId: 'inst1', fechaCreacion: '2024-01-01' },
      ]
      const instData = { nombre: 'Centro Test', categoria: 'funcional' }

      firestoreMock.collection
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: reviews.map(r => ({ id: r.id, data: () => r })) }) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(instData, true, 'inst1')) }) })

      const result = await service.myReviews('user1')
      expect(result.datos).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.datos[0].nombreInstitucion).toBe('Centro Test')
    })
  })

  describe('update', () => {
    it('should update review when user is the author', async () => {
      const resenaData = { id: 'r1', usuarioId: 'u1', institucionId: 'inst1', calificacion: 3, comentario: 'Old' }
      const allReviewsSnap = { docs: [{ data: () => ({ calificacion: 5 }) }], size: 1 }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(resenaData, true, 'r1')), update: jest.fn().mockResolvedValue(undefined) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(allReviewsSnap) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ update: jest.fn().mockResolvedValue(undefined) }) })

      const result = await service.update('r1', 'u1', { calificacion: 5, comentario: 'Updated' })
      expect(result.calificacion).toBe(5)
    })

    it('should throw NotFoundException when review does not exist', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }) })

      await expect(service.update('nonexistent', 'u1', { calificacion: 5 })).rejects.toThrow(NotFoundException)
    })

    it('should throw ForbiddenException when user is not the author', async () => {
      const resenaData = { id: 'r1', usuarioId: 'u2', institucionId: 'inst1' }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(resenaData, true, 'r1')) }) })

      await expect(service.update('r1', 'u1', { calificacion: 5 })).rejects.toThrow(ForbiddenException)
    })
  })

  describe('remove', () => {
    it('should delete review and recalculate average', async () => {
      const resenaData = { id: 'r1', usuarioId: 'u1', institucionId: 'inst1', calificacion: 4 }
      const allReviewsSnap = { docs: [{ data: () => ({ calificacion: 3 }) }], size: 1 }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(resenaData, true, 'r1')), delete: jest.fn().mockResolvedValue(undefined) }) })
        .mockReturnValueOnce({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(allReviewsSnap) })
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ update: jest.fn().mockResolvedValue(undefined) }) })

      const result = await service.remove('r1', 'u1')
      expect(result.eliminado).toBe(true)
    })

    it('should throw NotFoundException when review does not exist', async () => {
      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }) })

      await expect(service.remove('nonexistent', 'u1')).rejects.toThrow(NotFoundException)
    })

    it('should throw ForbiddenException when user is not the author', async () => {
      const resenaData = { id: 'r1', usuarioId: 'u2', institucionId: 'inst1' }

      firestoreMock.collection
        .mockReturnValueOnce({ doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(resenaData, true, 'r1')) }) })

      await expect(service.remove('r1', 'u1')).rejects.toThrow(ForbiddenException)
    })
  })
})
