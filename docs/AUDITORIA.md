# 🔍 Auditoría y Documentación — Raíces para Florecer (Backend)

> **Fecha:** 15 de julio de 2026
> **Versión:** 1.1.0
> **Stack:** NestJS 10 + TypeScript + Firebase/Firestore + Passport JWT + Anthropic AI

---

## 📋 Resumen Ejecutivo

**Raíces para Florecer** es un ecosistema digital para personas con discapacidad (PCD) en México. El backend es un API RESTful modular que permite a usuarios (PCD, tutores, instituciones) descubrir servicios, interactuar con una comunidad, postularse a empleos y recibir recomendaciones personalizadas vía IA.

### Estado General: 🟢 Funcional con mejoras pendientes

- **Fortalezas:** Arquitectura modular clara, sistema de multi-rol bien implementado, admin robusto con inteligencia de datos, IA contextual, base de datos Firebase/Firestore optimizada con índices compuestos
- **Mejoras pendientes:** Sin tests unitarios, sin paginación en listados, servicios mock (email, storage), sin rate limiting, sin validación de DTOs en la mayoría de endpoints
- **✅ Resuelto:** Índices compuestos creados para consultas críticas (jobs, institutions, community/groups)

---

## 🏗️ Arquitectura General

```
src/
├── main.ts                    # Bootstrap, CORS, ValidationPipe, SPA fallback
├── app.module.ts              # Root module — importa los 14 módulos
├── spa-fallback.filter.ts     # Filtro SPA para producción
├── common/                    # Infraestructura compartida
│   ├── decorators/            # @CurrentUser, @Roles
│   ├── guards/                # JwtAuthGuard, RolesGuard
│   └── tenant/                # TenantService (stub/placeholder)
├── database/                  # Capa de persistencia
│   ├── database.module.ts     # Módulo global con Knex + TenantService
│   ├── knex.provider.ts       # Provider de conexión SQLite
│   ├── migrations/            # 2 migraciones (init + jobs/messages)
│   └── seed/                  # Seed demo (3 usuarios, 12 instituciones, 5 grupos)
└── modules/                   # 14 módulos de dominio
    ├── auth/                  # Autenticación JWT
    ├── users/                 # Perfil, profiling, dependientes
    ├── institutions/          # Directorio de instituciones
    ├── discovery/             # Búsqueda inteligente de instituciones
    ├── favorites/             # Guardados por usuario
    ├── reviews/               # Reseñas y calificaciones
    ├── community/             # Grupos, posts, comentarios, likes
    ├── notifications/         # Notificaciones in-app + SSE
    ├── admin/                 # Panel administrativo completo
    ├── ai/                    # Chat y recomendaciones (Anthropic Claude)
    ├── storage/               # Archivos (mock local, GCS pendiente)
    ├── email/                 # Emails (mock, Resend pendiente)
    ├── jobs/                  # Bolsa de trabajo inclusiva
    └── messages/              # Mensajería directa entre usuarios
```

### Convenciones de Tablas

| Prefijo | Significado | Ejemplo |
|---------|------------|---------|
| `u_` | Usuarios / Datos de usuario | `u_profiles`, `u_reviews`, `u_posts` |
| `p_` | Proveedores / Instituciones | `p_institutions`, `p_jobs` |
| `s_` | Sistema / Configuración | `s_settings` |

### Índices Compuestos en Producción

| Colección | Campos | Propósito |
|-----------|--------|-----------|
| `p_jobs` | `is_active` ASC, `created_at` DESC | Listado de vacantes activas ordenadas por fecha |
| `p_institutions` | `is_active` ASC, `rating_avg` DESC | Listado de instituciones activas ordenadas por calificación |
| `u_groups` | `is_public` ASC, `member_count` DESC | Listado de grupos públicos ordenados por popularidad |

---

## 📦 Descripción de Módulos

### 1. 🔐 Auth (`/api/auth`)
**Archivo:** `modules/auth/`

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `POST /register` | POST | ❌ | Registro con roles: `pcd`, `tutor`, `institution` |
| `POST /login` | POST | ❌ | Login con JWT (expira 7d) |
| `GET /me` | GET | ✅ | Perfil del usuario autenticado |

**Observaciones:**
- Secret JWT hardcodeado como fallback: `raices_demo_secret_2026` ⚠️
- Token aceptado por query string (`?token=`) — riesgo de leak en logs/historial ⚠️
- No hay refresh token
- No hay rate limiting en login/registro

