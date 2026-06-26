import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import { join } from 'path'
import { AppModule } from './app.module'
import { SpaFallbackFilter } from './spa-fallback.filter'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  app.enableCors({
    origin: true,
    credentials: true,
    exposedHeaders: ['Content-Type'],
  })

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.setGlobalPrefix('api')

  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' })

  if (process.env.NODE_ENV === 'production') {
    app.useStaticAssets(join(process.cwd(), 'public'))
    app.useGlobalFilters(new SpaFallbackFilter())
  }

  const port = process.env.PORT ?? 7000
  await app.listen(port)
  console.log(`Raíces API running on http://localhost:${port}`)
}

bootstrap()
