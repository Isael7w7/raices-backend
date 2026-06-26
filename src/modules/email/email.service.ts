import { Injectable, Logger } from '@nestjs/common'

@Injectable()
export class EmailService {
  private readonly logger = new Logger('EmailService')
  private readonly hasResend = !!process.env.RESEND_API_KEY

  async sendWelcome(to: string, name: string) {
    if (this.hasResend) {
      // TODO: implementar con Resend en producción
    }
    this.logger.log(`[MOCK EMAIL] Bienvenido a Raíces → ${to} (${name})`)
  }

  async sendInstitutionApproved(to: string, institutionName: string) {
    if (this.hasResend) {
      // TODO: implementar con Resend en producción
    }
    this.logger.log(`[MOCK EMAIL] Institución aprobada: ${institutionName} → ${to}`)
  }
}
