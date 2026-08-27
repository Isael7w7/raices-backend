import { ExecutionContext, NotFoundException, BadRequestException } from '@nestjs/common'
import { DependientePropietarioGuard } from './dependiente-propietario.guard'
import { FIRESTORE } from '../../database/firebase.provider'

// ─── Mock helpers ────────────────────────────────────────────────────────

function mockExecutionContext(request: Record<string, any>) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext
}

function mockFirestore(docResult: any, exists = true) {
  return {
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ exists, id: docResult?.id ?? 'dep-1', data: () => docResult }),
      }),
    }),
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('DependientePropietarioGuard', () => {
  let guard: DependientePropietarioGuard
  let db: any

  beforeEach(() => {
    db = mockFirestore({ id: 'dep-1', tutorId: 'tutor-1', nombreCompleto: 'María' })
    guard = new DependientePropietarioGuard(db as any)
  })

  it('should deny when there is no authenticated user', async () => {
    const ctx = mockExecutionContext({ body: { dependienteId: 'dep-1' } })
    const result = await guard.canActivate(ctx)
    expect(result).toBe(false)
  })

  it('should allow when no dependienteId is provided (action sobre el propio usuario)', async () => {
    const ctx = mockExecutionContext({ user: { id: 'tutor-1', rol: 'padre_tutor' }, body: {} })
    const result = await guard.canActivate(ctx)
    expect(result).toBe(true)
    expect(db.collection).not.toHaveBeenCalled()
  })

  it('should throw BadRequestException when dependienteId is present but not a string', async () => {
    const ctx = mockExecutionContext({ user: { id: 'tutor-1', rol: 'padre_tutor' }, body: { dependienteId: 123 } })
    await expect(guard.canActivate(ctx)).rejects.toThrow(BadRequestException)
    expect(db.collection).not.toHaveBeenCalled()
  })

  it('should allow when dependienteId comes in the body and belongs to the tutor', async () => {
    const ctx = mockExecutionContext({
      user: { id: 'tutor-1', rol: 'padre_tutor' },
      body: { dependienteId: 'dep-1' },
    })
    const result = await guard.canActivate(ctx)
    expect(result).toBe(true)
    expect(db.collection).toHaveBeenCalledWith('dependientes')
    expect(ctx.switchToHttp().getRequest().dependiente).toMatchObject({ id: 'dep-1', tutorId: 'tutor-1' })
  })

  it('should allow when dependienteId comes in the route params', async () => {
    const ctx = mockExecutionContext({
      user: { id: 'tutor-1', rol: 'padre_tutor' },
      params: { dependienteId: 'dep-1' },
      body: {},
    })
    const result = await guard.canActivate(ctx)
    expect(result).toBe(true)
  })

  it('should throw NotFoundException when the dependiente does not exist', async () => {
    db = mockFirestore(null, false)
    guard = new DependientePropietarioGuard(db as any)
    const ctx = mockExecutionContext({ user: { id: 'tutor-1', rol: 'padre_tutor' }, body: { dependienteId: 'ghost' } })
    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException)
  })

  it('should throw NotFoundException when the dependiente belongs to another tutor', async () => {
    db = mockFirestore({ id: 'dep-1', tutorId: 'other-tutor' })
    guard = new DependientePropietarioGuard(db as any)
    const ctx = mockExecutionContext({ user: { id: 'tutor-1', rol: 'padre_tutor' }, body: { dependienteId: 'dep-1' } })
    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException)
  })
})