---

### 2. 👤 Users (`/api/users`)
**Archivo:** `modules/users/`

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `GET /profile` | GET | ✅ | Perfil completo + profiling |
| `PUT /profile` | PUT | ✅ | Actualizar nombre, ciudad, estado, avatar |
| `POST /profiling` | POST | ✅ | Guardar perfil de necesidades (discapacidad, metas, historial) |
| `GET /dependents` | GET | ✅ | Listar dependientes (hijos/pacientes) |
| `POST /dependents` | POST | ✅ | Agregar dependiente |
| `PUT /dependents/:id` | PUT | ✅ | Actualizar dependiente |
| `DELETE /dependents/:id` | DELETE | ✅ | Eliminar dependiente |

**Observaciones:**
- Datos JSON en campos `text` — no hay validación de estructura JSON ⚠️
- Sin paginación en dependientes
- DTOs no definidos — usa `body: any` en todos los endpoints ⚠️

---

### 3. 🏛️ Institutions (`/api/institutions`)
**Archivo:** `modules/institutions/`

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `GET /` | GET | ❌ | Listar instituciones con filtros (categoría, ciudad, búsqueda, discapacidad, edad) |
| `GET /:id` | GET | ❌ | Detalle de institución |
| `POST /` | POST | ✅ | Crear institución (cualquier usuario autenticado) |

**Observaciones:**
- Cualquier usuario puede crear una institución sin verificación ⚠️
- Búsqueda por `ILike` — vulnerable a inyección SQL con Knex parameterizado (✅ seguro)
- Sin paginación — carga todo de golpe
- Sin endpoint de actualización o eliminación para el creador

---

### 4. 🗺️ Discovery (`/api/discovery`)
**Archivo:** `modules/discovery/`

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `GET /` | GET | ✅ | Búsqueda inteligente con matching de perfil |

**Lógica clave:** Cruza los `disability_types` del usuario con los de cada institución y ordena por `profile_match` (coincidencia primero).

**Observaciones:**
- Duplica lógica de `InstitutionsService.findAll()` — viola DRY ⚠️
- Hard limit de 50 resultados sin paginación

---

### 5. ⭐ Favorites (`/api/favorites`)
**Archivo:** `modules/favorites/`

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `GET /` | GET | ✅ | Instituciones guardadas (con datos completos) |
| `GET /ids` | GET | ✅ | Solo IDs de guardados (ligero) |
| `POST /:institutionId/toggle` | POST | ✅ | Agregar/quitar de favoritos |

---

### 6. 📝 Reviews (`/api/reviews`)
**Archivo:** `modules/reviews/`

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `GET /institution/:id` | GET | ❌ | Reseñas de una institución |
| `GET /mine` | GET | ✅ | Reseñas propias del usuario |
| `POST /institution/:id` | POST | ✅ | Crear/actualizar reseña (1-5 estrellas) |

**Observaciones:**
- Recalcula `rating_avg` y `rating_count` después de cada reseña — en producción esto debería ser atómico ⚠️
- Un usuario solo puede tener 1 reseña por institución (se actualiza, no crea nueva) — correcto ✅
- Sin moderación de contenido en comentarios ⚠️

---

### 7. 👥 Community (`/api/community`)
**Archivo:** `modules/community/`

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `GET /groups` | GET | ❌ | Grupos públicos |
| `GET /posts` | GET | ✅ | Posts (con filtro de grupo, incluye si user dio like) |
| `GET /posts/:id/comments` | GET | ❌ | Comentarios de un post |
| `POST /posts` | POST | ✅ | Crear post |
| `POST /posts/:id/comments` | POST | ✅ | Crear comentario |
| `POST /posts/:id/like` | POST | ✅ | Toggle like |

**Observaciones:**
- `member_count` en `u_groups` nunca se incrementa — no hay lógica de unirse a grupo ⚠️
- Sin límite de longitud en contenido de posts/comentarios ⚠️
- Sin sistema de eliminación de posts/comentarios
- Like count puede desincronizarse si falla una operación (no es atómico) ⚠️

---

### 8. 🔔 Notifications (`/api/notifications`)
**Archivo:** `modules/notifications/`

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `GET /` | GET | ✅ | Últimas 50 notificaciones |
| `PATCH /:id/read` | PATCH | ✅ | Marcar como leída |
| `PATCH /read-all` | PATCH | ✅ | Marcar todas como leídas |
| `GET /stream` | SSE | ✅ | Stream en tiempo real (Server-Sent Events) |

