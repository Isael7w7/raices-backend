# 🏗️ Estructura y Arquitectura — Raíces para Florecer Backend

**Fecha:** 6 de agosto, 2026  
**Objetivo:** Análisis de la arquitectura actual, estructura de carpetas y propuesta de arquitectura mejorada.

---

## 📁 Estructura Actual

```
raices-backend/
├── .github/workflows/          # CI/CD
│   └── ci.yml
├── docs/                        # Documentación
├── scripts/                     # Scripts de utilidad
│   ├── cleanup-old-collections.ts
│   ├── create-user.ts
│   ├── read-db-structure.ts
│   └── update-city.ts
├── src/
│   ├── app.module.ts            # Root module
│   ├── main.ts                  # Entry point
│   ├── common/                  # Shared components
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts
│   │   │   ├── feature.decorator.ts
│   │   │   ├── limit-dependientes.decorator.ts
│   │   │   ├── roles.decorator.ts
│   │   │   └── use-etag.decorator.ts
│   │   ├── dto/
│   │   │   └── paginacion.dto.ts
│   │   ├── guards/
│   │   │   ├── feature.guard.ts (+spec)
│   │   │   ├── firebase-auth.guard.ts (+spec)
│   │   │   ├── jwt.guard.ts
│   │   │   ├── limit-dependientes.guard.ts (+spec)
│   │   │   └── roles.guard.ts (+spec)
│   │   ├── interceptors/
│   │   │   └── etag.interceptor.ts (+spec)
│   │   ├── interfaces/
│   │   │   ├── current-user.interface.ts
│   │   │   └── feature-flags.interface.ts
│   │   ├── tenant/
│   │   │   └── tenant.service.ts
│   │   └── utils/
│   │       ├── firestore-helpers.ts (+spec)
│   │       └── storage-path.util.ts
│   ├── database/
│   │   ├── database.module.ts
│   │   ├── firebase.provider.ts
│   │   ├── firestore.constants.ts
│   │   └── seed/
│   │       └── seed.ts
│   └── modules/
│       ├── admin/
│       │   ├── admin.controller.ts (+spec)
│       │   ├── admin.service.ts (+spec)
│       │   ├── admin.module.ts
│       │   ├── dto/
│       │   │   └── actualizar-configuracion.dto.ts
│       │   ├── firebase-analytics.module.ts
│       │   └── firebase-analytics.service.ts
│       ├── ai/
│       │   ├── ai.controller.ts
│       │   ├── ai.service.ts
│       │   ├── ai.module.ts
│       │   └── dto/
│       │       ├── chat-ia.dto.ts
│       │       └── recomendacion-ia.dto.ts
│       ├── auth/
│       │   ├── auth.controller.ts
│       │   ├── auth.service.ts (+spec)
│       │   ├── auth.module.ts
│       │   ├── jwt.strategy.ts
│       │   └── dto/
│       │       ├── login.dto.ts
│       │       ├── refresh-token.dto.ts
│       │       └── register.dto.ts
│       ├── catalogs/
│       │   ├── catalogs.controller.ts (+spec)
│       │   ├── catalogs.service.ts (+spec)
│       │   └── catalogs.module.ts
│       ├── community/
│       │   ├── community.controller.ts
│       │   ├── community.service.ts (+spec)
│       │   ├── community.module.ts
│       │   └── dto/
│       │       ├── actualizar-publicacion.dto.ts
│       │       ├── crear-comentario.dto.ts
│       │       ├── crear-grupo.dto.ts
│       │       └── crear-publicacion.dto.ts
│       ├── discovery/
│       │   ├── discovery.controller.ts
│       │   ├── discovery.service.ts (+spec)
│       │   └── discovery.module.ts
│       ├── email/
│       │   ├── email.module.ts
│       │   └── email.service.ts
│       ├── favorites/
│       │   ├── favorites.controller.ts
│       │   ├── favorites.service.ts (+spec)
│       │   └── favorites.module.ts
│       ├── institutions/
│       │   ├── institutions.controller.ts (+spec)
│       │   ├── institutions.service.ts (+spec)
│       │   ├── institutions.module.ts
│       │   └── dto/
│       │       ├── create-institucion.dto.ts
│       │       ├── update-institucion.dto.ts
│       │       └── index.ts
│       ├── jobs/
│       │   ├── jobs.controller.ts (+spec)
│       │   ├── jobs.service.ts (+spec)
│       │   ├── jobs.module.ts
│       │   └── dto/
│       │       ├── actualizar-estado-postulacion.dto.ts
│       │       ├── actualizar-vacante.dto.ts
│       │       ├── create-job.dto.ts
│       │       ├── postulacion.dto.ts
│       │       └── respuestas-empleo.dto.ts
│       ├── messages/
│       │   ├── messages.controller.ts
│       │   ├── messages.service.ts (+spec)
│       │   ├── messages.module.ts
│       │   └── dto/
│       │       └── enviar.dto.ts
│       ├── notifications/
│       │   ├── notifications.controller.ts
│       │   ├── notifications.service.ts (+spec)
│       │   └── notifications.module.ts
│       ├── reviews/
│       │   ├── reviews.controller.ts
│       │   ├── reviews.service.ts (+spec)
│       │   ├── reviews.module.ts
│       │   └── dto/
│       │       ├── actualizar-resena.dto.ts
│       │       └── enviar-resena.dto.ts
│       ├── storage/
│       │   ├── storage.module.ts
│       │   └── storage.service.ts
│       └── users/
│           ├── users.controller.ts
│           ├── users.service.ts (+spec)
│           ├── users.module.ts
│           └── dto/
│               ├── actualizar-perfil.dto.ts
│               ├── crear-dependiente.dto.ts
│               ├── guardar-perfil-necesidades.dto.ts
│               └── update-features.dto.ts
├── package.json
├── tsconfig.json
├── jest.config.ts
├── Dockerfile
├── docker-compose.yml
└── firebase.json
```

