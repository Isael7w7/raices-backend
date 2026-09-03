# 📋 Documentación Técnica — Backend Raíces para Florecer

**Fecha:** 3 de septiembre de 2026  
**Versión:** 1.0.0  
**Stack:** NestJS 10 + Firebase (Firestore + Auth + Storage) + Vertex AI (Gemini)  
**Autor:** Equipo de Desarrollo — Generado con Codebuff 🤖

---

## 📑 Tabla de Contenidos

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Arquitectura General](#2-arquitectura-general)
3. [Stack Tecnológico](#3-stack-tecnológico)
4. [Módulos y Funcionalidades](#4-módulos-y-funcionalidades)
5. [Base de Datos (Firestore)](#5-base-de-datos-firestore)
6. [Autenticación y Autorización](#6-autenticación-y-autorización)
7. [API REST — Endpoints Completos](#7-api-rest--endpoints-completos)
8. [Inteligencia Artificial](#8-inteligencia-artificial)
9. [Seguridad](#9-seguridad)
10. [Despliegue](#10-despliegue)
11. [Variables de Entorno](#11-variables-de-entorno)
12. [Estructura del Proyecto](#12-estructura-del-proyecto)
13. [Testing](#13-testing)
14. [Guías de Uso](#14-guías-de-uso)

---

## 1. Resumen Ejecutivo

**Raíces para Florecer** es un ecosistema digital diseñado para personas con discapacidad (PCD) en México. El backend es una API RESTful construida con **NestJS** que se comunica con **Firebase Firestore** como base de datos, **Firebase Auth** para autenticación, **Firebase Cloud Storage** para archivos, y **Google Vertex AI (Gemini)** para funcionalidades de inteligencia artificial.

### Capacidad Actual

| Área | Estado |
|------|--------|
| Autenticación (registro, login, JWT, cookies httpOnly) | ✅ Completo |
| Gestión de usuarios y perfiles | ✅ Completo |
| Directorio de instituciones | ✅ Completo |
| Sistema de favoritos | ✅ Completo |
| Reseñas y calificaciones | ✅ Completo |
| Comunidad (grupos, publicaciones, comentarios, foros) | ✅ Completo |
| Mensajería directa | ✅ Completo |
| Notificaciones in-app + SSE | ✅ Completo |
| Bolsa de trabajo inclusiva | ✅ Completo |
| IA (chat, recomendaciones, resúmenes) | ✅ Completo |
| Panel administrativo | ✅ Completo |
| Catálogos de referencia | ✅ Completo |
| Rutas de desarrollo personalizadas | ✅ Completo |
| Validación de documentos de identidad (CURP) | ✅ Completo |
| Almacenamiento de archivos (GCS + fallback local) | ✅ Completo |
| Envío de emails (Resend, mock en desarrollo) | ✅ Completo |
| Auditoría de acciones críticas | ✅ Completo |
| Rate limiting y caché ETag | ✅ Completo |

---

## 2. Arquitectura General

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND (SPA)                    │
│              React / Vue / Angular                   │
│         Cookies httpOnly + JWT Bearer                │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────────────┐
│               NestJS API (Backend)                   │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Guards   │  │Pipes     │  │  Interceptors    │  │
│  │ JWT Auth  │  │Validate  │  │  ETag + Audit    │  │
│  │ Roles     │  │Transform │  │                  │  │
│  │ Features  │  │Whitelist │  │                  │  │
│  │Throttler │  └──────────┘  └──────────────────┘  │
│  └──────────┘                                       │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │              Controllers (18 módulos)        │   │
│  │  auth│users│institutions│admin│ai│community│...│  │
│  └──────────────────────┬───────────────────────┘   │
│                         │                           │
│  ┌──────────────────────▼───────────────────────┐   │
│  │              Services (lógica de negocio)    │   │
│  └──────────────────────┬───────────────────────┘   │
│                         │                           │
└─────────────────────────┼───────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
   │  Firestore  │ │Cloud Storage│ │ Vertex AI   │
   │  (BD)       │ │(Archivos)   │ │ (Gemini)    │
   └─────────────┘ └─────────────┘ └─────────────┘
```

### Patrón de Arquitectura

- **Patrón:** Modular (NestJS Modules)
- **Inyección de dependencias:** nativa de NestJS
- **Base de datos:** NoSQL (Firestore) — documentos planos, sin joins
- **Autenticación:** Firebase Auth (REST API + Admin SDK)
- **Almacenamiento:** Firebase Cloud Storage con fallback local
- **IA:** Google Gen AI SDK (`@google/genai`) con Vertex AI

---

## 3. Stack Tecnológico

| Componente | Tecnología | Versión |
|------------|-----------|---------|
| Runtime | Node.js | 22+ |
| Framework | NestJS | 10.3 |
| Lenguaje | TypeScript | 5.4 (strict) |
| Base de datos | Firebase Firestore | SDK Admin v14 |
| Autenticación | Firebase Auth | SDK Admin v14 |
| Almacenamiento | Firebase Cloud Storage | @google-cloud/storage 7.21 |
| IA | Google Gen AI (Gemini) | @google/genai 2.19 |
| Validación | class-validator + class-transformer | 0.14 / 0.5 |
| Documentación API | Swagger (@nestjs/swagger) | 7.4 |
| Rate Limiting | @nestjs/throttler | 6.5 |
| Seguridad HTTP | Helmet | 8.3 |
| Email | Resend | (SDK pendiente, mock actual) |
| Testing | Jest + Supertest | 30.x |
| Contenedorización | Docker (multi-stage) | Alpine |
| Despliegue | Google Cloud Run | — |
| Gestor de paquetes | pnpm | 9.x |

---

## 4. Módulos y Funcionalidades

### 4.1 🔐 Módulo de Autenticación (`/api/autenticacion`)

**Responsable:** Registro, login, JWT, cookies httpOnly, refresh tokens.

| Endpoint | Método | Descripción | Throttle |
|----------|--------|-------------|----------|
| `/api/autenticacion/registro` | POST | Registrar nuevo usuario (pcd, tutor, institución) | 3/hora |
| `/api/autenticacion/inicio-sesion` | POST | Login con Firebase Auth | 5/min |
| `/api/autenticacion/renovar-token` | POST | Refrescar tokens de acceso | 10/min |
| `/api/autenticacion/cerrar-sesion` | POST | Eliminar cookies de sesión | 10/min |
| `/api/autenticacion/yo` | GET | Perfil del usuario autenticado | — |

**Flujo de autenticación:**
1. Usuario se registra → crea usuario en Firebase Auth + perfil en Firestore
2. Usuario inicia sesión → Firebase Auth retorna ID token + refresh token
3. Backend establece cookies httpOnly (`token_acceso` 1h, `token_refresco` 30d)
4. El guard acepta JWT tanto en cookie httpOnly como en header `Authorization: Bearer`
5. Refresh token intercambia tokens expirados

**Roles soportados:** `pcd`, `padre_tutor`/`tutor`, `institucion`, `admin`

---

### 4.2 👤 Módulo de Usuarios (`/api/usuarios`)

**Responsable:** Gestión de perfiles, dependientes, vinculación tutor↔PCD.

| Endpoint | Método | Descripción | Auth |
|----------|--------|-------------|------|
| `/api/usuarios/perfil` | GET | Perfil completo del usuario | ✅ |
| `/api/usuarios/perfil` | PUT | Actualizar perfil básico | ✅ |
| `/api/usuarios/perfil-pcd/:pcdUserId` | GET | Ver perfil PCD (tutor/institución) | ✅ Roles |
| `/api/usuarios/avatar` | POST | Subir foto de perfil (5MB, imagen) | ✅ |
| `/api/usuarios/avatar` | DELETE | Eliminar foto de perfil | ✅ |
| `/api/usuarios/perfil-necesidades` | POST | Guardar perfil de necesidades | ✅ |
| `/api/usuarios/escalas-vida` | POST | Guardar evaluación "Cómo vives hoy" | ✅ |
| `/api/usuarios/documento-identidad` | POST | Subir documento (CURP/identificación) | ✅ |
| `/api/usuarios/estado-validacion-identidad` | GET | Estado de validación | ✅ |
| `/api/usuarios/dependientes` | GET | Listar dependientes | ✅ |
| `/api/usuarios/dependientes/count` | GET | Conteo de dependientes vs límite | ✅ |
| `/api/usuarios/dependientes` | POST | Agregar dependiente | ✅ + Guard límite |
| `/api/usuarios/dependientes/:id` | GET/PUT/DELETE | CRUD dependiente | ✅ |
| `/api/usuarios/mis-personas` | GET | Lista consolidada (paginada) | ✅ |
| `/api/usuarios/vincular-pcd` | POST | Vincular PCD por email | ✅ Tutor |
| `/api/usuarios/desvincular-pcd/:pcdUserId` | DELETE | Desvincular PCD | ✅ Tutor |

**Feature Flags por dependiente:**
```typescript
{
  chat: boolean,          // Acceso a chat/mensajes
  postulaciones: boolean, // Acceso a bolsa de trabajo
  comunidad: boolean,     // Acceso a comunidad
  resenas: boolean,       // Acceso a reseñas
  descubrimiento: boolean,// Acceso a descubrimiento
  favoritos: boolean,     // Acceso a favoritos
  multimedia: boolean     // Acceso a contenido multimedia
}
```

---

### 4.3 🏛️ Módulo de Instituciones (`/api/instituciones`)

**Responsable:** Directorio de instituciones (escuelas, centros terapéuticos, etc.).

| Endpoint | Método | Descripción | Auth |
|----------|--------|-------------|------|
| `/api/instituciones` | GET | Listar instituciones activas+verificadas (paginado) | — |
| `/api/instituciones/:id` | GET | Detalle de institución (público) | — |
| `/api/instituciones/:id/detalle` | GET | Detalle completo (admin/propietario) | ✅ |
| `/api/instituciones/mi-institucion` | GET | Institución del usuario autenticado | ✅ |
| `/api/instituciones` | POST | Crear institución | ✅ Rol institución |
| `/api/instituciones/mi-institucion` | PUT | Actualizar mi institución | ✅ |
| `/api/instituciones/:id` | PUT | Actualizar institución (admin/propietario) | ✅ |
| `/api/instituciones/mi-institucion` | DELETE | Eliminar mi institución (soft-delete) | ✅ |
| `/api/instituciones/:id` | DELETE | Eliminar institución (admin/propietario) | ✅ |
| `/api/instituciones/validar-csf-qr` | POST | Validar código QR de Constancia de Situación Fiscal | ✅ |

**Categorías de instituciones:** funcional, educativo, laboral, social

**Visibilidad:** Solo se muestran instituciones `activa=true` y `verificada=true` al público.

---

### 4.4 🔍 Módulo de Descubrimiento (`/api/descubrimiento`)

**Responsable:** Búsqueda inteligente de instituciones basada en perfil del usuario.

| Endpoint | Método | Descripción | Auth |
|----------|--------|-------------|------|
| `/api/descubrimiento` | GET | Búsqueda inteligente con filtros | ✅ |

**Parámetros:** `categoria`, `categorias` (prioritarias), `ciudad`, `busqueda`, `tipoDiscapacidad`

**Comportamiento:** Cruza el perfil del usuario (tipos de discapacidad, ciudad) con las instituciones y ordena por coincidencia. Las instituciones coincidentes se marcan con `coincidePerfil: true`.

---

### 4.5 ⭐ Módulo de Favoritos (`/api/favoritos`)

**Responsable:** Gestión de instituciones guardadas por usuario.

| Endpoint | Método | Descripción | Auth |
|----------|--------|-------------|------|
| `/api/favoritos` | GET | Instituciones favoritas (datos completos) | ✅ |
| `/api/favoritos/ids` | GET | Solo IDs de favoritos (ligero) | ✅ |
| `/api/favoritos/:institutionId/alternar` | POST | Agregar/quitar de favoritos (toggle) | ✅ + Feature |

---

### 4.6 ⭐ Módulo de Reseñas (`/api/resenas`)

**Responsable:** Reseñas y calificaciones de instituciones.

| Endpoint | Método | Descripción | Auth |
|----------|--------|-------------|------|
| `/api/resenas/institucion/:id` | GET | Reseñas de una institución (paginado) | — |
| `/api/resenas/mias` | GET | Mis reseñas (paginado) | ✅ |
| `/api/resenas/institucion/:id` | POST | Crear o actualizar reseña (1 por usuario/institución) | ✅ + Feature |
| `/api/resenas/:id` | PUT | Editar reseña (solo autor) | ✅ |
| `/api/resenas/:id` | DELETE | Eliminar reseña (solo autor) | ✅ |

**Nota:** Al crear/editar/eliminar una reseña se recalcula automáticamente el `calificacionPromedio` de la institución.

---

### 4.7 💬 Módulo de Comunidad (`/api/comunidad`)

**Responsable:** Grupos, publicaciones, comentarios, foros institucionales, espacio "Conectemos".

| Endpoint | Método | Descripción | Auth |
|----------|--------|-------------|------|
| `/api/comunidad/grupos` | GET | Listar grupos públicos (paginado) | — |
| `/api/comunidad/grupos` | POST | Crear grupo | ✅ |
| `/api/comunidad/grupos/:id/unirse` | POST | Unirse a grupo | ✅ |
| `/api/comunidad/grupos/:id/salir` | POST | Salir de grupo (creador no puede) | ✅ |
| `/api/comunidad/publicaciones` | GET | Listar publicaciones (paginado) | ✅ |
| `/api/comunidad/publicaciones` | POST | Crear publicación | ✅ + Feature `comunidad` |
| `/api/comunidad/publicaciones/:id` | PUT | Editar publicación (solo autor) | ✅ |
| `/api/comunidad/publicaciones/:id` | DELETE | Eliminar publicación (autor o admin) | ✅ |
| `/api/comunidad/publicaciones/:id/comentarios` | GET | Comentarios de publicación | — |
| `/api/comunidad/publicaciones/:id/comentarios` | POST | Crear comentario | ✅ + Feature |
| `/api/comunidad/publicaciones/:id/me-gusta` | POST | Alternar me gusta | ✅ + Feature |
| `/api/comunidad/estadisticas` | GET | Métricas de comunidad | — |
| `/api/comunidad/miembros` | GET | Testimonios públicos de miembros | — |
| `/api/comunidad/foros` | GET | Listar foros institucionales | — |
| `/api/comunidad/foros` | POST | Crear foro (solo institución/admin) | ✅ Rol |
| `/api/comunidad/foros/:id` | GET | Detalle de foro con respuestas | — |
| `/api/comunidad/foros/:id/respuestas` | POST | Responder pregunta detonante | ✅ |
| `/api/comunidad/conectemos/publicaciones` | GET | Galería "Conectemos" (contenido creativo PCD) | — |

---

### 4.8 📨 Módulo de Mensajes (`/api/mensajes`)

**Responsable:** Mensajería directa entre usuarios.

| Endpoint | Método | Descripción | Auth |
|----------|--------|-------------|------|
| `/api/mensajes/conversaciones` | GET | Lista de conversaciones | ✅ |
| `/api/mensajes/no-leidos` | GET | Conteo de no leídos | ✅ |
| `/api/mensajes/con/:userId` | GET | Mensajes con un usuario | ✅ |
| `/api/mensajes/enviar/:userId` | POST | Enviar mensaje | ✅ + Feature `chat` |

---

### 4.9 🔔 Módulo de Notificaciones (`/api/notificaciones`)

**Responsable:** Notificaciones in-app y flujo en tiempo real (SSE).

| Endpoint | Método | Descripción | Auth |
|----------|--------|-------------|------|
| `/api/notificaciones` | GET | Listar notificaciones (máx. 50) | ✅ |
| `/api/notificaciones/:id/leer` | PATCH | Marcar como leída | ✅ |
| `/api/notificaciones/leer-todas` | PATCH | Marcar todas como leídas | ✅ |
| `/api/notificaciones/flujo` | SSE | Flujo en tiempo real (Server-Sent Events) | ✅ |

---

### 4.10 💼 Módulo de Empleo (`/api/empleo`)

**Responsable:** Bolsa de trabajo inclusiva con vacantes y postulaciones.

| Endpoint | Método | Descripción | Auth |
|----------|--------|-------------|------|
| `/api/empleo` | GET | Listar vacantes activas (paginado) | — |
| `/api/empleo/:id` | GET | Detalle de vacante | — |
| `/api/empleo/postuladas` | GET | IDs de vacantes postuladas | ✅ |
| `/api/empleo/mis-postulaciones` | GET | Mis postulaciones (paginado) | ✅ |
| `/api/empleo` | POST | Crear vacante (institución/admin) | ✅ Rol + Verificada |
| `/api/empleo/:id` | PUT | Editar vacante (propietario) | ✅ |
| `/api/empleo/:id` | DELETE | Desactivar vacante | ✅ |
| `/api/empleo/:id/postularse` | POST | Postularse a vacante | ✅ + Feature `postulaciones` |
| `/api/empleo/postulaciones/:id/estado` | PATCH | Aceptar/rechazar postulación | ✅ Rol + Verificada |
| `/api/empleo/postulantes-institucion` | GET | Postulantes de mi institución | ✅ Rol |
| `/api/empleo/postulantes-vacante` | GET | Postulantes de una vacante | ✅ Rol |

---

### 4.11 🤖 Módulo de IA (`/api/ia`)

**Responsable:** Chat con asistente, recomendaciones personalizadas, resúmenes narrativos.

| Endpoint | Método | Descripción | Auth | Throttle |
|----------|--------|-------------|------|----------|
| `/api/ia/conversacion` | POST | Chat con asistente IA | ✅ | 20/hora |
| `/api/ia/recomendaciones` | POST | Recomendaciones personalizadas | ✅ | 10/hora |
| `/api/ia/resumen` | POST | Resumen narrativo del perfil | ✅ | 5/hora |

**Motor:** Google Gemini vía Vertex AI (`@google/genai` con `vertexai: true`)  
**Fallback:** Respuestas mock si Vertex AI no está configurado o falla.

---

### 4.12 🛡️ Módulo Admin (`/api/administracion`)

**Responsable:** Panel administrativo completo (solo rol `admin`).

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/administracion/estadisticas` | GET | Estadísticas generales |
| `/api/administracion/analiticas` | GET | Analíticas detalladas |
| `/api/administracion/inteligencia-necesidades` | GET | Demanda vs oferta por discapacidad |
| `/api/administracion/visitantes-activos` | GET | Métricas de visitantes en tiempo real |
| `/api/administracion/auditoria` | GET | Logs de auditoría (paginado, filtrable) |
| `/api/administracion/auditoria/estadisticas` | GET | Resumen de auditoría |
| `/api/administracion/instituciones` | GET | Todas las instituciones |
| `/api/administracion/instituciones/pendientes` | GET | Pendientes de aprobación |
| `/api/administracion/instituciones/:id/verificacion-identidad` | GET | Estado verificación identidad |
| `/api/administracion/instituciones/:id/aprobar` | POST | Aprobar institución |
| `/api/administracion/instituciones/:id/verificar` | PATCH | Alternar verificación |
| `/api/administracion/instituciones/:id` | DELETE | Rechazar/eliminar institución |
| `/api/administracion/usuarios` | GET | Todos los usuarios |
| `/api/administracion/usuarios/:id/activo` | PATCH | Activar/desactivar usuario |
| `/api/administracion/usuarios/:id/rol` | PATCH | Cambiar rol |
| `/api/administracion/usuarios/:id` | DELETE | Eliminar cuenta |
| `/api/administracion/resenas` | GET | Moderar reseñas |
| `/api/administracion/resenas/:id` | DELETE | Eliminar reseña |
| `/api/administracion/alertas` | GET | Alertas de riesgo automáticas |
| `/api/administracion/configuracion` | GET | Configuración de plataforma |
| `/api/administracion/configuracion` | PUT | Actualizar configuración |
| `/api/administracion/documentos-identidad/pendientes` | GET | Documentos pendientes |
| `/api/administracion/documentos-identidad/:id/aprobar` | POST | Aprobar documento |
| `/api/administracion/documentos-identidad/:id/rechazar` | POST | Rechazar documento (con motivo) |

---

### 4.13 📚 Módulo de Catálogos (`/api/catalogos`)

**Responsable:** Catálogos de referencia de la plataforma (todos públicos, sin auth).

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/catalogos` | Todos los catálogos en un solo objeto |
| `GET /api/catalogos/parentescos` | Opciones de parentesco |
| `GET /api/catalogos/discapacidades` | Tipos de discapacidad |
| `GET /api/catalogos/etapas-vida` | Etapas de vida con rangos |
| `GET /api/catalogos/features` | Funcionalidades disponibles |
| `GET /api/catalogos/categorias` | Categorías de instituciones |
| `GET /api/catalogos/temporalidad-origen` | Origen de la condición |
| `GET /api/catalogos/preferencia-formato` | Formatos preferidos |
| `GET /api/catalogos/areas-interes` | Áreas de interés |
| `GET /api/catalogos/viabilidad-economica` | Viabilidad económica |
| `GET /api/catalogos/subcategorias-comunidad` | Subcategorías de comunidad |
| `GET /api/catalogos/tono-contextual` | Tono contextual |

---

### 4.14 🗺️ Módulo de Rutas de Desarrollo (`/api/rutas-desarrollo`)

**Responsable:** Rutas y pasos de desarrollo personalizados por usuario.

| Endpoint | Método | Descripción | Auth |
|----------|--------|-------------|------|
| `/api/rutas-desarrollo` | GET | Listar mis rutas | ✅ |
| `/api/rutas-desarrollo/resumen` | GET | Resumen de todas las rutas | ✅ |
| `/api/rutas-desarrollo/:id` | GET | Detalle de ruta con pasos | ✅ |
| `/api/rutas-desarrollo` | POST | Crear ruta | ✅ |
| `/api/rutas-desarrollo/:id` | PUT | Actualizar ruta | ✅ |
| `/api/rutas-desarrollo/:id` | DELETE | Eliminar ruta y pasos | ✅ |
| `/api/rutas-desarrollo/:id/pasos` | POST | Agregar paso | ✅ |
| `/api/rutas-desarrollo/:rutaId/pasos/:pasoId/completar` | PATCH | Completar paso | ✅ |
| `/api/rutas-desarrollo/:rutaId/pasos/:pasoId/descompletar` | PATCH | Descompletar paso | ✅ |

---

### 4.15 🏥 Módulo de Salud (`/api/health`)

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/health` | Health check (proceso + Firestore) |

Utilizado por Docker y Cloud Run como healthcheck. Excluido de rate limiting (`@SkipThrottle()`).

---

### 4.16 📧 Módulo de Email

**Servicio:** Resend (en producción) / Mock (en desarrollo)  
**Templates actualmente implementados:**
- Bienvenida al registrarse
- Institución aprobada
- Documento de identidad aprobado/rechazado
- Validación de identidad completa

---

### 4.17 📦 Módulo de Storage

**Proveedor:** Firebase Cloud Storage (GCS) con fallback a almacenamiento local  
**Características:**
- Upload con retry automático (backoff exponencial, máx. 3 intentos)
- Eliminación de archivos huérfanos
- Soporte para imágenes (JPEG, PNG, WebP, GIF, HEIC) y videos
- URLs con token de descarga (compatible con Uniform Bucket-Level Access)

---

## 5. Base de Datos (Firestore)

### 5.1 Colecciones

| Colección | Descripción | Relaciones |
|-----------|-------------|------------|
| `perfiles` | Perfiles de usuario (id = UID de Firebase Auth) | → perfilesExtendidos, dependientes |
| `perfilesExtendidos` | Datos extendidos (discapacidad, necesidades, escalas) | ← perfiles |
| `dependientes` | Dependientes de tutores (planos + cuentas PCD vinculadas) | ← perfiles |
| `instituciones` | Directorio de instituciones | ← perfiles (creadoPor) |
| `favoritos` | Instituciones guardadas por usuario | ← perfiles, instituciones |
| `resenas` | Reseñas de instituciones | ← perfiles, instituciones |
| `publicaciones` | Publicaciones de comunidad | ← perfiles, grupos |
| `comentarios` | Comentarios de publicaciones | ← publicaciones |
| `meGustas` | Me gusta en publicaciones | ← publicaciones |
| `grupos` | Grupos de comunidad | ← publicaciones |
| `miembrosGrupo` | Membresías de grupos | ← grupos |
| `mensajesDirectos` | Mensajes privados | ← perfiles |
| `notificaciones` | Notificaciones in-app | ← perfiles |
| `postulaciones` | Postulaciones a vacantes | ← perfiles, vacantes |
| `vacantes` | Vacantes de empleo | ← instituciones |
| `foros` | Foros institucionales (tipo Classroom) | ← instituciones |
| `respuestasForo` | Respuestas a foros | ← foros |
| `documentosIdentidad` | Documentos de identidad para validación | ← perfiles |
| `rutasDesarrollo` | Rutas de desarrollo personalizadas | ← perfiles, pasosRuta |
| `pasosRuta` | Pasos/hitos de rutas | ← rutasDesarrollo |
| `_analiticas` | Métricas de analytics (prefijo _) | — |
| `_auditoria` | Logs de auditoría (prefijo _) | — |

### 5.2 Estructura de Documentos Clave

**Perfil de usuario (`perfiles/{uid}`):**
```json
{
  "id": "uid-firebase",
  "email": "usuario@email.com",
  "nombreCompleto": "Juan Pérez",
  "rol": "pcd | padre_tutor | institucion | admin",
  "activo": true,
  "verificado": false,
  "ciudad": "Ciudad de México",
  "estado": "CDMX",
  "urlAvatar": "https://...",
  "tutorId": "uid-tutor" | null,
  "institucionId": "uid-institucion" | null,
  "features": { "chat": true, "postulaciones": true, ... },
  "curp": "CURP18CARACTERES",
  "estadoAcreditacionTutor": "pendiente" | "aprobado" | "rechazado",
  "fechaCreacion": "2026-01-01T00:00:00.000Z"
}
```

**Perfil extendido (`perfilesExtendidos/{id}`):**
```json
{
  "id": "doc-id",
  "usuarioId": "uid-firebase",
  "tiposDiscapacidad": "[\"Motriz\",\"Visual\"]",
  "severidadDiscapacidad": "moderada",
  "escalasVida": {
    "autonomia": 7,
    "independencia": 6,
    "comunicacion": 8,
    "comprension": 7,
    "energia": 5,
    "movilidad": 4,
    "social": 6,
    "emocional": 7
  },
  "tieneDiagnostico": true,
  "requiereEvaluacion": false,
  "etapaVida": "adulto_joven",
  "nivelApoyo": "moderado"
}
```

---

## 6. Autenticación y Autorización

### 6.1 Flujo de Autenticación

```
┌──────────┐     POST /registro      ┌──────────┐
│ Frontend │ ───────────────────────→ │ Backend  │
│          │ ←─────────────────────── │          │
│          │  { usuario, requiereInicioSesion: true }
│          │                          │          │
│          │  POST /inicio-sesion     │          │
│          │ ───────────────────────→ │          │
│          │                          │ ───→ Firebase Auth REST API
│          │                          │ ←── idToken + refreshToken
│          │                          │
│          │  Set-Cookie: token_acceso (httpOnly, 1h)
│          │  Set-Cookie: token_refresco (httpOnly, 30d)
│          │ ←─────────────────────── │          │
│          │  { tokenAcceso, tokenRefresco, usuario }
└──────────┘                          └──────────┘
```

### 6.2 Guards (Cadena de Autenticación)

| Guard | Función |
|-------|---------|
| `JwtAuthGuard` | Verifica JWT (cookie httpOnly o header Bearer) |
| `RolesGuard` | Valida roles (`@Roles('admin')`) |
| `FeatureGuard` | Valida feature flags (`@Feature('comunidad')`) |
| `LimitDependientesGuard` | Valida límite de dependientes por tutor |
| `InstitucionVerificadaGuard` | Verifica que la institución esté verificada |
| `DependientePropietarioGuard` | Verifica propiedad del dependiente |
| `CustomThrottlerGuard` | Rate limiting global configurable |

### 6.3 Decoradores

| Decorador | Uso |
|-----------|-----|
| `@CurrentUser()` | Inyecta el payload del usuario autenticado |
| `@Roles('admin')` | Define roles permitidos |
| `@Feature('comunidad')` | Define feature requerida |
| `@UseETag()` | Habilita caché ETag en el endpoint |
| `@Audit({...})` | Registra acción en logs de auditoría |
| `@LimitDependientes()` | Activa validación de límite de dependientes |

---

## 7. API REST — Endpoints Completos

**URL Base:** `https://<dominio>/api`  
**Swagger UI:** `https://<dominio>/docs`

### Convenciones de Respuesta

- **Listados paginados:** `{ "datos": [...], "paginacion": { "total", "pagina", "limite", "totalPaginas" } }`
- **Recursos únicos:** `{ "id": "...", "campo": "valor" }` (objeto directo)
- **Operaciones sin contenido:** `204 No Content`
- **Confirmación/ Error:** Solo códigos HTTP (200, 201, 400, 401, 403, 404, 409, 500)

### Headers Requeridos

```
Authorization: Bearer <firebase-id-token>
Content-Type: application/json
```

### Autenticación dual

El backend acepta el token JWT de dos formas:
1. **Cookie httpOnly** (`token_acceso`) — preferida, inmune a XSS
2. **Header Authorization** (`Bearer <token>`) — compatibilidad

---

## 8. Inteligencia Artificial

### 8.1 Configuración

- **Proveedor:** Google Vertex AI
- **Modelo:** Gemini 2.0 Flash (configurable con `VERTEX_AI_MODEL`)
- **SDK:** `@google/genai` con `vertexai: true`
- **Autenticación:** Application Default Credentials (ADC) — sin API key embebida

### 8.2 Funcionalidades

| Función | Descripción | Límite |
|---------|-------------|--------|
| Chat | Conversación contextualizada con el perfil del usuario | 20/hora |
| Recomendaciones | 3 próximos pasos personalizados (usuario o dependiente) | 10/hora |
| Resumen | Resumen narrativo del perfil (1 párrafo + 3 párrafos) | 5/hora |

### 8.3 Fallback

Si Vertex AI no está configurado o falla, el sistema retorna respuestas mock con `simulado: true` para no romper la experiencia del usuario.

---

## 9. Seguridad

### 9.1 Capas de Seguridad

| Capa | Implementación |
|------|---------------|
| **Transporte** | HTTPS (Cloud Run), Helmet (CSP, HSTS, X-Frame-Options) |
| **Autenticación** | Firebase Auth (ID tokens JWT) |
| **Cookies** | httpOnly + Secure (producción) + SameSite=Lax |
| **Autorización** | Guards por rol, feature flags, propiedad |
| **Rate Limiting** | Global (60/min) + endpoints específicos |
| **Validación** | class-validator (whitelist, transform) |
| **Secretos** | GCP Secret Manager (Cloud Run), .env (local) |
| **CORS** | Orígenes específicos, credentials: true |
| **Caché** | ETag en memoria (30s configurable) |
| **Auditoría** | Logs de acciones críticas en `_auditoria` |
| **Almacenamiento** | Magic bytes validation, max file size |
| **Anti-CSRF** | SameSite cookies + validación de origen en logout |

### 9.2 Variables Sensibles (Secretos)

| Variable | Uso |
|----------|-----|
| `FIREBASE_CREDENTIALS` | JSON de cuenta de servicio Firebase |
| `FIREBASE_API_KEY` | API Key de Firebase Auth |
| `RESEND_API_KEY` | API Key de Resend (emails) |

**NUNCA** se suben a Git. En producción se montan desde GCP Secret Manager.

---

## 10. Despliegue

### 10.1 Docker (desarrollo local)

```bash
docker-compose up -d
```

- Build multi-stage (builder → production)
- Imagen Alpine con dependencias nativas (cairo, pango)
- Usuario no-root (appuser:1001)
- Health check cada 30s en `/api/health`

### 10.2 Google Cloud Run (producción)

```bash
# Sincronizar secretos desde .env
./deploy.sh secrets

# Sincronizar secretos Y desplegar
./deploy.sh deploy
```

**Secretos:** GCP Secret Manager → `--set-secrets` en Cloud Run  
**Variables no sensibles:** `--set-env-vars` en Cloud Run

### 10.3 Comandos Útiles

```bash
pnpm dev                    # Desarrollo con hot-reload
pnpm build                  # Compilar TypeScript
pnpm test                   # Ejecutar tests
pnpm test:cov               # Tests con cobertura
pnpm seed                   # Poblar datos de prueba
pnpm db:scan                # Escanear estructura de Firestore
```

---

## 11. Variables de Entorno

### Obligatorias

| Variable | Descripción |
|----------|-------------|
| `FIREBASE_PROJECT_ID` | ID del proyecto GCP/Firebase |
| `FIREBASE_CREDENTIALS` | JSON de cuenta de servicio (una línea) |

### Opcionales (con valores por defecto)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | 7000 | Puerto del servidor |
| `NODE_ENV` | development | Entorno de ejecución |
| `CORS_ORIGINS` | http://localhost:5173,... | Orígenes permitidos |
| `MAX_DEPENDIENTES_POR_TUTOR` | 5 | Límite de dependientes por tutor |
| `THROTTLE_TTL` | 60000 | Ventana de rate limiting (ms) |
| `THROTTLE_LIMIT` | 60 | Límite de peticiones por ventana |
| `ETAG_CACHE_TTL_MS` | 30000 | TTL de caché ETag |
| `VERTEX_AI_PROJECT_ID` | — | Proyecto para Vertex AI |
| `VERTEX_AI_LOCATION` | us-central1 | Región de Vertex AI |
| `VERTEX_AI_MODEL` | gemini-2.0-flash | Modelo Gemini |
| `COOKIE_SAMESITE` | lax | SameSite para cookies |
| `FIREBASE_API_KEY` | — | API Key Firebase Auth |
| `RESEND_API_KEY` | — | API Key Resend |
| `FIREBASE_STORAGE_BUCKET` | Se deriva del proyecto | Bucket de Cloud Storage |

---

## 12. Estructura del Proyecto

```
raices-backend/
├── src/
│   ├── app.module.ts              # Módulo raíz (imports globales)
│   ├── main.ts                    # Bootstrap (CORS, Helmet, Swagger, ValidationPipe)
│   ├── common/
│   │   ├── audit/                 # Servicio de auditoría
│   │   ├── decorators/            # @CurrentUser, @Roles, @Feature, @UseETag, @Audit
│   │   ├── dto/                   # DTOs compartidos (PaginacionDto)
│   │   ├── guards/                # JWT, Roles, Features, Throttler, LimitDependientes
│   │   ├── interceptors/          # ETag, Audit
│   │   ├── interfaces/            # FeatureFlags, CurrentUserPayload, AuditLog
│   │   ├── tenant/                # Servicio multi-tenant
│   │   ├── utils/                 # CORS, cookies, storage-path, firestore-helpers
│   │   └── validators/            # CURP, multimedia magic bytes
│   ├── database/
│   │   ├── database.module.ts     # Módulo global de BD
│   │   ├── firebase.provider.ts   # Provider de Firestore + Firebase Auth
│   │   ├── firestore.constants.ts # Nombres de colecciones + límites
│   │   └── seed/                  # Scripts de seed
│   ├── modules/
│   │   ├── admin/                 # Panel administrativo + Firebase Analytics
│   │   ├── ai/                    # Chat, recomendaciones, resúmenes IA
│   │   ├── auth/                  # Registro, login, JWT, cookies
│   │   ├── catalogs/              # Catálogos de referencia
│   │   ├── community/             # Grupos, posts, comentarios, foros, Conectemos
│   │   ├── discovery/             # Búsqueda inteligente de instituciones
│   │   ├── email/                 # Servicio de email (Resend/mock)
│   │   ├── favorites/             # Favoritos de instituciones
│   │   ├── health/                # Health check
│   │   ├── institutions/          # Directorio de instituciones + CSF QR
│   │   ├── jobs/                  # Bolsa de trabajo + postulaciones
│   │   ├── messages/              # Mensajería directa
│   │   ├── notifications/         # Notificaciones in-app + SSE
│   │   ├── recommendations/       # (Módulo existente, vinculado a AI)
│   │   ├── reviews/               # Reseñas y calificaciones
│   │   ├── routes/                # Rutas de desarrollo
│   │   ├── storage/               # Almacenamiento de archivos (GCS/local)
│   │   └── users/                 # Gestión de usuarios y dependientes
│   └── types/                     # Tipos TypeScript adicionales
├── docs/                          # Documentación existente
├── scripts/                       # Scripts utilitarios
├── test/                          # Tests e2e
├── uploads/                       # Directorio de uploads local
├── Dockerfile                     # Build multi-stage
├── docker-compose.yml             # Desarrollo local
├── deploy.sh                      # Script de despliegue GCP
├── firebase.json                  # Configuración Firebase
├── firestore.rules                # Reglas de Firestore
└── firestore.indexes.json         # Índices compuestos
```

---

## 13. Testing

### Comandos

```bash
pnpm test           # Ejecutar todos los tests unitarios
pnpm test:watch     # Modo watch (desarrollo)
pnpm test:cov       # Con cobertura de código
pnpm test:e2e       # Tests end-to-end
```

### Archivos de Test

El proyecto tiene **56 archivos de test** detectados, incluyendo:
- Tests unitarios por módulo (`*.spec.ts`)
- Tests de guards (`feature.guard.spec.ts`, `limit-dependientes.guard.spec.ts`, etc.)
- Tests e2e (`test/`)

### Convenciones de Testing

- Framework: **Jest** con `@swc/jest` para compilación rápida
- Supertest para tests HTTP
- Mocks de Firestore y Firebase Auth
- Cobertura de código disponible vía `pnpm test:cov`

---

## 14. Guías de Uso

### 14.1 Para el Frontend

1. **Autenticación:** Usar cookies httpOnly para el token de acceso. El guard acepta tanto cookies como header Bearer.
2. **Paginación:** Todos los listados usan `?pagina=1&limite=20` y retornan `{ datos, paginacion }`.
3. **Caché:** Los endpoints GET soportan ETag. Enviar `If-None-Match` para recibir `304 Not Modified`.
4. **Feature Flags:** Antes de mostrar funcionalidades, verificar en el perfil del usuario si están habilitadas.
5. **Errores:** Retornan `{ statusCode, message }` con código HTTP apropiado.

### 14.2 Para el Líder de Proyecto

- **Swagger interactivo:** Disponible en `/docs` con todos los endpoints documentados.
- **Monitorización:** Health check en `/api/health`, analytics en admin.
- **Escalabilidad:** Firestore escala automáticamente. Rate limiting protege contra abuso.
- **Costos:** Vertex AI cobra por token. El sistema tiene fallback mock para desarrollo.
- **Seguridad:** Todos los secretos en GCP Secret Manager. Nunca en código o Docker images.

### 14.3 Checklist de Entrega

Antes de cada deploy:
1. ✅ `tsc --noEmit` — cero errores de tipos
2. ✅ `pnpm test` — todos los tests pasan
3. ✅ `pnpm build` — build exitoso
4. ✅ Secretos actualizados en GCP Secret Manager
5. ✅ Firestore indexes desplegados

---

*Documentación generada automáticamente. Para más detalles, consultar Swagger UI en `/docs` o el código fuente en `src/`.*
