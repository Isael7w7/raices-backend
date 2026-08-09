import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable, of, EMPTY } from 'rxjs'
import { switchMap } from 'rxjs/operators'
import { createHash } from 'crypto'
import { Response } from 'express'

interface EntradaCache {
  etag: string
  expiraEn: number
}

/**
 * TTL de la caché en memoria (ms). Configurable vía ETAG_CACHE_TTL_MS.
 * TTL corto = datos casi siempre frescos con un ahorro real de Firestore
 * cuando el cliente reenvía If-None-Match.
 */
const CACHE_TTL_MS = Number(process.env.ETAG_CACHE_TTL_MS) || 30000
const MAX_ENTRADAS_CACHE = 500

/**
 * Interceptor de ETag con caché en memoria:
 *
 * 1. Si el cliente envía If-None-Match y el ETag coincide con la caché
 *    vigente, responde 304 SIN ejecutar el handler (evita consultas a
 *    Firestore para respuestas sin cambios).
 * 2. Si no hay caché o expiró, ejecuta el handler, calcula el ETag,
 *    lo guarda en caché (clave = método + URL + userId) y compara
 *    If-None-Match contra el ETag recién calculado.
 *
 * Solo aplica a peticiones GET.
 */
@Injectable()
export class ETagInterceptor implements NestInterceptor {
  // Caché compartida entre instancias del interceptor
  private static readonly cache = new Map<string, EntradaCache>()

  /** Usado por los tests para limpiar la caché entre casos. */
  static clearCache(): void {
    ETagInterceptor.cache.clear()
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp()
    const req = ctx.getRequest()
    const res = ctx.getResponse<Response>()

    if (req.method.toUpperCase() !== 'GET') {
      return next.handle()
    }

    const key = this.buildKey(req)
    const ifNoneMatch = req.headers['if-none-match']
    const cacheado = ETagInterceptor.cache.get(key)

    // 304 ANTICIPADO: no ejecuta el handler → ahorro real de Firestore
    if (
      ifNoneMatch &&
      cacheado &&
      cacheado.etag === ifNoneMatch &&
      Date.now() < cacheado.expiraEn
    ) {
      // RFC 7232: un 304 DEBE incluir el ETag para permitir revalidación
      res.setHeader('ETag', cacheado.etag)
      res.status(304)
      res.send()
      return EMPTY
    }

    return next.handle().pipe(
      switchMap((body) => {
        // JSON.stringify(undefined) devuelve undefined y crypto.update(undefined)
        // lanzaría TypeError. null sí es serializable ("null").
        if (body === undefined) {
          return of(body)
        }

        const json = JSON.stringify(body)
        const etag = `"${createHash('md5').update(json).digest('hex')}"`

        res.setHeader('ETag', etag)

        // Solo cachea respuestas 200 OK; evita cachear errores
        if (res.statusCode < 400) {
          ETagInterceptor.set(key, { etag, expiraEn: Date.now() + CACHE_TTL_MS })
        }

        if (ifNoneMatch && ifNoneMatch === etag) {
          res.status(304)
          res.send()
          return EMPTY
        }

        return of(body)
      }),
    )
  }

  /**
   * Clave de caché: método + URL (con query) + userId.
   * Incluir userId evita servir datos personales de un usuario a otro.
   */
  private buildKey(req: any): string {
    const userId = req.user?.id ?? 'anon'
    return `${req.method}:${req.originalUrl ?? req.url ?? '/'}:${userId}`
  }

  private static set(key: string, entrada: EntradaCache): void {
    ETagInterceptor.cache.set(key, entrada)
    // Control de crecimiento: elimina expiradas y, si sigue sobre el tope,
    // elimina las más antiguas (el Map preserva el orden de inserción).
    if (ETagInterceptor.cache.size > MAX_ENTRADAS_CACHE) {
      const ahora = Date.now()
      for (const [k, v] of ETagInterceptor.cache) {
        if (v.expiraEn < ahora) ETagInterceptor.cache.delete(k)
      }
      while (ETagInterceptor.cache.size > MAX_ENTRADAS_CACHE) {
        const masAntigua = ETagInterceptor.cache.keys().next().value
        if (masAntigua === undefined) break
        ETagInterceptor.cache.delete(masAntigua)
      }
    }
  }
}
