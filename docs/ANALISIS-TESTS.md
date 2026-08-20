# 🧪 Análisis de Testing — Raíces para Florecer Backend

**Fecha:** 6 de agosto, 2026  
**Objetivo:** Evaluación de la cobertura, calidad y estrategia de testing.

---

## 📊 Resumen de Tests

### Archivos de Test Existentes (22)

| Archivo | Tipo | Tests Estimados | Estado |
|---------|------|----------------|--------|
| `common/guards/feature.guard.spec.ts` | Unit | ~12 | ✅ Completo |
| `common/guards/firebase-auth.guard.spec.ts` | Unit | ~8 | ✅ Completo |
| `common/guards/limit-dependientes.guard.spec.ts` | Unit | ~7 | ✅ Completo |
| `common/guards/roles.guard.spec.ts` | Unit | ~8 | ✅ Completo |
| `common/interceptors/etag.interceptor.spec.ts` | Unit | ~12 | ✅ Completo |
| `common/utils/firestore-helpers.spec.ts` | Unit | ~6 | ✅ Completo |
| `modules/admin/admin.controller.spec.ts` | Unit | ~3 | ⚠️ Pocos tests |
| `modules/admin/admin.service.spec.ts` | Unit | ~15 | ✅ Completo |
| `modules/auth/auth.service.spec.ts` | Unit | ~12 | ✅ Completo |
| `modules/catalogs/catalogs.controller.spec.ts` | Unit | ~5 | ✅ Completo |
| `modules/catalogs/catalogs.service.spec.ts` | Unit | ~4 | ✅ Completo |
| `modules/community/community.service.spec.ts` | Unit | ~8 | ✅ Completo |
| `modules/discovery/discovery.service.spec.ts` | Unit | ~5 | ✅ Completo |
| `modules/favorites/favorites.service.spec.ts` | Unit | ~5 | ✅ Completo |
| `modules/institutions/institutions.controller.spec.ts` | Unit | ~7 | ✅ Completo |
| `modules/institutions/institutions.service.spec.ts` | Unit | ~8 | ✅ Completo |
| `modules/jobs/jobs.controller.spec.ts` | Unit | ~3 | ⚠️ Pocos tests |
| `modules/jobs/jobs.service.spec.ts` | Unit | ~10 | ✅ Completo |
| `modules/messages/messages.service.spec.ts` | Unit | ~6 | ✅ Completo |
| `modules/notifications/notifications.service.spec.ts` | Unit | ~6 | ✅ Completo |
| `modules/reviews/reviews.service.spec.ts` | Unit | ~8 | ✅ Completo |
| `modules/users/users.service.spec.ts` | Unit | ~15 | ✅ Completo |

### Archivos Sin Tests

| Archivo | Prioridad |
|---------|-----------|
| `modules/ai/ai.service.ts` | 🔴 Alta |
| `modules/ai/ai.controller.ts` | 🔴 Alta |
| `modules/storage/storage.service.ts` | 🟡 Media |
| `modules/email/email.service.ts` | 🟡 Media |
| `modules/messages/messages.controller.ts` | 🟡 Media |
| `modules/notifications/notifications.controller.ts` | 🟡 Media |
| `modules/community/community.controller.ts` | 🟡 Media |
| `modules/favorites/favorites.controller.ts` | 🟡 Media |
| `modules/reviews/reviews.controller.ts` | 🟡 Media |
| `modules/discovery/discovery.controller.ts` | 🟡 Media |
| `modules/ai/ai.module.ts` | 🟢 Baja |
| Todos los `*.module.ts` | 🟢 Baja |

---

## 🔍 Análisis de Calidad de Tests

### ✅ Lo Bien Hecho

#### 1. Mock Consistente de Firestore
```typescript
// Patrón reutilizable en todos los tests
function mockDoc(data: Record<string, any> | null, exists = true, docId = 'mock-doc-id') {
  return {
    id: docId,
    exists,
    data: () => data,
    ref: { update: jest.fn().mockResolvedValue(undefined) },
  }
}

function mockCollection(opts: { ... }) {
  return {
    doc: jest.fn().mockReturnValue({ get: jest.fn(), set: jest.fn() }),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn(),
  }
}
```

