import { Test, TestingModule } from '@nestjs/testing'
import { ContactoService } from './contacto.service'
import { FIRESTORE } from '../../database/firebase.provider'

describe('ContactoService', () => {
  let service: ContactoService
  let collectionAdd: jest.Mock

  beforeEach(async () => {
    collectionAdd = jest.fn()

    const dbMock = {
      collection: jest.fn().mockReturnValue({ add: collectionAdd }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactoService,
        { provide: FIRESTORE, useValue: dbMock },
      ],
    }).compile()

    service = module.get<ContactoService>(ContactoService)
  })

  it('guarda el mensaje con los datos normalizados y devuelve id + estado', async () => {
    collectionAdd.mockResolvedValue({ id: 'msg-1' })

    const result = await service.guardarMensaje(
      {
        email: '  Ana.Perez@Correo.MX ',
        nombre: '  Ana Pérez  ',
        asunto: 'consulta',
        mensaje: '  Necesito orientación sobre escuelas inclusivas en mi ciudad.  ',
      },
      { ip: '189.203.45.67', userAgent: 'Mozilla/5.0' },
    )

    expect(result).toEqual({ id: 'msg-1', estado: 'pendiente' })

    const [payload] = collectionAdd.mock.calls[0]
    expect(payload.email).toBe('ana.perez@correo.mx')
    expect(payload.nombre).toBe('Ana Pérez')
    expect(payload.mensaje).toBe('Necesito orientación sobre escuelas inclusivas en mi ciudad.')
    expect(payload.asunto).toBe('consulta')
    expect(payload.origen).toBe('landing-contacto')
    expect(payload.estado).toBe('pendiente')
    expect(payload.aceptoContacto).toBe(false)
  })

  it('anonimiza la IP antes de persistir (no guarda la IP completa)', async () => {
    collectionAdd.mockResolvedValue({ id: 'msg-2' })

    await service.guardarMensaje(
      {
        email: 'a@b.com',
        nombre: 'Ana',
        asunto: 'soporte',
        mensaje: 'Mensaje con más de veinte caracteres para validar.',
      },
      { ip: '189.203.45.67' },
    )

    const [payload] = collectionAdd.mock.calls[0]
    expect(payload.ipAnonimizada).toBe('189.203.45.0')
    expect(JSON.stringify(payload)).not.toContain('189.203.45.67')
  })

  it('anonimiza IPv6 conservando solo el prefijo /64', async () => {
    collectionAdd.mockResolvedValue({ id: 'msg-3' })

    await service.guardarMensaje(
      {
        email: 'a@b.com',
        nombre: 'Ana',
        asunto: 'otro',
        mensaje: 'Mensaje con más de veinte caracteres para validar.',
      },
      { ip: '2001:0db8:85a3:0001:8a2e:0370:7334' },
    )

    const [payload] = collectionAdd.mock.calls[0]
    expect(payload.ipAnonimizada).toBe('2001:0db8:85a3:0001::')
  })

  it('marca aceptoContacto=true cuando llega true como string', async () => {
    collectionAdd.mockResolvedValue({ id: 'msg-4' })

    await service.guardarMensaje(
      {
        email: 'a@b.com',
        nombre: 'Ana',
        asunto: 'consulta',
        mensaje: 'Mensaje con más de veinte caracteres para validar.',
        aceptoContacto: 'true' as unknown as boolean,
      },
      { ip: '1.2.3.4' },
    )

    const [payload] = collectionAdd.mock.calls[0]
    expect(payload.aceptoContacto).toBe(true)
  })

  it('trunca el userAgent a 200 caracteres', async () => {
    collectionAdd.mockResolvedValue({ id: 'msg-5' })

    await service.guardarMensaje(
      {
        email: 'a@b.com',
        nombre: 'Ana',
        asunto: 'consulta',
        mensaje: 'Mensaje con más de veinte caracteres para validar.',
      },
      { ip: '1.2.3.4', userAgent: 'x'.repeat(500) },
    )

    const [payload] = collectionAdd.mock.calls[0]
    expect(payload.userAgent.length).toBe(200)
  })

  it('re-lanza el error cuando Firestore falla (para alertas 5xx)', async () => {
    collectionAdd.mockRejectedValue(new Error('Firestore unavailable'))

    await expect(
      service.guardarMensaje(
        {
          email: 'a@b.com',
          nombre: 'Ana',
          asunto: 'consulta',
          mensaje: 'Mensaje con más de veinte caracteres para validar.',
        },
        { ip: '1.2.3.4' },
      ),
    ).rejects.toThrow('Firestore unavailable')
  })
})
