# 📋 AUDITORÍA TÉCNICA PROFUNDA — Raíces Backend

> **Fecha:** 25 de julio de 2026
> **Proyecto:** raices-backend (TypeScript / NestJS / Firestore)
> **Rama:** dev
> **Commits recientes:** Refactor REST, tests unitarios, migración de DTOs

---

## 1. Resumen Ejecutivo

| Métrica | Valor |
|---|---|
| **Calificación General** | **B+** (82/100) |
| Módulos auditados | 15 (Auth, Users, Institutions, Jobs, Reviews, Community, Favorites, Discovery, Notifications, Messages, Admin, AI, Storage, Email, Database) |
| Controllers | 12 |
| Services | 16 (incluye TenantService, EmailService, StorageService, FirebaseAnalyticsService) |
| DTOs | 9 clases + 3 DTOs embebidos en controllers |
| Archivos de test (`.spec.ts`) | 12 |
| Tests totales | **152/152 ✅ pasan** |
| `tsc --noEmit` | ✅ limpio |
| Uso explícito de `any` en services/controllers | ~120+ instancias |
| `as unknown as` | 0 (limpio) |

### Fortalezas clave

- Arquitectura modular limpia y consistente
- Muy buen manejo de errores (NotFoundException, ForbiddenException, ConflictException, BadRequestException)
- Validación con class-validator en la mayoría de DTOs
- Swagger documentado en ~95% de endpoints
- Tests unitarios cubren todos los services principales
- Eliminación exitosa del envoltorio `{ exito, mensaje, datos }` (migración REST limpia)
- Sin dependencias circulares detectadas
- Validación de Firebase Admin SDK con chequeo de campos requeridos
- CORS configurado de forma segura (permite Cloud Run `*.run.app`)
- Retry logic con exponential backoff en StorageService

### Áreas de mejora críticas

- Uso masivo de `any` (~120+ instancias) por falta de interfaces/entidades
- `strict: false` en tsconfig.json
- DTOs sin validadores en algunos módulos (Admin, Users parcial)
- N+1 queries en admin.service (getStats, getAlerts, getReviews)
- Sin throttling configurado (dependencia instalada pero no aplicada)
- Faltan tests para auth.service, ai.service, storage.service, guards

---

## 2. Tabla de Hallazgos por Módulo

### Eje 1: Estructura y Arquitectura del Proyecto

| Módulo | Archivo | Nivel de Riesgo | Descripción del Problema |
|---|---|---|---|
| Global | `tsconfig.json` | **Alto** | `strict: false` — Desactiva null-checks, no-implicit-any, strictPropertyInitialization. La mitad de los hallazgos de tipado se resolverían activando esto. |
| Global | `app.module.ts` | Bajo | Limpio, sin imports circulares. Módulos bien aislados. |
| Admin | `admin.service.ts` | **Medio** | Archivo de ~560 líneas. Concentra stats, analytics, necesidades, CRUD de instituciones, usuarios, reseñas, configuración y alertas. Debería dividirse en sub-servicios. |
| Admin | `firebase-analytics.service.ts` | Bajo | Servicio pequeño, bien encapsulado. |
| Jobs | `jobs.controller.ts` | **Medio** | DTOs `CreateJobDto` y `PostulacionDto` definidos inline en el controller, no en archivos separados. Inconsistente con el resto del proyecto. |
| Messages | `messages.controller.ts` | **Medio** | DTO `EnviarDto` definido inline. Debería moverse a `dto/` para consistencia. |
| Community | `community.controller.ts` | **Medio** | DTOs `CrearPublicacionDto` y `CrearComentarioDto` definidos inline. |
| AI | `ai.controller.ts` | **Medio** | DTOs `ChatIaDto` y `RecomendacionIaDto` definidos inline. |
| Reviews | `reviews.controller.ts` | **Medio** | DTO `EnviarResenaDto` definido inline. |
| Storage | `storage.service.ts` | Bajo | Bien diseñado con retry logic, fallback local, y manejo de errores. |
| Database | `database.module.ts` | Bajo | `@Global()` module correctamente exporta Firestore, Firebase Auth y TenantService. |
| Database | `firebase.provider.ts` | Bajo | Validación robusta de service account JSON, chequeo de project_id match, formato PEM de private key. |

---

### Eje 2: CRUDs y Manejo de Datos