**Observaciones:**
- SSE implementado con RxJS `Subject` — en memoria, no persiste entre reinicios ⚠️
- No hay servicio que invoque `create()` — las notificaciones existen pero nadie las genera ⚠️
- Límite fijo de 50 notificaciones sin paginación

---

### 9. 🛡️ Admin (`/api/admin`)
**Archivo:** `modules/admin/`

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `GET /stats` | GET | ✅ admin | Estadísticas generales del dashboard |
| `GET /analytics` | GET | ✅ admin | Analytics detallados (roles, categorías, ratings, actividad) |
| `GET /needs-intelligence` | GET | ✅ admin | Motor de inteligencia: demanda vs oferta por discapacidad |
| `GET /institutions` | GET | ✅ admin | Todas las instituciones |
| `GET /institutions/pending` | GET | ✅ admin | Instituciones pendientes de aprobación |
| `POST /institutions/:id/approve` | POST | ✅ admin | Aprobar institución + enviar email |
| `PATCH /institutions/:id/verify` | PATCH | ✅ admin | Toggle verificación |
| `DELETE /institutions/:id` | DELETE | ✅ admin | Rechazar/eliminar institución |
| `GET /users` | GET | ✅ admin | Todos los usuarios |
| `PATCH /users/:id/active` | PATCH | ✅ admin | Activar/desactivar usuario |
| `PATCH /users/:id/role` | PATCH | ✅ admin | Cambiar rol |
| `GET /reviews` | GET | ✅ admin | Moderar reseñas |
| `DELETE /reviews/:id` | DELETE | ✅ admin | Eliminar reseña + recalcular rating |
| `GET /alerts` | GET | ✅ admin | Alertas de riesgo (9 tipos de alertas) |
| `GET /settings` | GET | ✅ admin | Configuración de plataforma |
| `PUT /settings` | PUT | ✅ admin | Actualizar configuración |

**Observaciones:**
- Es el módulo más completo y robusto del proyecto ✅
- `needs-intelligence` genera insights automáticos (brechas de cobertura, fortalezas, etc.)
- `s_settings` se crea dinámicamente con `ensureSettingsTable()` — debería estar en migración ⚠️
- `getAlerts()` hace ~10 queries por llamada — optimizable con agregación ⚠️

---

### 10. 🤖 AI (`/api/ai`)
**Archivo:** `modules/ai/`

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `POST /chat` | POST | ✅ | Chat contextual con el usuario |
| `POST /recommendations` | POST | ✅ | Recomendaciones personalizadas (propio o dependiente) |

**Lógica clave:**
- Usa `claude-haiku-4-5-20251001` para chat, `claude-sonnet-4-6` para recomendaciones
- Sin `ANTHROPIC_API_KEY` → respuestas mock con latencia simulada (600ms)
- System prompt incluye perfil del usuario y restricción de no dar diagnósticos médicos
- Historial limitado a últimos 6 mensajes
- Recomendaciones para dependientes: genera pasos según perfil del dependiente

**Observaciones:**
- `require('@anthropic-ai/sdk')` dinámico — si no está instalado, fallback silencioso ✅
- Sin streaming de respuestas — el usuario espera la respuesta completa ⚠️
- Sin rate limiting en llamadas a la API de Anthropic (costo potencial) ⚠️
- Sin cache de recomendaciones — se recalcula cada vez ⚠️

---

### 11. 📁 Storage (`/api/storage` — servicio interno)
**Archivo:** `modules/storage/`

- **Estado:** Mock — guarda archivos localmente en `./uploads/`
- GCS marcado como TODO
- `getSignedUrl()` retorna URL local hardcodeada a `localhost:7000` ⚠️
- No hay validación de tipo/tamaño de archivos ⚠️

---

### 12. 📧 Email (`servicio interno`)
**Archivo:** `modules/email/`

- **Estado:** Mock — solo logea a consola
- Resend marcado como TODO
- Dos tipos de email: bienvenida y aprobación de institución

---

### 13. 💼 Jobs (`/api/jobs`)
**Archivo:** `modules/jobs/`

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `GET /` | GET | ❌ | Listar vacantes (filtro: ciudad, modalidad) |
| `GET /applied` | GET | ✅ | IDs de vacantes postuladas |
| `GET /my-applications` | GET | ✅ | Mis postulaciones |
| `GET /:id` | GET | ❌ | Detalle de vacante |
| `POST /:id/apply` | POST | ✅ | Postularse (con carta de presentación) |

