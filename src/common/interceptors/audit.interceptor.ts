import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common'
import { Observable, throwError } from 'rxjs'
import { tap, catchError } from 'rxjs/operators'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'
import { AuditService } from '../audit/audit.service'
import { AUDIT_KEY, AuditConfig } from '../decorators/audit.decorator'
import { AUDIT_ACCIONES } from '../interfaces/audit-log.interface'
import { CurrentUserPayload } from '../interfaces/current-user.interface'

/**
 * Interceptor de auditoría — captura la ejecución de handlers marcados
 * con @Audit() y registra la acción en Firestore.
 *
 * Flujo:
 * 1. Lee la configuración de @Audit() del metadata
 * 2. Ejecuta el handler normalmente
 * 3. Si tiene éxito → registra con resultado='exito'
 * 4. Si lanza error → registra con resultado='error'
 *
 * La auditoría NUNCA bloquea la operación original.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AuditInterceptor')

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const config = this.reflector.getAllAndOverride<AuditConfig>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!config) {
      return next.handle()
    }

    const req = context.switchToHttp().getRequest()
    const user = (req as any).user as CurrentUserPayload | undefined
    const args = context.getArgs()

    // Extraer metadatos de la petición
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.ip
      ?? 'unknown'
    const userAgent = req.headers['user-agent'] ?? 'unknown'

    // Determinar recurso ID de los argumentos del handler
    const recursoId = config.obtenerRecursoId
      ? config.obtenerRecursoId(...args)
      : undefined

    return next.handle().pipe(
      tap((resultado) => {
        // Registrar éxito (async, fire-and-forget)
        this.auditService.registrar({
          usuarioId: user?.id ?? 'anonymous',
          usuarioEmail: user?.email,
          usuarioRol: user?.rol,
          accion: config.accion,
          descripcion: `Acción ejecutada: ${config.accion}`,
          recurso: config.recurso,
          recursoId,
          recursoNombre: config.obtenerRecursoNombre?.(resultado),
          resultado: 'exito',
          metadatos: config.extraerMetadatos?.(resultado),
          ip,
          userAgent,
        }).catch(() => {}) // Fire-and-forget
      }),
      catchError((error) => {
        // Registrar error (async, fire-and-forget)
        this.auditService.registrar({
          usuarioId: user?.id ?? 'anonymous',
          usuarioEmail: user?.email,
          usuarioRol: user?.rol,
          accion: config.accion,
          descripcion: `Error en ${config.accion}: ${error.message ?? 'Error desconocido'}`,
          recurso: config.recurso,
          recursoId,
          resultado: 'error',
          metadatos: { error: error.message, stack: error.stack },
          ip,
          userAgent,
        }).catch(() => {}) // Fire-and-forget

        return throwError(() => error)
      }),
    )
  }
}
