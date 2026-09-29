import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import type { Request, Response } from 'express'

/**
 * Severidades alineadas con Cloud Logging (GCP). Cloud Run escribe stdout en
 * Cloud Logging; cuando la línea es un JSON con el campo `severity`, Logging lo
 * usa como severidad del registro (no como un campo más del payload). Así se
 * pueden crear métricas basadas en logs con filtros `severity>=ERROR`.
 */
export type SeveridadRegistro = 'ERROR' | 'WARNING' | 'INFO'

/** Payload mínimo que exige la métrica `critical_errors_counter`. */
export interface RegistroError {
  severity: SeveridadRegistro
  message: string
  /** Código HTTP de la respuesta (5xx para errores críticos). Ausente en errores de proceso. */
  statusCode?: number
  path: string
  method: string
  /** Stack solo se llena en errores críticos (5xx); vacío en el resto. */
  stack: string
  /** Solo se emite si hay sesión autenticada. */
  userId?: string
  /** Origen del registro (filtro o manejador de proceso). */
  context?: string
}

/**
 * Emite un log estructurado (exactamente una línea JSON) en stdout.
 *
 * Ventajas sobre Logger de Nest:
 *  - Cloud Logging extrae `severity` → filtros `severity>=ERROR` y alertas.
 *  - El resto de campos (`statusCode`, `path`, ...) quedan en jsonPayload,
 *    habilitando métricas basadas en logs como `critical_errors_counter`.
 */
export function emitirLogEstructurado(registro: RegistroError): void {
  // timestamp primero para que el orden del JSON sea estable y legible.
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...registro }))
}

/** Extrae un mensaje legible de cualquier excepción/razón. */
function mensajeDe(valor: unknown): string {
  if (valor instanceof HttpException) {
    const respuesta = valor.getResponse()
    if (typeof respuesta === 'string') return respuesta
    if (typeof respuesta === 'object' && respuesta !== null) {
      const mensaje = (respuesta as { message?: unknown }).message
      if (Array.isArray(mensaje)) return mensaje.join(', ')
      if (typeof mensaje === 'string' && mensaje.length > 0) return mensaje
    }
    return valor.message
  }
  if (valor instanceof Error) return valor.message
  if (typeof valor === 'string') return valor
  try {
    return JSON.stringify(valor) ?? String(valor)
  } catch {
    return String(valor)
  }
}

/**
 * Filtro global de excepciones (reemplaza al por defecto de Nest).
 *
 * 1. Escribe un log JSON estructurado con severidad:
 *      - ERROR   → respuestas 5xx (fallos de DB, servicios externos, no capturadas)
 *      - WARNING → respuestas 4xx (clientes)
 * 2. Responde con el status y el cuerpo de la excepción. Los errores no
 *    controlados (500) NUNCA exponen el mensaje/stack interno al cliente.
 *
 * La métrica `critical_errors_counter` (ver infra/) cuenta los registros con
 * `severity>=ERROR AND jsonPayload.statusCode>=500`.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const request = http.getRequest<Request & { user?: { id?: string } }>()
    const response = http.getResponse<Response>()

    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    const esCritico = statusCode >= 500
    const userId = request.user?.id

    emitirLogEstructurado({
      severity: esCritico ? 'ERROR' : 'WARNING',
      message: mensajeDe(exception),
      statusCode,
      path: request.originalUrl || request.url || '-',
      method: request.method || '-',
      stack: esCritico && exception instanceof Error ? exception.stack ?? '' : '',
      ...(userId ? { userId } : {}),
      context: GlobalExceptionFilter.name,
    })

    // Red: si ya se empezó a responder (p. ej. error en streaming), no se
    // intenta escribir de nuevo — Express lanzaría "Cannot set headers".
    if (response.headersSent) return

    response.status(statusCode).json(this.cuerpoRespuesta(exception, statusCode))
  }

  /** Cuerpo de respuesta seguro: jamás filtra stack ni mensajes internos. */
  private cuerpoRespuesta(exception: unknown, statusCode: number): Record<string, unknown> {
    if (exception instanceof HttpException) {
      const respuesta = exception.getResponse()
      if (typeof respuesta === 'string') return { statusCode, message: respuesta }
      if (typeof respuesta === 'object' && respuesta !== null) {
        return { statusCode, ...(respuesta as Record<string, unknown>) }
      }
      return { statusCode, message: String(respuesta) }
    }
    return { statusCode, message: 'Error interno del servidor' }
  }
}

/**
 * Registra manejadores para excepciones que nunca llegan al filtro HTTP
 * (promesas rechazadas, errores de proceso). Se instalan en main.ts.
 *
 * Nota: estos registros llevan `severity=ERROR` pero no `statusCode`, así que
 * NO cuentan en `critical_errors_counter`; se consultan en Logs Explorer con
 * `severity>=ERROR`.
 */
export function instalarManejadoresDeErroresNoCapturados(): void {
  process.on('unhandledRejection', (razon: unknown) => {
    emitirLogEstructurado({
      severity: 'ERROR',
      message: `Promesa rechazada sin manejar: ${mensajeDe(razon)}`,
      path: '-',
      method: '-',
      stack: razon instanceof Error ? stackDe(razon) : '',
      context: 'process.unhandledRejection',
    })
  })

  process.on('uncaughtException', (error: Error) => {
    emitirLogEstructurado({
      severity: 'ERROR',
      message: `Excepción no capturada: ${mensajeDe(error)}`,
      path: '-',
      method: '-',
      stack: stackDe(error),
      context: 'process.uncaughtException',
    })
    // Node recomienda terminar tras uncaughtException: el estado del proceso
    // es impredecible. Cloud Run reinicia la instancia automáticamente.
    process.exit(1)
  })
}

function stackDe(error: Error): string {
  return error.stack ?? ''
}