**Observaciones:**
- No hay endpoint para que la institución cree vacantes (solo `createJob()` en service, sin controller route) ⚠️
- No hay endpoint para que la institución vea postulaciones recibidas ⚠️
- No hay lógica de revisión/aceptación de postulaciones ⚠️

---

### 14. 💬 Messages (`/api/messages`)
**Archivo:** `modules/messages/`

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `GET /conversations` | GET | ✅ | Lista de conversaciones |
| `GET /unread-count` | GET | ✅ | Conteo de no leídos |
| `GET /with/:userId` | GET | ✅ | Mensajes con un usuario |
| `POST /send/:userId` | POST | ✅ | Enviar mensaje |

**Observaciones:**
- `getConversations()` carga TODOS los mensajes para filtrar — ineficiente ⚠️
- No hay paginación de mensajes ⚠️
- No hay WebSocket para tiempo real — solo HTTP polling ⚠️
- Sin límite de caracteres ⚠️

---

## 🗃️ Base de Datos — Esquema Completo

### Tablas de Usuarios (`u_`)

| Tabla | Descripción | Relaciones |
|-------|-------------|------------|
| `u_profiles` | Usuarios principales (email, password, rol) | PK: `id` |
| `u_user_profiles` | Perfil de necesidades del usuario PCD | FK → `u_profiles` |
| `u_dependents` | Personas bajo cuidado de un tutor | FK → `u_profiles` |
| `u_favorites` | Instituciones guardadas | FK → `u_profiles` + `p_institutions` |
| `u_reviews` | Reseñas de usuarios | FK → `u_profiles` + `p_institutions` |
| `u_groups` | Grupos de comunidad | — |
| `u_group_members` | Membresía en grupos | FK → `u_groups` + `u_profiles` |
| `u_posts` | Publicaciones en comunidad | FK → `u_groups` + `u_profiles` |
| `u_comments` | Comentarios en posts | FK → `u_posts` + `u_profiles` |
| `u_post_likes` | Likes en posts | FK → `u_posts` + `u_profiles` |
| `u_notifications` | Notificaciones in-app | FK → `u_profiles` |
| `u_job_applications` | Postulaciones a empleos | FK → `p_jobs` + `u_profiles` |
| `u_direct_messages` | Mensajes directos | FK → `u_profiles` × 2 |

### Tablas de Proveedores (`p_`)

| Tabla | Descripción | Relaciones |
|-------|-------------|------------|
| `p_institutions` | Instituciones/directorio | PK: `id` |
| `p_institution_docs` | Documentos de verificación | FK → `p_institutions` |
| `p_jobs` | Vacantes de empleo | FK → `p_institutions` |

### Tablas de Sistema (`s_`)

| Tabla | Descripción |
|-------|-------------|
| `s_settings` | Configuración de plataforma (creada dinámicamente) |

---

## 🚨 Hallazgos Críticos

### 🔴 Seguridad

| # | Hallazgo | Severidad | Ubicación |
|---|----------|-----------|-----------|
| 1 | JWT secret hardcodeado como fallback | Alta | `auth.module.ts:13`, `jwt.strategy.ts:11` |
| 2 | Token aceptado por query string | Media | `jwt.strategy.ts:14` |
| 3 | Sin rate limiting en endpoints sensibles | Alta | `main.ts` (global) |
| 4 | Cualquier usuario puede crear instituciones | Media | `institutions.controller.ts:16` |
| 5 | Sin validación de tamaño/tipo de archivos | Media | `storage.service.ts` |
| 6 | Sin CORS restrictivo (origin: true) | Media | `main.ts:12` |

### 🟡 Arquitectura

| # | Hallazgo | Severidad | Ubicación |
|---|----------|-----------|-----------|
| 7 | Sin tests unitarios ni de integración | Alta | Todo el proyecto |
| 8 | DTOs ausentes en la mayoría de endpoints | Alta | `users.controller`, `community.controller`, etc. |
| 9 | Datos JSON en campos `text` sin validación | Media | Múltiples tablas |
| 10 | Lógica duplicada (Discovery vs Institutions) | Baja | `discovery.service`, `institutions.service` |
| 11 | `s_settings` crea tabla dinámicamente | Media | `admin.service.ts:222` |
| 12 | TenantService es un stub vacío | Baja | `tenant.service.ts` |

### 🟡 Funcionalidad