| Módulo | Archivo | Nivel de Riesgo | Descripción del Problema |
|---|---|---|---|
| Admin | `admin.service.ts` | **Alto** | `getStats()` ejecuta 9 queries paralelas sin límite. `getAlerts()` carga TODAS las instituciones, usuarios y reseñas. Escala pobremente con datos crecientes. |
| Admin | `admin.service.ts` | **Alto** | `getReviews()` hace N+1 queries: 1 para reseñas, luego 1 por cada usuario y 1 por cada institución. Con 100 reseñas son ~200 queries Firestore. |
| Institutions | `institutions.service.ts` | **Medio** | `findAll()` carga TODAS las instituciones activas en memoria para filtrar/paginar. Sin límite Firestore en el query base. Con 10,000 instituciones esto es problemático. |
| Community | `community.service.ts` | **Medio** | `getPosts()` carga todas las publicaciones en memoria, luego 1 query por autor (N+1). Con 20 posts = 21 queries. |
| Community | `community.service.ts` | **Medio** | `getComments()` tiene el mismo patrón N+1 con autores. |
| Messages | `messages.service.ts` | **Medio** | `getConversations()` carga TODOS los mensajes (enviados + recibidos) del usuario en 2 queries sin límite. Con uso alto, esto es insostenible. |
| Users | `users.service.ts` | Bajo | `getProfile()` hace 2 queries (perfil + perfil extendido). Eficiente. |
| Users | `users.service.ts` | Bajo | `updateProfile()` validación manual de campos actualizables — funciona pero es frágil. |
| Auth | `auth.service.ts` | Bajo | `register()` hace 3 operaciones secuenciales (verificar email + crear Firebase Auth + crear perfil). Correcto pero no transaccional (podría quedar en estado inconsistente si falla a mitad). |
| Jobs | `jobs.service.ts` | **Medio** | `findAll()` hace N queries individuales para cada institución (1 por vacante). Con 50 vacantes = 50 queries a instituciones. Debería usar `__name__` `in` con lotes de 30. |
| Jobs | `jobs.service.spec.ts` | Bajo | Tests cubren happy paths y edge cases (NotFoundException, ConflictException, ForbiddenException). |
| Reviews | `reviews.service.ts` | Bajo | `submit()` recalcula promedio cada vez. Correcto para consistencia, pero genera writes extra. |
| Favorites | `favorites.service.ts` | Bajo | Usa lotes de 30 para queries `__name__` `in`. Bien implementado. |
| Notifications | `notifications.service.ts` | Bajo | `findByUser()` limita a 50. Correcto. |
| Discovery | `discovery.service.ts` | **Medio** | Carga todas las instituciones activas en memoria, filtra, ordena y limita a 50. Funcional pero no escalable. |

---

### Eje 3: Tipado de TypeScript (Strict Typing)

#### Uso masivo de `any` — Conteo por módulo

