import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class EmailService {
  private readonly logger = new Logger('EmailService')
  private readonly hasResend: boolean

  // SECURITY: la API key se lee dinámicamente de ConfigService (montada como
  // secreto desde GCP Secret Manager en Cloud Run). Nunca hay fallback a
  // cadenas de texto locales ni claves hardcodeadas.
  constructor(private readonly config: ConfigService) {
    this.hasResend = !!this.config.get<string>('RESEND_API_KEY')
    if (!this.hasResend) {
      this.logger.warn('RESEND_API_KEY no configurada — se usará el modo mock de correo')
    }
  }

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

  // ═══════════════════════════════════════════════════════════════════
  // Documentos de identidad (Validación diferida)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Envía correo cuando un documento de identidad es aprobado.
   */
  async sendIdentityApproved(to: string, userName: string) {
    if (this.hasResend) {
      // TODO: implementar con Resend en producción
    }
    this.logger.log(`[MOCK EMAIL] Documento de identidad aprobado → ${to} (${userName})`)
  }

  /**
   * Envía correo cuando un documento de identidad es rechazado.
   */
  async sendIdentityRejected(to: string, userName: string, motivo: string) {
    if (this.hasResend) {
      // TODO: implementar con Resend en producción
    }
    this.logger.log(`[MOCK EMAIL] Documento de identidad rechazado → ${to} (${userName}). Motivo: ${motivo}`)
  }

  /**
   * Envía correo cuando todos los documentos de identidad son aprobados (validación completa).
   */
  async sendIdentityFullyApproved(to: string, userName: string) {
    if (this.hasResend) {
      // TODO: implementar con Resend en producción
    }
    this.logger.log(`[MOCK EMAIL] Validación de identidad completa → ${to} (${userName})`)
  }
}
