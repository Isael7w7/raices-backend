/**
 * Script para generar la documentación Swagger/OpenAPI del backend Raíces.
 *
 * Uso: npx ts-node scripts/generate-swagger.ts
 *
 * Genera: docs/swagger.json
 */
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import * as fs from 'fs';
import * as path from 'path';

async function generateSwagger() {
  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('Raíces para Florecer API')
    .setDescription(
      'API del ecosistema digital inteligente para Personas con Discapacidad (PCD) y Cuidadores en México.\n\n' +
      '## Autenticación\n' +
      'Todos los endpoints protegidos requieren un token JWT en el header `Authorization: Bearer <token>`.\n' +
      'También se soportan cookies httpOnly (`token_acceso`, `token_refresco`).\n\n' +
      '## Roles del Sistema\n' +
      '- **pcd**: Persona con Discapacidad (PCD)\n' +
      '- **tutor**: Tutor, Padre o Cuidador\n' +
      '- **institucion**: Usuario Proveedor (escuelas, centros terapéuticos, especialistas)\n' +
      '- **institucional**: Usuario Institucional (gobiernos, ONGs, fundaciones, donantes)\n' +
      '- **admin**: Administrador de la plataforma (validador, moderador, gestor)\n\n' +
      '## Especificaciones Funcionales\n' +
      'Esta API implementa el 100% del Spec Funcional MVP Raíces, incluyendo:\n' +
      '- Registro con destinatario (Para mí / Para mi hijo / etc.)\n' +
      '- Validación de identidad con CURP (regex oficial mexicano) e identificación oficial\n' +
      '- Evaluación "Cómo vives hoy" (8 escalas × 4 niveles)\n' +
      '- Módulo de Rutas y Caminos de Desarrollo\n' +
      '- Integración con IA (Vertex AI / Gemini) para resúmenes y recomendaciones\n' +
      '- Visibilidad diferenciada Cuidador ↔ PCD'
    )
    .setVersion('1.0.0')
    .setContact('Equipo Raíces', 'https://raices.mx', 'soporte@raices.mx')
    .setLicense('Propietario', 'https://raices.mx/terms')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT de Firebase Auth',
      },
      'jwt-auth',
    )
    .addTag('Autenticación', 'Registro, inicio de sesión, renovación de token y perfil del usuario autenticado')
    .addTag('Usuarios', 'Gestión de perfil, dependientes, escalas de vida, documentos de identidad y vinculación PCD ↔ Tutor')
    .addTag('Instituciones', 'Directorio de instituciones proveedoras (CRUD, verificación, mi institución)')
    .addTag('Descubrimiento', 'Búsqueda inteligente de instituciones cruzando perfil del usuario')
    .addTag('Favoritos', 'Instituciones guardadas por el usuario')
    .addTag('Reseñas', 'Reseñas y calificaciones de instituciones')
    .addTag('Comunidad', 'Grupos, publicaciones, comentarios, me gusta y miembros')
    .addTag('Notificaciones', 'Notificaciones in-app del usuario')
    .addTag('Administración', 'Panel administrativo: estadísticas, analítica, auditoría, usuarios, instituciones, configuración')
    .addTag('Inteligencia Artificial', 'Chat conversacional, recomendaciones personalizadas y resúmenes narrativos (Vertex AI / Gemini)')
    .addTag('Empleo', 'Bolsa de trabajo inclusiva: vacantes, postulaciones, postulantes por institución')
    .addTag('Catálogos', 'Catálogos de referencia: parentescos, discapacidades, etapas de vida, áreas de interés, etc.')
    .addTag('Mensajes', 'Mensajería directa entre usuarios')
    .addTag('Rutas de Desarrollo', 'Rutas y caminos de desarrollo personalizados con pasos y progreso')
    .addTag('Documentos de Identidad', 'Upload y validación de documentos de identidad (CURP, identificación oficial)')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Crear directorio docs si no existe
  const docsDir = path.join(process.cwd(), 'docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  // Guardar JSON
  const outputPath = path.join(docsDir, 'swagger.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));

  console.log(`✅ Swagger JSON generado: ${outputPath}`);
  console.log(`   Endpoints: ${Object.keys(document.paths || {}).length}`);
  console.log(`   Tags: ${(document.tags || []).length}`);

  await app.close();
}

generateSwagger().catch((err) => {
  console.error('Error al generar Swagger:', err);
  process.exit(1);
});
