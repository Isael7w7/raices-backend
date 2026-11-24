import type { NextFunction, Request, Response } from 'express'

/**
 * Orígenes desde los que se sirven los documentos (PDF/CV, imágenes) que el
 * frontend incrusta en una vista previa (`<iframe>` / `<embed>`).
 */
const ORIGENES_DOCUMENTOS = ["'self'", 'blob:', 'https://firebasestorage.googleapis.com', 'https://storage.googleapis.com']

/**
 * Directivas que solo restringen el embebido de contenido y el acceso a
 * atributos inline de scripts. Se omite `default-src` (y por tanto no hay
 * `script-src`/`frame-src` global) para no romper Swagger UI en `/docs`, que
 * carga scripts desde CDN.
 *
 * `script-src-attr 'unsafe-inline'` evita que el navegador bloquee handlers
 * inline usados por la vista previa de PDF.
 */
const CSP = [
  `frame-src ${ORIGENES_DOCUMENTOS.join(' ')}`,
  `object-src ${ORIGENES_DOCUMENTOS.join(' ')}`,
  "script-src-attr 'unsafe-inline'",
].join('; ')

/**
 * Cabeceras de seguridad de las respuestas del backend.
 *
 * Contexto del fix "ERR_BLOCKED_BY_CSP" en la vista previa de documentos:
 * el backend no debe emitir nunca una cabecera que impida incrustar/mostrar
 * los PDF que él mismo sirve (`/uploads`), por lo que:
 *  - NO se envía `X-Frame-Options` (bloquearía el `<iframe>` cross-origin),
 *  - NO se envía `frame-ancestors` restrictivo,
 *  - `Cross-Origin-Resource-Policy: cross-origin` permite que el frontend
 *    cargue los archivos servidos por la API en un marco o en un `<canvas>`.
 *
 * Si la vista previa sigue bloqueada, la CSP que la corta es la del documento
 * embebidor (frontend/hosting): allí debe incluir `blob:` y los orígenes de
 * Firebase Storage / Google Cloud Storage en `frame-src` y `object-src`.
 */
export function seguridadHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Content-Security-Policy', CSP)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  next()
}
