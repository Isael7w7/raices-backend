import { InternalServerErrorException } from '@nestjs/common'
import { SimularErrorController } from './simular-error.controller'

describe('SimularErrorController', () => {
  it('should throw an InternalServerErrorException to trigger the GCP alert', () => {
    const controller = new SimularErrorController()

    expect(() => controller.simularError500()).toThrow(InternalServerErrorException)
    expect(() => controller.simularError500()).toThrow(/Simulación controlada de error 500/)
  })
})