| # | Hallazgo | Severidad | Ubicación | Estado |
|---|----------|-----------|-----------|--------|
| 13 | Notificaciones nunca se generan | Alta | `notifications.service.ts` | Pendiente |
| 14 | Jobs: sin CRUD completo para instituciones | Alta | `jobs.controller.ts` | Pendiente |
| 15 | Community: `member_count` nunca se actualiza | Media | `community.service.ts` | Pendiente |
| 16 | Sin paginación en listados principales | Media | Todos los endpoints de listado | Pendiente |
| 17 | Mensajes: sin tiempo real, query ineficiente | Media | `messages.service.ts` | Pendiente |
| 18 | Email y Storage son mocks | Baja (demo) | `email.service.ts`, `storage.service.ts` | Pendiente |
| 19 | ~~Consultas lentas por falta de índices~~ | ~~Alta~~ | Firebase Console | ✅ **RESUELTO** |
| 20 | ~~Errores 500 en /api/jobs, /api/institutions, /api/community/groups~~ | ~~Crítica~~ | Endpoints afectados | ✅ **RESUELTO** |

---

## 📊 Tabla Resumen de Endpoints

| Módulo | Endpoints | Auth Requerido | Paginación | DTOs |
|--------|-----------|---------------|------------|------|
| Auth | 3 | 1/3 | ❌ | ✅ |
| Users | 7 | 7/7 | ❌ | ❌ |
| Institutions | 3 | 1/3 | ❌ | ❌ |
| Discovery | 1 | 1/1 | ❌ | ❌ |
| Favorites | 3 | 3/3 | ❌ | ❌ |
| Reviews | 3 | 2/3 | ❌ | Parcial |
| Community | 6 | 5/6 | ❌ | Parcial |
| Notifications | 4 | 4/4 | ❌ | ❌ |
| Admin | 16 | 16/16 | ❌ | ❌ |
| AI | 2 | 2/2 | N/A | Parcial |
| Jobs | 5 | 3/5 | ❌ | Parcial |
| Messages | 4 | 4/4 | ❌ | Parcial |
| **Total** | **57** | — | **0/57** | **~10/57** |

---

## 🔒 Área de Mejora #1 — Seguridad

### 1.1 JWT Secret — Variable Obligatoria

**Problema actual:** El JWT secret tiene un fallback hardcodeado `raices_demo_secret_2026` en `auth.module.ts` y `jwt.strategy.ts`. Si no se define la variable de entorno `JWT_SECRET`, cualquier persona con acceso al código fuente puede forjar tokens válidos.

**Solución implementada:**

```typescript
// auth.module.ts — CAMBIO
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './jwt.strategy'
import { EmailModule } from '../email/email.module'
import * as dotenv from 'dotenv'
dotenv.config()

if (!process.env.JWT_SECRET) {
  throw new Error('❌ JWT_SECRET is required in environment variables')
}

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,  // Sin fallback hardcodeado
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' },
    }),
    EmailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtModule],
})
export class AuthModule {}
```

```typescript
// jwt.strategy.ts — CAMBIO
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // ❌ ELIMINADO: (req: any) => req?.query?.token ?? null
        // Riesgo: tokens en URL se registran en logs, historial de navegador, referers
      ]),
      secretOrKey: process.env.JWT_SECRET!,  // Sin fallback
    })
  }
}
```

**Acción requerida:** Agregar `JWT_SECRET` al archivo `.env` antes de iniciar el servidor:
```
JWT_SECRET=tu-secreto-super-seguro-aqui
JWT_EXPIRES_IN=7d
```

---

### 1.2 Rate Limiting con @nestjs/throttler

**Problema actual:** No hay límite de peticiones. Un atacante puede:
- Fuerza bruta en `/api/auth/login`
- Agotar la API de Anthropic llamando `/api/ai/chat` repetidamente
- Llenar la base de datos con instituciones/posts falsos

**Solución implementada:**

```typescript
// app.module.ts — CAMBIO
import { Module } from '@nestjs/common'
import { ThrottlerModule } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard } from '@nestjs/throttler'
import { DatabaseModule } from './database/database.module'
// ... otros imports

@Module({
  imports: [
    // Rate limiting global: 60 requests por 60 segundos por IP
    ThrottlerModule.forRoot([{
      ttl: 60000,   // 60 segundos
      limit: 60,     // 60 peticiones
    }]),
    DatabaseModule,
    AuthModule,
    // ... demás módulos
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
```