---

## 🔍 Análisis de Capas

### Capa Actual (2 capas por módulo)
```
Controller → Service → Firestore
```

**Problema:** El Service tiene demasiadas responsabilidades:
- Lógica de negocio
- Acceso a datos
- Transformación de datos
- Comunicación externa (email, storage, AI)

### Arquitectura Propuesta (4 capas)
```
Controller → Service → Repository → Firestore
    ↓           ↓           ↓
  (DTO)    (Business)    (Data Access)
```

---

## 📐 Estructura de Carpetas Propuesta

### Opción A: Por Feature (Recomendada)
```
src/
├── common/
│   ├── decorators/
│   ├── dto/
│   ├── guards/
│   ├── interceptors/
│   ├── interfaces/
│   ├── pipes/
│   │   └── sanitize.pipe.ts
│   ├── filters/
│   │   └── http-exception.filter.ts
│   └── utils/
├── database/
│   ├── database.module.ts
│   ├── firebase.provider.ts
│   ├── firestore.constants.ts
│   └── seed/
├── features/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.repository.ts        # ← NUEVO
│   │   ├── auth.facade.ts            # ← NUEVO (orquesta llamadas externas)
│   │   ├── dto/
│   │   └── __tests__/
│   │       ├── auth.service.spec.ts
│   │       ├── auth.repository.spec.ts
│   │       └── auth.controller.spec.ts
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   ├── users.repository.ts
│   │   ├── dto/
│   │   └── __tests__/
│   ├── institutions/
│   │   ├── institutions.module.ts
│   │   ├── institutions.controller.ts
│   │   ├── institutions.service.ts
│   │   ├── institutions.repository.ts
│   │   ├── dto/
│   │   └── __tests__/
│   ├── jobs/
│   │   ├── jobs.module.ts
│   │   ├── jobs.controller.ts
│   │   ├── jobs.service.ts
│   │   ├── jobs.repository.ts
│   │   ├── dto/
│   │   └── __tests__/
│   ├── community/
│   │   ├── community.module.ts
│   │   ├── community.controller.ts
│   │   ├── community.service.ts
│   │   ├── community.repository.ts
│   │   ├── dto/
│   │   └── __tests__/
│   ├── reviews/
│   │   ├── reviews.module.ts
│   │   ├── reviews.controller.ts
│   │   ├── reviews.service.ts
│   │   ├── reviews.repository.ts
│   │   ├── dto/
│   │   └── __tests__/
│   ├── favorites/
│   │   └── ...
│   ├── messages/
│   │   └── ...
│   ├── notifications/
│   │   └── ...
│   └── admin/
│       ├── admin.module.ts
│       ├── admin.controller.ts
│       ├── admin.service.ts
│       ├── admin.repository.ts
│       ├── analytics.service.ts       # ← Separado de admin
│       ├── alertas.service.ts         # ← Separado de admin
│       ├── dto/
│       └── __tests__/
├── shared/
│   ├── email/
│   │   ├── email.module.ts
│   │   ├── email.service.ts
│   │   └── templates/
│   ├── storage/
│   │   ├── storage.module.ts
│   │   ├── storage.service.ts
│   │   └── storage-path.util.ts
│   └── ai/
│       ├── ai.module.ts
│       ├── ai.service.ts
│       ├── vertexai.provider.ts        # ← Vertex AI (Gemini)
│       └── dto/
└── config/
    ├── app.config.ts
    ├── firebase.config.ts
    └── throttler.config.ts
```

