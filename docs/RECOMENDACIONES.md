# 💡 Recomendaciones y Mejores Prácticas — Raíces para Florecer Backend

**Fecha:** 6 de agosto, 2026  
**Objetivo:** Recomendaciones concretas para mejorar el código, herramientas, librerías y flujos.

---

## 🛠️ Herramientas y Librerías Recomendadas

### 1. Seguridad

#### Helmet (Headers de Seguridad HTTP)
```bash
npm install helmet @types/helmet
```
```typescript
// main.ts
import * as helmet from 'helmet'
app.use(helmet())
```
**Beneficio:** Protege contra Clickjacking, XSS, MIME sniffing, etc.

#### class-sanitizer (Sanitización de Entrada)
```bash
npm install class-sanitizer
```
```typescript
import { sanitize } from 'class-sanitizer'
import { Sanitize } from 'class-sanitizer'

export class CreatePostDto {
  @IsString()
  @Sanitize()  // Elimina HTML malicioso
  contenido: string
}
```
**Beneficio:** Previene XSS en campos de texto libre.

#### csurf (CSRF Protection - Solo si se usan cookies)
```bash
npm install csurf @types/csurf
```
**Nota:** Solo necesario si se implementan refresh tokens via cookies.

---

### 2. Logging

#### NestJS Pino (Logging Estructurado)
```bash
npm install nestjs-pino pino pino-http
```
```typescript
// main.ts
import { LoggerModule } from 'nestjs-pino'

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production' 
          ? { target: 'pino-pretty' }
          : undefined,
        level: process.env.LOG_LEVEL || 'info',
      },
    }),
  ],
})
```
**Beneficio:** Logs estructurados JSON, levels configurables, performance.

---

### 3. Rate Limiting Diferenciado

#### @nestjs/throttler (Ya instalado)
```typescript
// Para login: 5 intentos por minuto
@Throttle(5, 60)
async login(@Body() dto: LoginDto) { ... }

// Para registro: 3 por hora
@Throttle(3, 3600)
async register(@Body() dto: RegisterDto) { ... }

// Para AI: 20 por hora (API costosa)
@Throttle(20, 3600)
async chat(@Body() dto: ChatIaDto) { ... }
```

---

### 4. Validación Mejorada

#### class-validator (Ya instalado) - Reglas adicionales
```typescript
import { 
  IsEmail, IsString, MinLength, MaxLength, 
  Matches, IsOptional, IsBoolean, IsArray,
  ValidateNested, IsEnum, IsUrl
} from 'class-validator'
import { Type } from 'class-transformer'

export class RegisterDto {
  @IsEmail({}, { message: 'Email inválido' })
  email: string

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'La contraseña debe contener al menos una mayúscula, una minúscula y un número'
  })
  password: string

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nombreCompleto: string

  @IsEnum(['pcd', 'tutor', 'institucion'], { message: 'Rol inválido' })
  rol: string
}
```

#### class-transformer (Ya instalado) - Transformaciones
```typescript
import { Transform, Type } from 'class-transformer'

export class PaginationDto {
  @Transform(({ value }) => Math.max(1, parseInt(value) || 1))
  page: number = 1

  @Transform(({ value }) => Math.min(50, Math.max(1, parseInt(value) || 10)))
  limit: number = 10
}
```

---

### 5. Health Checks

#### @nestjs/terminus
```bash
npm install @nestjs/terminus
```
```typescript
// health.controller.ts
import { Controller, Get } from '@nestjs/common'
import { HealthCheck, HealthCheckService, HealthCheckResult } from '@nestjs/terminus'

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.firestore.pingCheck('firestore'),
    ])
  }
}
```

---

### 6. Performance Monitoring

#### @nestjs/terminus + Prometheus
```bash
npm install prom-client @willsoto/nestjs-prometheus
```
```typescript
// metrics.module.ts
import { PrometheusModule } from '@willsoto/nestjs-prometheus'

@Module({
  imports: [
    PrometheusModule.register({
      defaultLabels: { app: 'raices-backend' },
    }),
  ],
})
```

---

### 7. API Documentation Mejorada