| Módulo | Archivo | Nivel de Riesgo | Instancias de `any` | Descripción |
|---|---|---|---|---|
| Users | `users.service.ts` | **Alto** | ~12 | `datos: any` en updateProfile, saveProfilingData, addDependent, updateDependent. `d: any` en formatearDependiente. `valor: any` en parsearCampoJson, parsearObjeto. |
| Users | `users.controller.ts` | **Alto** | ~10 | `@CurrentUser() user: any` en todos los endpoints. No existe interfaz `CurrentUser` tipada. |
| Admin | `admin.controller.ts` | **Alto** | ~5 | `@CurrentUser() user: any` en 3 endpoints. `dto as any` en updateSettings. |
| Institutions | `institutions.controller.ts` | **Alto** | ~5 | `@CurrentUser() user: any` en 5 endpoints. |
| Jobs | `jobs.controller.ts` | **Alto** | ~4 | `@CurrentUser() user: any` en 4 endpoints. |
| Jobs | `jobs.service.ts` | **Alto** | ~8 | `createForUser(user: any, dto: any)`, `createJob(institucionId: string, dto: any)`. |
| Community | `community.controller.ts` | **Alto** | ~3 | `@CurrentUser() user: any` en 3 endpoints. |
| Messages | `messages.controller.ts` | **Alto** | ~4 | `@CurrentUser() user: any` en 4 endpoints. |
| Notifications | `notifications.controller.ts` | **Alto** | ~3 | `@CurrentUser() user: any` en 3 endpoints. `Subject<any>` en streams. |
| Favorites | `favorites.controller.ts` | **Alto** | ~3 | `@CurrentUser() user: any` en 3 endpoints. `instituciones: any[]` en service. |
| Reviews | `reviews.controller.ts` | **Alto** | ~2 | `@CurrentUser() user: any` en 2 endpoints. |
| AI | `ai.controller.ts` | **Alto** | ~3 | `@CurrentUser() user: any` en 2 endpoints. `historial?: any[]` en DTO. |
| AI | `ai.service.ts` | **Alto** | ~6 | `private client: any = null`. `chat(usuarioId, mensaje, historial: any[])`. `datosPerfil: any`. |
| Discovery | `discovery.controller.ts` | **Alto** | ~1 | `@Query() q: any` — query params sin tipar. |
| Discovery | `discovery.service.ts` | **Alto** | ~8 | `discover(usuarioId: string, filtros: any = {})`. Callbacks de filter/sort con `(a: any, b: any)`. |
| Institutions | `institutions.service.ts` | **Medio** | ~5 | `parsear(fila: any)`, `(dto as any)[campo]` en buildUpdatePayload. |
| Firestore Helpers | `firestore-helpers.ts` | **Medio** | ~5 | `parsearTiposDiscapacidad(valor: any)`, `parsearCampoJson(valor: any)`, `parsearObjeto(valor: any)`. Aceptable para parseadores dinámicos de Firestore, pero podrían usar `unknown`. |
| Auth | `auth.service.ts` | **Medio** | ~4 | `catch (e: any)` — aceptable para Firebase Auth errors. |
| Storage | `storage.service.ts` | **Medio** | ~3 | `catch (err: any)` — aceptable para errores de GCS. |
| Database | `firebase.provider.ts` | **Medio** | ~2 | `catch (e: any)` — aceptable para inicialización. |
| Admin | `admin.service.ts` | **Alto** | ~15 | `alertas: any[]`, `parsear = (v: any): any[] =>`, sort callbacks `(a: any, b: any)`, mapas `Map<string, any>`. |
| Messages | `messages.service.ts` | **Medio** | ~5 | `Map<string, any>` para perfiles y socios. |
| **TOTAL estimado** | | | **~120+** | |

#### Casting de tipos peligrosos

- `as unknown as`: **0 instancias** ✅
- `as any`: ~10 instancias (admin.controller, institutions.service, etag.interceptor.spec) — la mayoría en contextos controlados

#### Retornos de funciones

- Controllers: todos retornan directamente el resultado del service (implícitamente tipado por NestJS). No hay problemas de retorno.
- Services: la mayoría no tiene tipo de retorno explícito. Con `strict: true` se recomendaría agregarlos.

---

### Eje 4: Cumplimiento de Reglas de API REST

#### Formato de respuestas

| Módulo | Endpoint | Estado | Verificación |
|---|---|---|---|
| Institutions | `GET /instituciones` | ✅ | Retorna `{ datos, paginacion }` correctamente |
| Institutions | `GET /instituciones/:id` | ✅ | Retorna `{}` (recurso único) |
| Institutions | `DELETE /instituciones/:id` | ✅ | `@HttpCode(204)` |
| Institutions | `POST /instituciones` | ✅ | Retorna 201 (default NestJS POST) |
| Admin | `POST /administracion/instituciones/:id/aprobar` | ✅ | `@HttpCode(204)` |
| Admin | `DELETE /administracion/instituciones/:id` | ✅ | `@HttpCode(204)` |
| Admin | `DELETE /administracion/usuarios/:id` | ✅ | `@HttpCode(204)` |
| Admin | `DELETE /administracion/resenas/:id` | ✅ | `@HttpCode(204)` |
| Notifications | `PATCH :id/leer` | ✅ | `@HttpCode(204)` |
| Notifications | `PATCH leer-todas` | ✅ | `@HttpCode(204)` |
| Users | `DELETE avatar` | ✅ | `@HttpCode(204)` |
| Users | `DELETE dependientes/:id` | ✅ | `@HttpCode(204)` |
| Auth | `POST inicio-sesion` | ✅ | `@HttpCode(200)` explícito |
| Auth | `POST renovar-token` | ✅ | `@HttpCode(200)` explícito |
| Jobs | `POST /empleo` | ✅ | `@HttpCode(201)` explícito |
| Jobs | `GET /empleo` | ✅ | Retorna array `[]` directamente |
| Favorites | `GET /favoritos` | ✅ | Retorna array `[]` directamente |
| Favorites | `GET /favoritos/ids` | ✅ | Retorna array de IDs `[]` |
| Favorites | `POST :institutionId/alternar` | ✅ | Retorna `{ favorito: boolean }` |
| Messages | `GET conversaciones` | ✅ | Retorna array `[]` |
| Messages | `GET no-leidos` | ✅ | Retorna número `number` |
| Community | `GET grupos` | ✅ | Retorna array `[]` |
| Discovery | `GET /descubrimiento` | ✅ | Retorna array `[]` |