### Opción B: Por Dominio (Alternativa)
```
src/
├── auth/           # Autenticación y autorización
├── user/           # Gestión de usuarios
├── institution/    # Directorio de instituciones
├── job/            # Bolsa de trabajo
├── community/      # Social features
├── notification/   # Notificaciones
├── admin/          # Panel administrativo
├── ai/             # Inteligencia artificial
└── shared/         # Componentes compartidos
```

---

## 🔄 Ejemplo de Separación de Responsabilidades

### Antes (AdminService actual)
```typescript
@Injectable()
export class AdminService {
  // ~500 líneas con TODO mezclado
  async getStats() { ... }
  async getAnalytics() { ... }
  async getNeedsIntelligence() { ... }
  async getAllInstitutions() { ... }
  async approveInstitution() { ... }
  async rejectInstitution() { ... }
  async getUsers() { ... }
  async toggleUserActive() { ... }
  async deleteUser() { ... }
  async getReviews() { ... }
  async deleteReview() { ... }
  async getSettings() { ... }
  async updateSettings() { ... }
  async getActiveVisitors() { ... }
  async getAlerts() { ... }
}
```

### Después (Separado)
```typescript
// admin.repository.ts - Solo acceso a datos
@Injectable()
export class AdminRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}
  
  async findAllUsers() { ... }
  async findInstitutionById(id: string) { ... }
  async updateInstitution(id: string, data: any) { ... }
  async deleteUser(id: string) { ... }
  // ... operaciones CRUD puras
}

// admin.service.ts - Solo lógica de negocio
@Injectable()
export class AdminService {
  constructor(
    private readonly repo: AdminRepository,
    private readonly email: EmailService,
    private readonly analytics: AnalyticsService,
  ) {}
  
  async approveInstitution(id: string) {
    const inst = await this.repo.findInstitutionById(id)
    await this.repo.updateInstitution(id, { verificada: true, activa: true })
    await this.email.sendInstitutionApproved(inst.email, inst.nombre)
  }
}

// analytics.service.ts - Analytics separados
@Injectable()
export class AnalyticsService {
  constructor(private readonly repo: AdminRepository) {}
  
  async getStats() { ... }
  async getNeedsIntelligence() { ... }
  async getActiveVisitors() { ... }
}

// alertas.service.ts - Alertas separadas
@Injectable()
export class AlertasService {
  constructor(private readonly repo: AdminRepository) {}
  
  async getAlerts() { ... }
}
```

---

## 📊 Matriz de Dependencias Actuales

