import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common'
import { NotFoundException } from '@nestjs/common'
import { Request, Response } from 'express'
import { join } from 'path'

@Catch(NotFoundException)
export class SpaFallbackFilter implements ExceptionFilter {
  catch(exception: NotFoundException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const req = ctx.getRequest<Request>()
    const res = ctx.getResponse<Response>()

    const isRouteNotFound = /^Cannot (GET|POST|PUT|DELETE|PATCH) \//.test(exception.message)
    const isApiPath = req.url.startsWith('/api') || req.url.startsWith('/uploads')

    if (process.env.NODE_ENV === 'production' && isRouteNotFound && !isApiPath) {
      res.sendFile(join(process.cwd(), 'public', 'index.html'))
    } else {
      res.status(exception.getStatus()).json(exception.getResponse())
    }
  }
}