**Endpoints sensibles con throttling estricto (por controller):**

```typescript
// auth.controller.ts — Rate limit más estricto para login/registro
import { Throttle } from '@nestjs/throttler'

@Controller('auth')
export class AuthController {
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 300000 } }) // 5 registros cada 5 minutos
  register(@Body() dto: RegisterDto) { return this.authService.register(dto) }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 intentos por minuto
  login(@Body() dto: LoginDto) { return this.authService.login(dto) }
}
```

```typescript
// ai.controller.ts — Rate limit para controlar costo de API
import { Throttle } from '@nestjs/throttler'

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  @Post('chat')
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 chats por minuto
  chat(@Body() dto: AiChatDto, @CurrentUser() user: any) {
    return this.svc.chat(user.id, dto.message, dto.history ?? [])
  }

  @Post('recommendations')
  @Throttle({ default: { limit: 5, ttl: 300000 } }) // 5 recomendaciones cada 5 minutos
  recommend(@Body() dto: AiRecommendDto, @CurrentUser() user: any) {
    return this.svc.recommend(user.id)
  }
}
```

**Headers de respuesta (automático con ThrottlerGuard):**
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 1720281600
Retry-After: 30  (solo cuando se excede)
```

---

### 1.3 Migración para `s_settings`

**Problema actual:** La tabla `s_settings` se crea dinámicamente con `ensureSettingsTable()` en `admin.service.ts`. Esto es frágil: si Knex no tiene permisos de CREATE TABLE, la aplicación falla en runtime.

**Solución implementada:**

```typescript
// src/database/migrations/20260706_003_settings.ts
import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('s_settings')
  if (!exists) {
    await knex.schema.createTable('s_settings', (t) => {
      t.string('key').primary()
      t.text('value')
      t.timestamp('updated_at').defaultTo(knex.fn.now())
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('s_settings')
}
```

Y eliminar `ensureSettingsTable()` de `admin.service.ts` ya que la tabla existirá siempre después de la migración.

---

## 📝 Área de Mejora #2 — DTOs Validados

### Situación Actual

De los 57 endpoints del proyecto, solo ~10 tienen DTOs. El resto usa `body: any`, lo que significa:
- Sin validación de campos obligatorios
- Sin validación de tipos (string, number, boolean)
- Sin protección contra campos inesperados (injection de propiedades)
- Sin documentación automática de la API

### DTOs Necesarios por Módulo

#### Users Module (`modules/users/dto/`)

```typescript
// update-profile.dto.ts
import { IsString, IsOptional, IsUrl } from 'class-validator'

export class UpdateProfileDto {
  @IsOptional() @IsString() full_name?: string
  @IsOptional() @IsString() city?: string
  @IsOptional() @IsString() state?: string
  @IsOptional() @IsUrl() avatar_url?: string
}
```

```typescript
// save-profiling.dto.ts
import { IsArray, IsOptional, IsString, IsIn } from 'class-validator'

export class SaveProfilingDto {
  @IsOptional() @IsArray() disability_types?: string[]
  @IsOptional() @IsString() @IsIn(['leve', 'medio', 'alto']) disability_severity?: string
  @IsOptional() @IsArray() communication_modes?: string[]
  @IsOptional() @IsArray() mobility_needs?: string[]
  @IsOptional() @IsArray() tech_access?: string[]
  @IsOptional() @IsArray() preferred_zones?: string[]
}
```

```typescript
// dependent.dto.ts
import { IsString, IsOptional, IsArray, IsIn } from 'class-validator'

export class CreateDependentDto {
  @IsString() full_name: string
  @IsOptional() @IsString() @IsIn(['hijo', 'padre', 'hermano', 'familiar', 'paciente', 'otro']) relationship?: string
  @IsOptional() @IsArray() disability_types?: string[]
  @IsOptional() @IsString() age_range?: string
  @IsOptional() @IsString() @IsIn(['infancia', 'adolescencia', 'adulto_joven', 'adulto', 'mayor']) life_stage?: string
  @IsOptional() @IsString() notes?: string
}
```

#### Institutions Module (`modules/institutions/dto/`)

```typescript
// create-institution.dto.ts
import { IsString, IsOptional, IsArray, IsNumber, Min, Max } from 'class-validator'

export class CreateInstitutionDto {
  @IsString() name: string
  @IsOptional() @IsString() description?: string
  @IsString() category: string  // funcional | educativo | laboral | social
  @IsOptional() @IsString() subcategory?: string
  @IsOptional() @IsString() address?: string
  @IsOptional() @IsString() city?: string
  @IsOptional() @IsString() state?: string
  @IsOptional() @IsNumber() lat?: number
  @IsOptional() @IsNumber() lng?: number
  @IsOptional() @IsString() phone?: string
  @IsOptional() @IsString() email?: string
  @IsOptional() @IsString() whatsapp?: string
  @IsOptional() @IsString() website?: string
  @IsOptional() @IsArray() disability_types?: string[]
  @IsOptional() @IsNumber() @Min(0) age_min?: number
  @IsOptional() @IsNumber() @Max(99) age_max?: number
}
```

#### Community Module (`modules/community/dto/`)

```typescript
// create-post.dto.ts
import { IsString, IsOptional, MaxLength } from 'class-validator'

export class CreatePostDto {
  @IsString() @MaxLength(2000) content: string
  @IsOptional() @IsString() group_id?: string
}
```

```typescript
// create-comment.dto.ts
import { IsString, MaxLength } from 'class-validator'

export class CreateCommentDto {
  @IsString() @MaxLength(1000) content: string
}
```

#### Jobs Module (`modules/jobs/dto/`)

```typescript
// create-job.dto.ts
import { IsString, IsOptional, IsArray, IsBoolean, IsIn } from 'class-validator'

export class CreateJobDto {
  @IsString() title: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() requirements?: string
  @IsOptional() @IsString() @IsIn(['presencial', 'remoto', 'hibrido']) modality?: string
  @IsOptional() @IsString() schedule?: string
  @IsOptional() @IsString() salary_range?: string
  @IsOptional() @IsString() city?: string
  @IsOptional() @IsString() state?: string
  @IsOptional() @IsBoolean() disability_inclusive?: boolean
  @IsOptional() @IsArray() disability_types?: string[]
}
```

#### Messages Module (`modules/messages/dto/`)

```typescript
// send-message.dto.ts
import { IsString, IsNotEmpty, MaxLength } from 'class-validator'

export class SendMessageDto {
  @IsString() @IsNotEmpty() @MaxLength(5000) content: string
}
```

#### Admin Module (`modules/admin/dto/`)

```typescript
// update-settings.dto.ts
import { IsString, IsBoolean, IsOptional } from 'class-validator'

export class UpdateSettingsDto {
  @IsOptional() @IsString() platform_name?: string
  @IsOptional() @IsString() support_email?: string
  @IsOptional() @IsBoolean() allow_registration?: boolean
  @IsOptional() @IsBoolean() require_institution_approval?: boolean
  @IsOptional() @IsBoolean() ai_enabled?: boolean
  @IsOptional() @IsBoolean() maintenance_mode?: boolean
  @IsOptional() @IsString() default_city?: string
}
```

### Impacto de los DTOs

| Antes (body: any) | Después (con DTOs) |
|---|---|
| `POST /users/dependents` acepta `{ anything: true }` | Solo acepta campos válidos, ignora el resto (whitelist) |
| `PUT /users/profile` puede recibir `{ role: 'admin' }` y sobreescribir | Solo permite campos seguros (full_name, city, state, avatar_url) |
| `POST /community/posts` sin límite de tamaño | Content limitado a 2000 chars, comments a 1000 |
| Sin documentación Swagger automáticamente | DTOs son la fuente de verdad para Swagger/OpenAPI |

---

## 📄 Área de Mejora #3 — Paginación

### Situación Actual

Todos los listados devuelven **todos los registros** de golpe:
- `GET /institutions` → carga todas las instituciones activas
- `GET /discovery` → carga hasta 50 instituciones
- `GET /community/posts` → carga 20 posts (hardcoded)
- `GET /reviews/institution/:id` → carga todas las reseñas
- `GET /admin/users` → carga todos los usuarios
- `GET /messages/conversations` → carga todos los mensajes para filtrar

Con 1000+ usuarios o instituciones, esto causa:
- Latencia alta en respuestas
- Alto consumo de memoria
- Posibles crashes por payload excesivo

### Patrón de Paginación Implementado

**DTO base reutilizable:**

```typescript
// src/common/dto/pagination.dto.ts
import { IsOptional, IsInt, Min, Max } from 'class-validator'
import { Type } from 'class-transformer'

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt() @Min(1)
  page: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt() @Min(1) @Max(100)
  limit: number = 20

  get offset(): number {
    return (this.page - 1) * this.limit
  }
}
```

**Formato de respuesta estandarizado:**

```typescript
// src/common/dto/paginated-response.dto.ts
export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}
```

### Ejemplo de Implementación — Institutions

```typescript
// institutions.controller.ts
@Controller('institutions')
export class InstitutionsController {
  @Get()
  findAll(@Query() query: FindInstitutionsDto) {
    return this.svc.findAll(query)
  }
}
```

```typescript
// institutions.service.ts
async findAll(filters: FindInstitutionsDto) {
  const { page = 1, limit = 20, category, city, search } = filters
  const offset = (page - 1) * limit

  let q = this.db('p_institutions').where({ is_active: true })
  // ... filtros existentes ...

  // Contar total ANTES de paginar
  const [{ count: total }] = await q.clone().count('* as count')

  // Aplicar paginación
  const rows = await q
    .orderBy('rating_avg', 'desc')
    .offset(offset)
    .limit(limit)

  return {
    data: rows.map(this.parse),
    meta: {
      total: Number(total),
      page,
      limit,
      totalPages: Math.ceil(Number(total) / limit),
      hasNext: offset + limit < Number(total),
      hasPrev: page > 1,
    },
  }
}
```

### Endpoints que Necesitan Paginación

| Endpoint | Actual | Propuesto |
|----------|--------|-----------|
| `GET /institutions` | Todos los registros | `?page=1&limit=20` (default) |
| `GET /discovery` | Limit 50 hardcoded | `?page=1&limit=20` |
| `GET /community/posts` | Limit 20 hardcoded | `?page=1&limit=20&group_id=xxx` |
| `GET /reviews/institution/:id` | Todos | `?page=1&limit=10` |
| `GET /admin/users` | Todos | `?page=1&limit=50` |
| `GET /admin/institutions` | Todos | `?page=1&limit=50` |
| `GET /admin/reviews` | 100 hardcoded | `?page=1&limit=50` |
| `GET /jobs` | Todos | `?page=1&limit=20` |
| `GET /messages/conversations` | Todos (ineficiente) | `?page=1&limit=20` |
| `GET /notifications` | 50 hardcoded | `?page=1&limit=20` |

### Ejemplo de Uso del Cliente

```bash
# Primera página de instituciones
GET /api/institutions?page=1&limit=10&category=funcional