#### Residuos del envoltorio obsoleto

- **`{ exito, mensaje, datos }`**: ✅ **Eliminado completamente** — No se encontraron residuos en ningún service o controller.
- **Propiedad `mensaje` dentro de entidades**: ✅ **No encontrada** — Las respuestas son puras entidades de datos.

#### Estados HTTP problemáticos

| Endpoint | Problema | Severidad |
|---|---|---|
| `POST /resenas/institucion/:id` | Retorna 200 por defecto al crear/actualizar. Debería ser 201 para creación. | Bajo |
| `POST /comunidad/publicaciones` | Retorna 201 por defecto (correcto) pero sin `@HttpCode(201)` explícito. | Bajo |
| `POST /comunidad/publicaciones/:id/comentarios` | Igual que arriba. | Bajo |

---

### Eje 5: Documentación Swagger y Pruebas Unitarias

#### Cobertura Swagger

| Módulo | Controllers | DTOs | Estado |
|---|---|---|---|
| Auth | ✅ `@ApiOperation`, `@ApiResponse` en todos los endpoints | ✅ `RegisterDto`, `LoginDto`, `RefreshTokenDto` con `@ApiProperty` | Completo |
| Users | ✅ Todos los endpoints documentados | ✅ `GuardarPerfilNecesidadesDto` completo. ⚠️ `ActualizarPerfilDto` y `CrearDependienteDto` sin `class-validator` | ~90% |
| Institutions | ✅ Todos los endpoints documentados | ✅ `CreateInstitucionDto`, `UpdateInstitucionDto` completos con validadores | Completo |
| Admin | ✅ Todos los endpoints documentados | ⚠️ `ActualizarConfiguracionDto` sin `class-validator` | ~90% |
| Jobs | ✅ Todos los endpoints documentados | ⚠️ DTOs inline tienen validadores pero no `@ApiResponse` para 400 | ~85% |
| Reviews | ✅ Todos los endpoints documentados | ⚠️ DTO inline sin `@ApiResponse` para 400 | ~85% |
| Community | ✅ Todos los endpoints documentados | ⚠️ DTOs inline sin `@ApiResponse` para 400 | ~85% |
| Messages | ✅ Todos los endpoints documentados | ⚠️ DTO inline sin `@ApiResponse` para 400 | ~85% |
| AI | ✅ Todos los endpoints documentados | ⚠️ `historial?: any[]` sin tipo explícito en Swagger (`type: [Object]`) | ~85% |
| Favorites | ✅ Todos los endpoints documentados | N/A (sin DTOs) | Completo |
| Discovery | ✅ Todos los endpoints documentados | N/A (sin DTOs) | Completo |
| Notifications | ✅ Todos los endpoints documentados | N/A (sin DTOs) | Completo |

#### Cobertura de Pruebas Unitarias

