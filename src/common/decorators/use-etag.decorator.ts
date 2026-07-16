import { UseInterceptors } from '@nestjs/common'
import { ETagInterceptor } from '../interceptors/etag.interceptor'

export const UseETag = () => UseInterceptors(ETagInterceptor)