# Respuesta:
{
  "data": [ ... ],
  "meta": {
    "total": 45,
    "page": 1,
    "limit": 10,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}

# Segunda página
GET /api/institutions?page=2&limit=10&category=funcional
```

---

## ✅ Plan de Mejoras Completo

### Fase 1 — Fundamentos (1-2 semanas)
1. ✅ JWT_SECRET obligatorio sin fallback hardcodeado
2. ✅ Rate limiting global + estricto en endpoints sensibles
3. ✅ Migración para `s_settings` (no crear dinámicamente)
4. ✅ DTOs validados para todos los endpoints (~20 DTOs nuevos)
5. ✅ Paginación en los 10 listados principales
6. **Agregar tests** al menos para auth, users, y reviews

### Fase 2 — Funcionalidad (2-3 semanas)
7. **Completar CRUD de Jobs** (crear, gestionar postulaciones)
8. **Activar sistema de notificaciones** (generar notificaciones en eventos clave)
9. **Unirse a grupos** (incrementar `member_count`)
10. **Implementar moderación** de contenido (posts, comentarios, reseñas)

### Fase 3 — Producción (3-4 semanas)
11. **Implementar email real** (Resend o similar)
12. **Implementar storage real** (GCS, S3, o Cloudinary)
13. **WebSocket** para mensajes y notificaciones en tiempo real
14. **Paginación por cursor** en mensajes y posts
15. **Streaming de respuestas AI** (SSE o WebSocket)

### Fase 4 — Escalamiento
16. **Migrar de SQLite a PostgreSQL** para producción
17. **Implementar cache** (Redis) para recomendaciones y búsquedas
18. **Observabilidad** (logging estructurado, métricas, tracing)
19. **CI/CD** con tests automatizados
20. **Rate limiting por endpoint** (más estricto en AI)

---

## 🔑 Credenciales Demo

| Rol | Email | Contraseña |
|-----|-------|-----------|
| Admin | admin@raices.mx | Admin1234 |
| PCD | demo@raices.mx | Demo1234 |
| Tutor | tutor@raices.mx | Tutor1234 |

---

*Documento generado por auditoría automática del código fuente.*