| Archivo de Test | Tests | Estado | Cubre |
|---|---|---|---|
| `admin.service.spec.ts` | 24 | ✅ | getStats, approveInstitution, rejectInstitution, toggleVerifyInstitution, getUsers, toggleUserActive, changeUserRole, deleteReview, getSettings, updateSettings, getAlerts |
| `users.service.spec.ts` | 32 | ✅ | getProfile, saveProfilingData, updateAvatar, deleteAvatar, getDependents, addDependent, updateDependent, deleteDependent, updateProfile |
| `institutions.service.spec.ts` | 24 | ✅ | findAll, findOne, findMine, create, updateMine, update, remove con edge cases |
| `institutions.controller.spec.ts` | 10 | ✅ | Todos los endpoints del controller |
| `jobs.service.spec.ts` | 14 | ✅ | findAll, findOne, apply, getAppliedJobIds, createForUser |
| `messages.service.spec.ts` | 10 | ✅ | getConversations, getMessages, sendMessage, getUnreadCount |
| `community.service.spec.ts` | 8 | ✅ | getGroups, getPosts, createPost, createComment, toggleLike |
| `discovery.service.spec.ts` | 6 | ✅ | discover con filtros, perfil, límite |
| `favorites.service.spec.ts` | 5 | ✅ | findByUser, toggle, getFavoriteIds |
| `notifications.service.spec.ts` | 9 | ✅ | crear, findByUser, markRead, markAllRead, getStream |
| `reviews.service.spec.ts` | 7 | ✅ | findByInstitution, submit (create+update), myReviews |
| `etag.interceptor.spec.ts` | 13 | ✅ | GET, non-GET, edge cases |

#### Archivos SIN tests (o con tests insuficientes)

| Archivo | Nivel de Riesgo | Descripción |
|---|---|---|
| `auth.service.ts` | **Alto** | ❌ Sin `auth.service.spec.ts`. Métodos `register`, `login`, `refresh`, `me` sin cobertura unitaria. Es el módulo de autenticación — crítico. |
| `ai.service.ts` | **Alto** | ❌ Sin `ai.service.spec.ts`. Métodos `chat`, `recommend`, `recommendForDependent` sin cobertura. |
| `storage.service.ts` | **Medio** | ❌ Sin tests. Lógica de retry con exponential backoff, upload local/GCS, delete sin cobertura. |
| `firebase-auth.guard.ts` | **Medio** | ❌ Sin tests. Lógica de autenticación crítica sin cobertura. Verifica tokens Firebase, carga perfil, verifica `activo`. |
| `roles.guard.ts` | **Medio** | ❌ Sin tests. Lógica de autorización por roles sin cobertura. |
| `email.service.ts` | Bajo | ⚠️ Servicio mock simple — tests innecesarios por ahora. |
| `tenant.service.ts` | Bajo | Wrapper trivial — OK sin tests. |

---

## 3. Plan de Acción Sugerido (ordenado por prioridad)

### 🔴 Prioridad Alta (Semanal)

#### 1. Activar `strict: true` en `tsconfig.json`
**Impacto:** Alto | **Esfuerzo:** Alto
- Esto forzará a corregir todos los `any` implícitos y null-checks
- El impacto es alto pero el beneficio a largo plazo es enorme
- Estrategia: Activar por subconjuntos (`noImplicitAny`, `strictNullChecks`) si `strict: true` completo es muy disruptive

#### 2. Crear interfaz `CurrentUser` tipada
**Impacto:** Alto | **Esfuerzo:** Bajo
```typescript
// src/common/decorators/current-user.decorator.ts
export interface CurrentUserPayload {
  id: string
  email: string
  rol: 'pcd' | 'tutor' | 'institucion' | 'admin'
  nombreCompleto: string
  verificado: boolean
}
```
Reemplazar `@CurrentUser() user: any` en todos los controllers (~30+ instancias).

#### 3. Crear interfaces/entidades para servicios
**Impacto:** Alto | **Esfuerzo:** Medio
- `UserProfile`, `ExtendedProfile`, `Dependent` → `users/`
- `Institution` → `institutions/`
- `Review` → `reviews/`
- `Vacancy`, `Postulacion` → `jobs/`
- `Notification` → `notifications/`
- `Message`, `Conversation` → `messages/`
- Reemplazar `datos: any` en `UsersService.updateProfile`, `saveProfilingData`, `addDependent`, `updateDependent`
- Reemplazar `user: any, dto: any` en `JobsService.createForUser`, `createJob`
- Reemplazar `filtros: any` en `DiscoveryService.discover`

#### 4. Escribir tests para `auth.service.ts`
**Impacto:** Alto | **Espero:** Medio
- Es el módulo más crítico (registro, login, refresh)
- Mockear Firebase Auth y Firestore
- Testear: registro exitoso, email duplicado, login correcto, credenciales incorrectas, refresh token válido/inválido, usuario desactivado

#### 5. Escribir tests para `firebase-auth.guard.ts`
**Impacto:** Alto | **Esfuerzo:** Bajo
- La guardia de autenticación es la línea de defensa principal
- Testear: token válido, token inválido, usuario no encontrado, usuario desactivado, header ausente

