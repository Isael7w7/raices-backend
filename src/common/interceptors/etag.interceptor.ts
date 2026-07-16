import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable, of, EMPTY } from 'rxjs'
import { switchMap } from 'rxjs/operators'
import { createHash } from 'crypto'
import { Response } from 'express'

@Injectable()
export class ETagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp()
    const req = ctx.getRequest()
    const res = ctx.getResponse<Response>()

    if (req.method.toUpperCase() !== 'GET') {
      return next.handle()
    }

    const ifNoneMatch = req.headers['if-none-match']

    return next.handle().pipe(
      switchMap((body) => {
        const json = JSON.stringify(body)
        const etag = `"${createHash('md5').update(json).digest('hex')}"`

        res.setHeader('ETag', etag)

        if (ifNoneMatch && ifNoneMatch === etag) {
          res.status(304)
          res.send()
          return EMPTY
        }

        return of(body)
      }),
    )
  }
}