```
auth.service
  ├── Firebase Admin Auth
  ├── Firestore (perfiles, instituciones, dependientes)
  ├── EmailService
  ├── FirebaseAnalyticsService
  └── Axios (REST API de Firebase)

users.service
  ├── Firestore (perfiles, perfilesExtendidos, dependientes, instituciones)
  └── StorageService

admin.service
  ├── Firestore (todas las colecciones)
  ├── NotificationsService
  ├── EmailService
  └── StorageService

jobs.service
  ├── Firestore (vacantes, postulaciones, instituciones)
  └── (helpers de paginación)

community.service
  ├── Firestore (grupos, publicaciones, comentarios, meGustas, perfiles)
  └── (helpers de paginación)
```

---

## 🎯 Propuesta de Interfaces

### Repository Interface Pattern
```typescript
// common/interfaces/repository.interface.ts
export interface IRepository<T, CreateDTO, UpdateDTO> {
  findById(id: string): Promise<T | null>
  findAll(filters?: Record<string, any>): Promise<T[]>
  create(data: CreateDTO): Promise<T>
  update(id: string, data: UpdateDTO): Promise<T>
  delete(id: string): Promise<void>
}

// features/institutions/institutions.repository.ts
export interface IInstitutionsRepository extends IRepository<
  Institution,
  CreateInstitutionDto,
  UpdateInstitutionDto
> {
  findByOwnerId(ownerId: string): Promise<Institution | null>
  findPending(): Promise<Institution[]>
  toggleVerification(id: string): Promise<boolean>
}
```

### Service Interface Pattern
```typescript
// common/interfaces/service.interface.ts
export interface IService<T> {
  findById(id: string): Promise<T>
  findAll(filters?: Record<string, any>): Promise<RespuestaPaginada<T>>
}
```

---

## 🏛️ Patrones de Diseño Recomendados

### 1. Repository Pattern
- Abstrae el acceso a datos
- Facilita testing con mocks
- Permite cambiar de DB sin modificar services

### 2. Facade Pattern
- Orquesta llamadas a múltiples servicios
- Maneja transacciones y rollback
- Ejemplo: `AuthFacade` orquesta `AuthService + EmailService + AnalyticsService`

### 3. Strategy Pattern
- Para diferentes estrategias de notificación (email, push, in-app)
- Para diferentes estrategias de recomendación (AI mock vs real)

### 4. Factory Pattern
- Para crear diferentes tipos de usuarios (PCD, Tutor, Institución)
- Para crear diferentes tipos de notificaciones

### 5. Decorator Pattern
- Extender validación de DTOs
- Añadir logging automático
- Añadir métricas automáticas

---

## 📈 Métricas de Complejidad

| Servicio | Líneas | Método | Complejidad Ciclomática |
|----------|--------|--------|------------------------|
| admin.service | ~500 | 15 | Alta |
| users.service | ~350 | 12 | Media-Alta |
| jobs.service | ~250 | 10 | Media |
| community.service | ~300 | 10 | Media |
| auth.service | ~200 | 4 | Media |
| institutions.service | ~180 | 7 | Media |
| ai.service | ~150 | 4 | Baja |
| messages.service | ~100 | 4 | Baja |
| notifications.service | ~80 | 4 | Baja |
| reviews.service | ~80 | 4 | Baja |
| favorites.service | ~60 | 3 | Baja |
| discovery.service | ~60 | 1 | Baja |
| catalogs.service | ~50 | 5 | Baja |
| storage.service | ~120 | 4 | Media |

---

## ✅ Resumen de Recomendaciones

1. **Crear capa de Repository** para abstraer Firestore
2. **Separar `AdminService`** en 3-4 servicios más pequeños
3. **Renombrar carpeta `modules/` a `features/`** (opcional, más semántico)
4. **Mover `email/`, `storage/`, `ai/` a `shared/`** (son servicios transversales)
5. **Crear `config/`** para configuraciones centralizadas
6. **Añadir `__tests__/`** dentro de cada feature (mejor que `*.spec.ts` sueltos)
7. **Implementar interfaces** para Repository y Service
8. **Añadir pipes** de sanitización y transformación
9. **Crear filters** para manejo centralizado de errores
10. **Configurar barrel exports** (`index.ts`) en cada feature