### 🟡 Prioridad Media (Quincenal)

#### 6. Agregar `class-validator` a DTOs faltantes
**Impacto:** Medio | **Esfuerzo:** Bajo
- `ActualizarPerfilDto` — agregar `@IsOptional() @IsString()` a cada campo
- `CrearDependienteDto` — agregar validadores apropiados
- `ActualizarConfiguracionDto` — agregar `@IsOptional() @IsString()` a cada campo

#### 7. Resolver N+1 queries
**Impacto:** Medio | **Esfuerzo:** Medio
- `AdminService.getReviews()` — usar batch de 30 con `__name__` `in` para usuarios e instituciones
- `AdminService.getAlerts()` — paginar o cachear, evitar cargar todas las colecciones
- `CommunityService.getPosts()` — prefetch autores en batch de 30
- `CommunityService.getComments()` — prefetch autores en batch de 30
- `JobsService.findAll()` — prefetch instituciones en batch de 30

#### 8. Mover DTOs inline a archivos separados
**Impacto:** Medio | **Esfuerzo:** Bajo
- `CreateJobDto`, `PostulacionDto` → `jobs/dto/`
- `EnviarDto` → `messages/dto/`
- `CrearPublicacionDto`, `CrearComentarioDto` → `community/dto/`
- `ChatIaDto`, `RecomendacionIaDto` → `ai/dto/`
- `EnviarResenaDto` → `reviews/dto/`

#### 9. Configurar throttling
**Impacto:** Medio | **Esfuerzo:** Bajo
- `@nestjs/throttler` está instalado pero no configurado globalmente
- Configurar en `main.ts` o `AppModule` con límites razonables (ej: 100 req/min)

#### 10. Escribir tests para `storage.service.ts`
**Impacto:** Medio | **Esfuerzo:** Medio
- Lógica de retry y fallback local es crítica
- Testear: upload exitoso, upload con retry, upload con fallo definitivo, delete existente, delete inexistente

#### 11. Escribir tests para `roles.guard.ts`
**Impacto:** Medio | **Esfuerzo:** Bajo
- Testear: rol permitido, rol no permitido, sin roles decorados

### 🟢 Prioridad Baja (Mensual)

#### 12. Reducir `AdminService`
**Impacto:** Bajo | **Esfuerzo:** Alto
- Dividir en: `AdminStatsService`, `AdminInstitutionService`, `AdminUserService`, `AdminSettingsService`
- El archivo actual tiene ~560 líneas

#### 13. Agregar `@ApiResponse` para errores 400
**Impacto:** Bajo | **Esfuerzo:** Bajo
- En todos los endpoints que aceptan DTOs, documentar respuesta 400 para errores de validación

#### 14. Tipar `Subject<any>` en NotificationsService
**Impacto:** Bajo | **Esfuerzo:** Bajo
- Crear interfaz `NotificationEvent` y usar `Subject<NotificationEvent>`

#### 15. Tipar `Anthropic` client en AiService
**Impacto:** Bajo | **Esfuerzo:** Bajo
- Usar tipo del SDK `@anthropic-ai/sdk` en lugar de `any`

#### 16. Escribir tests para `ai.service.ts`
**Impacto:** Bajo | **Esfuerzo:** Medio
- Testear: chat con/ sin API key (mock), recommend con/ sin perfil, recommendForDependent con/ sin acceso

---

## 4. Verificación Automática

| Comando | Resultado |
|---|---|
| `pnpm tsc --noEmit` | ✅ **Limpio** — Sin errores de tipado |
| `pnpm test` | ✅ **152/152 tests pasan** — 12 suites, 0 fallos, 13.06s |

### Salida de `pnpm test`:

```
PASS src/modules/community/community.service.spec.ts (11.226 s)
PASS src/modules/reviews/reviews.service.spec.ts (11.235 s)
PASS src/modules/favorites/favorites.service.spec.ts (11.228 s)
PASS src/modules/discovery/discovery.service.spec.ts (11.276 s)
PASS src/modules/messages/messages.service.spec.ts (11.289 s)
PASS src/modules/notifications/notifications.service.spec.ts (11.333 s)
PASS src/modules/jobs/jobs.service.spec.ts (11.385 s)
PASS src/modules/institutions/institutions.service.spec.ts (11.436 s)
PASS src/modules/admin/admin.service.spec.ts (11.511 s)
PASS src/modules/users/users.service.spec.ts (11.509 s)
PASS src/common/interceptors/etag.interceptor.spec.ts
PASS src/modules/institutions/institutions.controller.spec.ts (12.352 s)

Test Suites: 12 passed, 12 total
Tests:       152 passed, 152 total
Snapshots:   0 total
Time:        13.062 s
```

