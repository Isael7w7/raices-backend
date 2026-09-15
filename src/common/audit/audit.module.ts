import { Module, Global } from '@nestjs/common'
import { AuditService } from './audit.service'
import { AuditInterceptor } from '../interceptors/audit.interceptor'

/**
 * Módulo de auditoría global — expone AuditService y AuditInterceptor
 * para que cualquier módulo pueda registrar acciones de trazabilidad.
 *
 * @example
 * ```ts
 * @Module({
 *   imports: [AuditModule],
 *   controllers: [AdminController],
 *   providers: [AdminService],
 * })
 * export class AdminModule {}
 * ```
 */
@Global()
@Module({
  providers: [AuditService, AuditInterceptor],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
