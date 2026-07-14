import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { join } from 'path'
import { AppModule } from './app.module'
import { SpaFallbackFilter } from './spa-fallback.filter'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  const allowedOrigins = [
    // Swagger UI (mismo servidor)
    'http://localhost:7000',
    'https://localhost:7000',
    // Frontend dev server (Vite)
    'http://localhost:3000',
    'http://localhost:5173',
    // Producción (si está definida)
    ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : []),
  ]

  app.enableCors({
    origin: (origin, callback) => {
      // Permitir peticiones sin origen (curl, Postman, server-to-server)
      if (!origin) return callback(null, true)
      // Permitir orígenes en la lista
      if (allowedOrigins.includes(origin)) return callback(null, true)
      // Permitir cualquier dominio Cloud Run (*.run.app) para Swagger UI en producción
      // .run.app es un dominio exclusivo de GCP Cloud Run, seguro de permitir
      if (origin && /^https?:\/\/.+\.run\.app$/.test(origin)) {
        return callback(null, true)
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`))
    },
    credentials: true,
    exposedHeaders: ['Content-Type'],
  })

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.setGlobalPrefix('api')

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Raíces para Florecer API')
    .setDescription(
      'API del ecosistema digital para personas con discapacidad en México.\n\n' +
      '## Autenticación\n' +
      'Todos los endpoints protegidos requieren un token JWT en el header `Authorization: Bearer <token>`.\n\n' +
      '## Roles\n' +
      '- **pcd**: Persona con discapacidad\n' +
      '- **tutor**: Tutor o cuidador\n' +
      '- **institution**: Institución proveedora\n' +
      '- **admin**: Administrador de la plataforma'
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Ingresa tu token JWT',
      },
      'jwt-auth',
    )
    .addTag('Auth', 'Autenticación y registro de usuarios')
    .addTag('Users', 'Gestión de perfil y dependientes')
    .addTag('Institutions', 'Directorio de instituciones')
    .addTag('Discovery', 'Búsqueda inteligente de instituciones')
    .addTag('Favorites', 'Instituciones guardadas por usuario')
    .addTag('Reviews', 'Reseñas y calificaciones')
    .addTag('Community', 'Grupos, posts y comentarios')
    .addTag('Notifications', 'Notificaciones in-app')
    .addTag('Admin', 'Panel administrativo')
    .addTag('AI', 'Chat y recomendaciones con IA')
    .addTag('Jobs', 'Bolsa de trabajo inclusiva')
    .addTag('Messages', 'Mensajería directa entre usuarios')
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
    },
  })

  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' })

  if (process.env.NODE_ENV === 'production') {
    app.useStaticAssets(join(process.cwd(), 'public'))
    app.useGlobalFilters(new SpaFallbackFilter())
  }

  const port = process.env.PORT ?? 7000
  await app.listen(port)
  console.log(`Raíces API running on http://localhost:${port}`)
  console.log(`Swagger docs: http://localhost:${port}/docs`)
}

bootstrap()
