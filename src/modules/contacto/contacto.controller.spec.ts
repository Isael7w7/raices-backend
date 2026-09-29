import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import request from 'supertest'
import { ContactoController } from './contacto.controller'
import { ContactoService } from './contacto.service'

describe('ContactoController', () => {
  let app: INestApplication
  let guardarMensaje: jest.Mock

  beforeEach(async () => {
    guardarMensaje = jest.fn().mockResolvedValue({ id: 'msg-1', estado: 'pendiente' })

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactoController],
      providers: [{ provide: ContactoService, useValue: { guardarMensaje } }],
    }).compile()

    app = module.createNestApplication()
    // Mismo pipe global que main.ts para validar el DTO en los tests
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()
  })

  afterEach(async () => {
    await app.close()
  })

  const payloadValido = {
    email: 'ana.perez@correo.mx',
    nombre: 'Ana Pérez',
    asunto: 'consulta',
    mensaje: 'Necesito orientación sobre escuelas inclusivas en mi ciudad.',
  }

  it('POST /contacto con payload válido → 201 y guarda el mensaje', async () => {
    const res = await request(app.getHttpServer())
      .post('/contacto')
      .send(payloadValido)
      .expect(201)

    expect(res.body).toEqual({ id: 'msg-1', estado: 'pendiente' })
    expect(guardarMensaje).toHaveBeenCalledTimes(1)
  })

  it('rechaza email con espacios alrededor (el cliente debe enviarlo normalizado) y pasa meta sin userAgent', async () => {
    await request(app.getHttpServer())
      .post('/contacto')
      .send({ ...payloadValido, email: '  Ana.Perez@Correo.MX ' })
      .expect(400)
    expect(guardarMensaje).not.toHaveBeenCalled()

    // Llamada limpia: el controller pasa { ip, userAgent } desde la request
    await request(app.getHttpServer())
      .post('/contacto')
      .send(payloadValido)
      .expect(201)
    const [, meta] = guardarMensaje.mock.calls[0]
    expect(meta.userAgent).toBeUndefined()
  })

  it('email inválido → 400 sin llamar al servicio', async () => {
    await request(app.getHttpServer())
      .post('/contacto')
      .send({ ...payloadValido, email: 'no-es-un-email' })
      .expect(400)

    expect(guardarMensaje).not.toHaveBeenCalled()
  })

  it('mensaje demasiado corto → 400', async () => {
    await request(app.getHttpServer())
      .post('/contacto')
      .send({ ...payloadValido, mensaje: 'corto' })
      .expect(400)

    expect(guardarMensaje).not.toHaveBeenCalled()
  })

  it('nombre demasiado corto → 400', async () => {
    await request(app.getHttpServer())
      .post('/contacto')
      .send({ ...payloadValido, nombre: 'A' })
      .expect(400)

    expect(guardarMensaje).not.toHaveBeenCalled()
  })

  it('asunto fuera del catálogo → 400', async () => {
    await request(app.getHttpServer())
      .post('/contacto')
      .send({ ...payloadValido, asunto: 'spam' })
      .expect(400)

    expect(guardarMensaje).not.toHaveBeenCalled()
  })

  it('propiedades desconocidas se descartan (whitelist) y no llegan al payload', async () => {
    await request(app.getHttpServer())
      .post('/contacto')
      .send({ ...payloadValido, rol: 'admin', isAdmin: true })
      .expect(201)

    const dto = guardarMensaje.mock.calls[0][0]
    expect(dto.rol).toBeUndefined()
    expect(dto.isAdmin).toBeUndefined()
  })

  it('propaga el error 500 cuando el servicio falla', async () => {
    guardarMensaje.mockRejectedValue(new Error('Firestore unavailable'))

    await request(app.getHttpServer())
      .post('/contacto')
      .send(payloadValido)
      .expect(500)
  })
})