#### @nestjs/swagger (Ya instalado) - Configuración avanzada
```typescript
const config = new DocumentBuilder()
  .setTitle('Raíces para Florecer API')
  .setDescription('API del ecosistema digital para personas con discapacidad')
  .setVersion('1.0.0')
  .addBearerAuth()
  .addTag('Auth', 'Autenticación')
  .addTag('Users', 'Gestión de usuarios')
  .addTag('Institutions', 'Directorio de instituciones')
  .addServer('http://localhost:7000', 'Desarrollo')
  .addServer('https://api.raices.mx', 'Producción')
  .build()
```

---

### 8. Testing Mejorado

#### Jest + Supertest (Para tests de integración)
```bash
npm install -D supertest @types/supertest
```

#### Testcontainers (Para tests con Firestore Emulator)
```bash
npm install -D testcontainers
```

---

### 9. Code Quality

#### ESLint + Prettier
```bash
npm install -D eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser prettier eslint-config-prettier
```

`.eslintrc.js`:
```javascript
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/no-unused-vars': 'error',
    'no-console': 'warn',
  },
}
```

#### Husky + Lint-Staged (Pre-commit hooks)
```bash
npm install -D husky lint-staged
```

---

## 🔄 Flujos Recomendados

### 1. Flujo de Autenticación Mejorado

**Actual:**
```
Register → Firebase Auth + Firestore (batch) → Sign-in REST API → Return tokens
```

**Recomendado:**
```
Register → Firebase Auth + Firestore (batch) → Create Custom Token → Return tokens
```

**Por qué:** El Sign-in REST API expone la contraseña al servidor. Es mejor usar `createCustomToken`.

### 2. Flujo de Upload de Archivos

**Actual:**
```
Upload → StorageService.upload → GCS/Local → Return URL
```

**Recomendado:**
```
Upload → Validate (size, type) → Compress (if image) → StorageService.upload → GCS → Return URL
```

**Librería:** `sharp` para compresión de imágenes.

### 3. Flujo de Notificaciones

**Actual:**
```
Event → NotificationsService.create → Firestore
```

**Recomendado:**
```
Event → NotificationsService.create → Firestore + Push (FCM) + Email (opcional)
```

**Librería:** `firebase-admin/messaging` para push notifications.

### 4. Flujo de Búsqueda

**Actual:**
```
Query Firestore → Filter in memory → Sort in memory → Paginate
```

**Recomendado:**
```
Option A: Algolia/Typesense (búsqueda full-text)
Option B: Firestore + composite indexes (mejor rendimiento)
Option C: Meilisearch (self-hosted, open source)
```

---

## 📋 Checklist de Buenas Prácticas

### Código
- [ ] `strict: true` en tsconfig.json
- [ ] ESLint configurado con reglas estrictas
- [ ] Prettier configurado
- [ ] Husky + lint-staged en pre-commit
- [ ] JSDoc en servicios públicos
- [ ] Barrel exports (index.ts) en cada módulo

### Seguridad
- [ ] Helmet instalado
- [ ] Rate limiting diferenciado
- [ ] Sanitización XSS
- [ ] Validación de tamaño en uploads
- [ ] Logging sin datos sensibles
- [ ] Auditing trail

### Testing
- [ ] Tests unitarios para todos los servicios
- [ ] Tests de integración para flujos críticos
- [ ] Coverage threshold > 70%
- [ ] Mock helpers compartidos
- [ ] Tests de seguridad

### DevOps
- [ ] Health check endpoint
- [ ] Prometheus metrics
- [ ] Structured logging
- [ ] Environment variables en Secret Manager
- [ ] CI/CD con tests automáticos
- [ ] Docker multi-stage build optimizado

### Documentación
- [ ] Swagger actualizado
- [ ] README con instrucciones claras
- [ ] CHANGELOG
- [ ] Contributing guidelines
- [ ] API versioning

---

## 🚀 Prioridad de Implementación

### Semana 1-2: Fundamentos
1. Instalar y configurar Helmet
2. Configurar rate limiting diferenciado
3. Crear health check endpoint
4. Configurar ESLint + Prettier

### Semana 3-4: Testing
5. Crear tests para AI Service
6. Crear tests para Storage Service
7. Refactorizar mock helpers
8. Añadir tests de integración básicos

### Semana 5-6: Arquitectura
9. Crear capa de Repository
10. Separar AdminService
11. Implementar interfaces

### Semana 7-8: Mejoras
12. Sanitización XSS
13. Auditing trail
14. Logging estructurado
15. Performance monitoring
