import { ExecutionContext, BadRequestException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { LimitDependientesGuard } from './limit-dependientes.guard'
import { FIRESTORE } from '../../database/firebase.provider'
import { getMaxDependientesPorTutor } from '../../database/firestore.constants'
import { LIMIT_DEPENDIENTES_KEY } from '../decorators/limit-dependientes.decorator'

function mockExecutionContext(user?: { id: string }) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: jest.fn(),
  } as unknown as ExecutionContext
}

describe('LimitDependientesGuard', () => {
  let guard: LimitDependientesGuard
  let reflector: Reflector
  let firestoreMock: Record<string, any>

  beforeEach(() => {
    reflector = new Reflector()
    firestoreMock = {
      collection: jest.fn(),
    }
    guard = new LimitDependientesGuard(reflector, firestoreMock as any)
  })

  describe('when decorator is not present', () => {
    it('should allow access when no metadata is defined', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue(undefined)
      expect(await guard.canActivate(mockExecutionContext({ id: 'user1' }))).toBe(true)
    })
  })

  describe('when decorator is present', () => {
    beforeEach(() => {
      jest.spyOn(reflector, 'get').mockReturnValue(true)
    })

    it('should allow access when user has fewer dependents than the limit', async () => {
      const deps = Array.from({ length: 3 }, (_, i) => ({ id: `dep-${i}` }))
      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ size: 3, docs: deps }),
      })

      const result = await guard.canActivate(mockExecutionContext({ id: 'user1' }))
      expect(result).toBe(true)
    })

    it('should throw BadRequestException when user has reached the max limit', async () => {
      const limite = getMaxDependientesPorTutor()
      const deps = Array.from({ length: limite }, (_, i) => ({ id: `dep-${i}` }))
      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ size: limite, docs: deps }),
      })

      await expect(
        guard.canActivate(mockExecutionContext({ id: 'user1' })),
      ).rejects.toThrow(BadRequestException)
    })

    it('should respect custom limit from environment variable', async () => {
      const original = process.env.MAX_DEPENDIENTES_POR_TUTOR
      process.env.MAX_DEPENDIENTES_POR_TUTOR = '3'

      const deps = Array.from({ length: 3 }, (_, i) => ({ id: `dep-${i}` }))
      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ size: 3, docs: deps }),
      })

      await expect(
        guard.canActivate(mockExecutionContext({ id: 'user1' })),
      ).rejects.toThrow(BadRequestException)

      // Restore
      if (original === undefined) delete process.env.MAX_DEPENDIENTES_POR_TUTOR
      else process.env.MAX_DEPENDIENTES_POR_TUTOR = original
    })

    it('should allow access when user has no dependents', async () => {
      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ size: 0, docs: [] }),
      })

      const result = await guard.canActivate(mockExecutionContext({ id: 'user1' }))
      expect(result).toBe(true)
    })

    it('should allow access when user is not authenticated (no user.id)', async () => {
      expect(await guard.canActivate(mockExecutionContext(undefined))).toBe(true)
    })

    it('should query the correct Firestore collection', async () => {
      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ size: 0, docs: [] }),
      })

      await guard.canActivate(mockExecutionContext({ id: 'user1' }))

      expect(firestoreMock.collection).toHaveBeenCalledWith('dependientes')
    })
  })
})