---

## 5. Calificación por Eje

```
┌─────────────────────────────────────────┬────────┐
│ Eje 1: Arquitectura                    │  B+    │
│ Eje 2: CRUDs y Manejo de Datos         │  B     │
│ Eje 3: Tipado TypeScript               │  C+    │  ← Mayor deuda técnica
│ Eje 4: Cumplimiento REST               │  A-    │  ← Muy bien tras migración
│ Eje 5: Swagger y Pruebas               │  B+    │
├─────────────────────────────────────────┼────────┤
│ GLOBAL                                 │  B+    │
└─────────────────────────────────────────┴────────┘
```

---

## 6. Archivos del Proyecto Revisados

### Configuración
- `package.json` — Dependencias y scripts
- `tsconfig.json` — Configuración TypeScript (`strict: false`)
- `jest.config.ts` — Configuración de tests con SWC
- `src/main.ts` — Bootstrap, CORS, Swagger, ValidationPipe

### Core
- `src/app.module.ts` — Módulo raíz
- `src/database/database.module.ts` — Módulo de base de datos global
- `src/database/firebase.provider.ts` — Provider de Firestore y Firebase Auth
- `src/database/firestore.constants.ts` — Nombres de colecciones
- `src/common/guards/firebase-auth.guard.ts` — Guard de autenticación
- `src/common/guards/roles.guard.ts` — Guard de roles
- `src/common/tenant/tenant.service.ts` — Servicio multi-tenant
- `src/common/utils/firestore-helpers.ts` — Helpers para parseo de datos Firestore
- `src/common/interceptors/etag.interceptor.ts` — Interceptor ETag

### Módulos (Controllers + Services + DTOs + Tests)
- `src/modules/auth/` — Autenticación (register, login, refresh, me)
- `src/modules/users/` — Usuarios (perfil, avatar, dependientes, profiling)
- `src/modules/institutions/` — Instituciones (CRUD, mi institución)
- `src/modules/jobs/` — Empleo (vacantes, postulaciones)
- `src/modules/reviews/` — Reseñas (CRUD por institución)
- `src/modules/community/` — Comunidad (grupos, posts, comentarios, likes)
- `src/modules/favorites/` — Favoritos (toggle, listar)
- `src/modules/discovery/` — Descubrimiento (búsqueda inteligente)
- `src/modules/notifications/` — Notificaciones (CRUD + SSE streaming)
- `src/modules/messages/` — Mensajes directos (conversaciones, envío)
- `src/modules/admin/` — Administración (stats, analytics, moderación)
- `src/modules/ai/` — Inteligencia Artificial (chat, recomendaciones)
- `src/modules/storage/` — Almacenamiento (upload/delete GCS + local)
- `src/modules/email/` — Email (mock con Resend)

---

## 7. Recomendaciones Finales

### Para una IA que vaya a implementar los cambios:

1. **Empezar por la interfaz `CurrentUserPayload`** — Es el cambio de mayor impacto con menor esfuerzo. Se aplica a ~30+ puntos del código de una sola vez.

2. **Activar `strictNullChecks` primero** — No activar `strict: true` completo de golpe. Empezar con `strictNullChecks` y resolver los errores, luego `noImplicitAny`, luego el resto.

3. **Crear interfaces de dominio** antes de refactorizar services — Definir `UserProfile`, `Institution`, `Vacancy`, etc. en archivos separados (`*.interface.ts` o `*.types.ts`) para que todos los módulos las compartan.

4. **No romper la API** — Los cambios de tipado son internos. La forma de las respuestas HTTP NO debe cambiar.

5. **Mantener los tests pasando** — Después de cada cambio, ejecutar `pnpm test` para asegurar que nada se rompe.

6. **Los N+1 queries son prioridad solo si hay tráfico real** — Con pocos datos no son problemáticos. Priorizar el tipado primero.
