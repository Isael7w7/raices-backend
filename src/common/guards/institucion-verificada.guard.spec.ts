import { Test, TestingModule } from '@nestjs/testing'
import { ExecutionContext, ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { InstitucionVerificadaGuard } from './institucion-verificada.guard'
import { FIRESTORE } from '../../database/firebase.provider'
import { MENSAJE_CSF_REQUERIDO } from '../utils/verificacion-persona-moral'

describe('InstitucionVerificadaGuard', () => {
  let guard: InstitucionVerificadaGuard
  let firestoreMock: Record<string, any>

  /** Construye un ExecutionContext mínimo con el usuario autenticado. */
  function ctx(user: any): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext
  }

  /**
   * Simula la colección `instituciones`:
   * - `canonica` = documento con id = uid (creado en el registro)
   * - `porCreador` = documento con id aleatorio (POST /instituciones)
   */
  function mockearInstituciones(opts: { canonica?: any; porCreador?: any; falla?: boolean } = {}) {
    const docGet = jest.fn().mockResolvedValue({ exists: !!opts.canonica, data: () => opts.canonica })
    const porCreadorGet = jest.fn().mockResolvedValue({
      empty: !opts.porCreador,
      docs: opts.porCreador ? [{ id: 'inst-legacy', data: () => opts.porCreador }] : [],
    })

    const collection = {
      doc: jest.fn().mockReturnValue({ get: docGet }),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: porCreadorGet,
    }
    if (opts.falla) {
      collection.doc.mockReturnValue({ get: jest.fn().mockRejectedValue(new Error('Firestore inaccesible')) })
    }
    firestoreMock.collection.mockReturnValue(collection)
    return { docGet, porCreadorGet }
  }

  const empresa = { id: 'emp-1', rol: 'empresa', verificado: false }
  const institucion = { id: 'inst-1', rol: 'institucion', verificado: false }
  const admin = { id: 'adm-1', rol: 'admin', verificado: false }

  beforeEach(async () => {
    firestoreMock = { collection: jest.fn() }
    const module: TestingModule = await Test.createTestingModule({
      providers: [InstitucionVerificadaGuard, { provide: FIRESTORE, useValue: firestoreMock }],
    }).compile()
    guard = module.get<InstitucionVerificadaGuard>(InstitucionVerificadaGuard)
  })

  // ── Casos que deben pasar ─────────────────────────────────────────

  it('permite publicar cuando la entidad tiene CSF cargada y NO está aprobada', async () => {
    mockearInstituciones({ canonica: { activa: true, verificada: false, documentoCsf: 'https://storage/csf.pdf' } })

    await expect(guard.canActivate(ctx(empresa))).resolves.toBe(true)
  })

  it('permite publicar cuando la entidad fue aprobada por un administrador (sin CSF)', async () => {
    mockearInstituciones({ canonica: { activa: true, verificada: true } })

    await expect(guard.canActivate(ctx(institucion))).resolves.toBe(true)
  })

  it('EMPRESA e INSTITUCION reciben el mismo trato: CSF cargada basta para publicar', async () => {
    const entidad = { activa: true, verificada: false, documentoCsf: 'https://storage/csf.pdf' }

    mockearInstituciones({ canonica: entidad })
    await expect(guard.canActivate(ctx(empresa))).resolves.toBe(true)

    mockearInstituciones({ canonica: entidad })
    await expect(guard.canActivate(ctx(institucion))).resolves.toBe(true)

    // Y sin CSF, ambos quedan bloqueados con el mismo mensaje
    mockearInstituciones({ canonica: { activa: true, verificada: false } })
    for (const usuario of [empresa, institucion]) {
      await expect(guard.canActivate(ctx(usuario))).rejects.toThrow(MENSAJE_CSF_REQUERIDO)
    }
  })

  it('admin siempre pasa sin consultar Firestore', async () => {
    firestoreMock.collection.mockImplementation(() => {
      throw new Error('no debe consultar')
    })

    await expect(guard.canActivate(ctx(admin))).resolves.toBe(true)
  })

  it('los roles que no son persona moral no se ven afectados y no leen Firestore', async () => {
    firestoreMock.collection.mockImplementation(() => {
      throw new Error('no debe consultar')
    })

    for (const rol of ['pcd', 'padre_tutor', 'especialista']) {
      await expect(guard.canActivate(ctx({ id: 'x', rol, verificado: false }))).resolves.toBe(true)
    }
  })

  it('sin usuario deja pasar (el JwtAuthGuard ya responde 401)', async () => {
    await expect(guard.canActivate(ctx(undefined))).resolves.toBe(true)
  })

  it('resuelve la entidad creada vía POST /instituciones (id aleatorio, por creadoPor)', async () => {
    const lecturas = mockearInstituciones({ porCreador: { activa: true, verificada: false, documentoCsf: 'https://csf' } })

    await expect(guard.canActivate(ctx(empresa))).resolves.toBe(true)
    expect(lecturas.porCreadorGet).toHaveBeenCalledTimes(1)
  })

  // ── Casos que deben bloquear ──────────────────────────────────────

  it('bloquea con el mensaje de CSF cuando no hay CSF ni aprobación', async () => {
    mockearInstituciones({ canonica: { activa: true, verificada: false, documentoCsf: null } })

    await expect(guard.canActivate(ctx(empresa))).rejects.toThrow(ForbiddenException)
    await expect(guard.canActivate(ctx(empresa))).rejects.toThrow(MENSAJE_CSF_REQUERIDO)
  })

  it('NUNCA menciona CURP ni identificación oficial en el rechazo', async () => {
    mockearInstituciones({ canonica: { activa: true, verificada: false } })

    const error = await guard.canActivate(ctx(empresa)).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ForbiddenException)
    const mensaje = (error as ForbiddenException).message
    expect(mensaje).not.toMatch(/CURP/i)
    expect(mensaje).not.toMatch(/identificación/i)
    expect(mensaje).not.toMatch(/identificacion/i)
    expect(mensaje).toContain('Constancia de Situación Fiscal')
  })

  it('deja pasar cuando la entidad aún no existe (camino de registro: no hay CSF que exigir)', async () => {
    mockearInstituciones({})

    await expect(guard.canActivate(ctx(empresa))).resolves.toBe(true)
  })

  it('trata un documentoCsf vacío o solo con espacios como CSF ausente', async () => {
    mockearInstituciones({ canonica: { activa: true, verificada: false, documentoCsf: '   ' } })

    await expect(guard.canActivate(ctx(empresa))).rejects.toThrow(MENSAJE_CSF_REQUERIDO)
  })

  // ── Fallos de infraestructura ─────────────────────────────────────

  it('si Firestore falla responde 503 (no un 403 que accuses CSF falsamente)', async () => {
    mockearInstituciones({ falla: true })

    const error = await guard.canActivate(ctx(empresa)).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ServiceUnavailableException)
    expect((error as ServiceUnavailableException).message).not.toContain('CURP')
  })
})