#### 2. Testing de Guards
Los guards están bien testeados con escenarios happy path y error:
```typescript
// feature.guard.spec.ts
describe('FeatureGuard', () => {
  describe('no feature required', () => {
    it('should allow access when no feature metadata is defined', () => { ... })
  })
  describe('feature required', () => {
    it('should allow access when user has the feature enabled', () => { ... })
    it('should allow access when user is admin', () => { ... })
    it('should throw ForbiddenException when feature disabled', () => { ... })
  })
})
```

#### 3. Testing de Edge Cases
```typescript
// users.service.spec.ts
it('should return original string if JSON is malformed (not crash)', async () => {
  // Test robusto contra datos corruptos
})

it('should handle already-parsed arrays (not strings) gracefully', async () => {
  // Test de compatibilidad con datos legacy
})
```

#### 4. Testing de Autenticación
```typescript
// auth.service.spec.ts
describe('register', () => {
  it('should register a new user successfully', async () => { ... })
  it('should throw ConflictException when email already exists', async () => { ... })
  it('should rollback the Firebase user when Firestore batch commit fails', async () => {
    // Testing de transaccionalidad
  })
})
```

---

### ⚠️ Problemas de Calidad

#### 1. `mockDoc` Duplicado en Todos los Archivos
```typescript
// Se repite en: auth.service.spec, admin.service.spec, community.service.spec,
// jobs.service.spec, messages.service.spec, firestore-helpers.spec
function mockDoc(data: Record<string, any> | null, exists = true, docId = 'mock-doc-id') {
  // ... misma función en cada archivo
}
```

**Recomendación:** Crear `test-utils/mock-firestore.ts`:
```typescript
// test-utils/mock-firestore.ts
export function mockDoc(data: Record<string, any> | null, exists = true, docId = 'mock-doc-id') {
  return { id: docId, exists, data: () => data, ref: { update: jest.fn() } }
}

export function mockCollection(opts: CollectionMockOptions = {}) {
  // ...
}

export function createFirestoreMock() {
  return { collection: jest.fn() }
}
```

#### 2. Tests de Controller Muy Superficiales
```typescript
// admin.controller.spec.ts - Solo 3 tests
describe('GET /administracion/visitantes-activos', () => {
  it('should return active visitors', async () => {
    mockService.getActiveVisitors.mockResolvedValue(expected)
    const result = await controller.getActiveVisitors()
    expect(mockService.getActiveVisitors).toHaveBeenCalledTimes(1)
    expect(result).toEqual(expected)
  })
})
```

**Problema:** No testea:
- Autenticación
- Autorización
- Validación de entrada
- Manejo de errores
- HTTP status codes

#### 3. Falta Testing de Integración
No hay tests que verifiquen:
- Flujo completo register → login → getProfile
- Flujo completo create institution → approve → publish job
- Flujo completo send message → get conversations
- Rate limiting real

#### 4. Tests de AI Service Ausentes
```typescript
// ai.service.ts - 0 tests
// Contiene lógica compleja:
// - Llamadas a Vertex AI (Gemini)
// - Fallback a respuestas mock
// - Parsing de JSON de respuesta
// - Manejo de errores de red
```

#### 5. Sin Tests de Performance
No hay tests que verifiquen:
- Tiempo de respuesta de queries frecuentes
- Comportamiento con grandes volúmenes de datos
- Uso de memoria

---

## 📋 Cobertura Estimada por Módulo

| Módulo | Controller | Service | Repository | DTOs | Total |
|--------|-----------|---------|------------|------|-------|
| auth | ⚠️ | ✅ | N/A | ✅ | 70% |
| users | ⚠️ | ✅ | N/A | ✅ | 65% |
| institutions | ✅ | ✅ | N/A | ✅ | 80% |
| jobs | ⚠️ | ✅ | N/A | ✅ | 70% |
| community | ❌ | ✅ | N/A | ✅ | 60% |
| reviews | ❌ | ✅ | N/A | ✅ | 65% |
| favorites | ❌ | ✅ | N/A | N/A | 50% |
| messages | ❌ | ✅ | N/A | N/A | 50% |
| notifications | ❌ | ✅ | N/A | N/A | 50% |
| admin | ⚠️ | ✅ | N/A | ✅ | 65% |
| ai | ❌ | ❌ | N/A | N/A | 0% |
| storage | ❌ | ❌ | N/A | N/A | 0% |
| email | ❌ | ❌ | N/A | N/A | 0% |
| catalogs | ✅ | ✅ | N/A | N/A | 80% |
| discovery | ❌ | ✅ | N/A | N/A | 50% |
| common/guards | ✅ | N/A | N/A | N/A | 90% |
| common/utils | ✅ | N/A | N/A | N/A | 85% |

