import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { join } from "path";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { obtenerOrigenesPermitidos } from "./common/utils/cors-origins";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const allowedOrigins = obtenerOrigenesPermitidos({
    get: (key) => process.env[key],
  });

  app.enableCors({
    origin: (origin, callback) => {
      // Permitir peticiones sin origen (curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    // credentials: true permite que el navegador envíe las cookies httpOnly de
    // sesión (token_acceso, token_refresco) en requests cross-origin.
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    // Cabeceras de petición permitidas. Incluye las cabeceras de caché
    // condicional (If-None-Match / If-Match) y X-Requested-With para que el
    // preflight CORS del frontend no sea bloqueado al enviar If-None-Match.
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Cookie",
      "ETag",
      "If-None-Match",
      "If-Match",
      "X-Requested-With",
    ],
    exposedHeaders: ["Content-Type", "ETag"],
  });

  // Security headers via Helmet
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
  }));
  app.setGlobalPrefix("api");

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle("Raíces para Florecer API")
    .setDescription(
      "API del ecosistema digital para personas con discapacidad en México.\n\n" +
        "## Autenticación\n" +
        "Todos los endpoints protegidos requieren un token JWT en el header `Authorization: Bearer <token>`.\n\n" +
        "## Roles\n" +
        "- **pcd**: Persona con discapacidad\n" +
        "- **tutor**: Tutor o cuidador\n" +
        "- **institucion**: Institución proveedora (escuelas, centros terapéuticos)\n" +
        "- **institucional**: Usuario Institucional (gobiernos, ONGs, fundaciones, donantes)\n" +
        "- **admin**: Administrador de la plataforma",
    )
    .setVersion("1.0.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Ingresa tu token JWT",
      },
      "jwt-auth",
    )
    .addTag("Autenticación", "Autenticación y registro de usuarios")
    .addTag("Usuarios", "Gestión de perfil y dependientes")
    .addTag("Instituciones", "Directorio de instituciones")
    .addTag("Descubrimiento", "Búsqueda inteligente de instituciones")
    .addTag("Favoritos", "Instituciones guardadas por usuario")
    .addTag("Reseñas", "Reseñas y calificaciones")
    .addTag("Comunidad", "Grupos, posts y comentarios")
    .addTag("Notificaciones", "Notificaciones in-app")
    .addTag("Administración", "Panel administrativo")
    .addTag("Inteligencia Artificial", "Chat y recomendaciones con IA")
    .addTag("Empleo", "Bolsa de trabajo inclusiva")
    .addTag("Catálogos", "Catálogos de referencia (parentescos, discapacidades, etc.)")
    .addTag("Mensajes", "Mensajería directa entre usuarios")
    .addTag("Rutas de Desarrollo", "Rutas y caminos de desarrollo personalizados")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: "none",
      filter: true,
      showRequestDuration: true,
    },
  });

  app.useStaticAssets(join(process.cwd(), "uploads"), { prefix: "/uploads" });

  const port = process.env.PORT ?? 7000;
  await app.listen(port);
  console.log(`Raíces API running on http://localhost:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/docs`);
}

bootstrap();