**Cobertura General Estimada: ~55-60%**

---

## 🧪 Estrategia de Testing Recomendada

### Nivel 1: Unit Tests (Actual - Bueno)
- Tests individuales de cada función/método
- Mock de dependencias externas
- Testing de happy path y edge cases

### Nivel 2: Integration Tests (Falta)
```typescript
// Ejemplo de test de integración
describe('Auth + Users Integration', () => {
  let app: INestApplication

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()
    app = module.createNestApplication()
    await app.init()
  })

  it('should register and then login', async () => {
    // 1. Registrar usuario
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'test@test.com', password: 'Test1234', ... })
    
    expect(registerResponse.status).toBe(201)
    
    // 2. Login
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'Test1234' })
    
    expect(loginResponse.status).toBe(200)
    expect(loginResponse.body.tokenAcceso).toBeDefined()
  })
})
```

### Nivel 3: E2E Tests (Falta)
- Tests completos de flujos de usuario
- Testing de UI + API
- Testing de performance

---

## 📝 Test Cases Faltantes Críticos

### 1. AI Service Tests
```typescript
describe('AiService', () => {
  describe('chat', () => {
    it('should return mock response when Vertex AI not configured', async () => { ... })
    it('should call Vertex AI (Gemini) when configured', async () => { ... })
    it('should handle API errors gracefully', async () => { ... })
    it('should limit history to last 6 messages', async () => { ... })
  })

  describe('recommend', () => {
    it('should generate recommendations based on user profile', async () => { ... })
    it('should prioritize diagnostic evaluation when no disability type', async () => { ... })
    it('should fallback to generic recommendations on error', async () => { ... })
  })
})
```

### 2. Storage Service Tests
```typescript
describe('StorageService', () => {
  describe('upload', () => {
    it('should upload to GCS when configured', async () => { ... })
    it('should fallback to local storage when GCS unavailable', async () => { ... })
    it('should retry on transient errors', async () => { ... })
    it('should reject non-image files', async () => { ... })
  })

  describe('delete', () => {
    it('should delete from GCS', async () => { ... })
    it('should handle 404 gracefully', async () => { ... })
  })
})
```

### 3. Email Service Tests
```typescript
describe('EmailService', () => {
  describe('sendWelcome', () => { ... })
  describe('sendInstitutionApproved', () => { ... })
  describe('sendPasswordReset', () => { ... })
})
```

### 4. Controller Integration Tests
```typescript
describe('AuthController (Integration)', () => {
  it('should return 401 when token is invalid', async () => { ... })
  it('should return 403 when role is insufficient', async () => { ... })
  it('should return 400 when validation fails', async () => { ... })
  it('should return 429 when rate limit exceeded', async () => { ... })
})
```

---

## 🛠️ Configuración de Testing

### jest.config.ts Actual
```typescript
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(ts|js|tsx|jsx)$': '@swc/jest' },
  transformIgnorePatterns: [],
  collectCoverageFrom: ['**/*.ts', '!main.ts', '!**/*.module.ts'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
}
```

### Configuración Recomendada
```typescript
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(ts|js|tsx|jsx)$': '@swc/jest' },
  transformIgnorePatterns: [],
  collectCoverageFrom: [
    '**/*.ts',
    '!main.ts',
    '!**/*.module.ts',
    '!**/*.dto.ts',
    '!**/*.interface.ts',
    '!**/*.constant.ts',
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  // Nuevas configuraciones:
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/../test/setup.ts'],
  testTimeout: 10000,
}
```

---

## 📊 Resumen de Recomendaciones

### Prioridad Alta
1. **Crear tests para AI Service** (0% → 80%)
2. **Crear tests para Storage Service** (0% → 80%)
3. **Crear tests para Email Service** (0% → 80%)
4. **Refactorizar mock helpers** a archivo compartido
5. **Añadir tests de integración** para flujos críticos

### Prioridad Media
6. **Mejorar tests de controllers** (autorización, validación, errores)
7. **Añadir tests de rate limiting**
8. **Añadir tests de CORS**
9. **Configurar coverage threshold** en jest.config

### Prioridad Baja
10. **Añadir tests de performance**
11. **Añadir tests de seguridad** (XSS, injection)
12. **Añadir tests de migración de datos**
