# 📋 Plan de Mejoras Paso a Paso — Raíces para Florecer Backend

**Fecha:** 6 de agosto, 2026  
**Objetivo:** Plan de implementación detallado para mejorar el backend.

---

## 🎯 Visión General

| Fase | Objetivo | Duración Estimada | Prioridad |
|------|----------|-------------------|-----------|
| Fase 1 | Fundamentos de seguridad | 1-2 semanas | 🔴 Crítica |
| Fase 2 | Testing y calidad | 2-3 semanas | 🔴 Alta |
| Fase 3 | Arquitectura limpia | 3-4 semanas | 🟡 Media |
| Fase 4 | Performance y monitoreo | 2 semanas | 🟡 Media |
| Fase 5 | Documentación y DevOps | 1-2 semanas | 🟢 Baja |

---

## 🔴 Fase 1: Fundamentos de Seguridad (1-2 semanas)

### Semana 1: Seguridad HTTP

#### Tarea 1.1: Instalar Helmet
```bash
npm install helmet @types/helmet
```

**Archivo: `src/main.ts`**
```typescript
import * as helmet from 'helmet'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  
  // Añadir después de enableCors
  app.use(helmet())
  
  // ... resto del bootstrap
}
```

**Verificar:**
- [ ] Headers de seguridad presentes en respuesta
- [ ] No se rompen funcionalidades existentes

---

#### Tarea 1.2: Rate Limiting Diferenciado

**Archivo: `src/modules/auth/auth.controller.ts`**
```typescript
import { Throttle } from '@nestjs/throttler'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle(3, 3600) // 3 registros por hora
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto)
  }

  @Post('login')
  @Throttle(5, 60) // 5 intentos por minuto
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto)
  }
}
```

**Archivo: `src/modules/ai/ai.controller.ts`**
```typescript
@Post('chat')
@Throttle(20, 3600) // 20 chats por hora
async chat(@CurrentUser() user: CurrentUserPayload, @Body() dto: ChatIaDto) {
  return this.aiService.chat(user.id, dto.mensaje, dto.historial)
}
```

**Verificar:**
- [ ] Login rechaza después de 5 intentos
- [ ] Registro limitado a 3 por hora
- [ ] AI limitado a 20 por hora

---

#### Tarea 1.3: Health Check Endpoint

```bash
npm install @nestjs/terminus
```

**Crear: `src/health/health.controller.ts`**
```typescript
import { Controller, Get } from '@nestjs/common'
import { HealthCheck, HealthCheckService } from '@nestjs/terminus'
import { Inject } from '@nestjs/common'
import { FIRESTORE } from '../database/firebase.provider'
import { Firestore } from 'firebase-admin/firestore'

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    @Inject(FIRESTORE) private readonly db: Firestore,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.checkFirestore(),
    ])
  }

  private async checkFirestore() {
    try {
      await this.db.collection('_health').doc('ping').set({ 
        timestamp: new Date().toISOString() 
      })
      return { firestore: { status: 'up' } }
    } catch (error) {
      return { firestore: { status: 'down', message: error.message } }
    }
  }
}
```

**Crear: `src/health/health.module.ts`**
```typescript
import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'
import { HealthController } from './health.controller'

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

**Actualizar: `src/app.module.ts`**
```typescript
imports: [
  HealthModule,
  // ... otros módulos
]
```

**Verificar:**
- [ ] `GET /health` retorna 200 con estado de Firestore
- [ ] Cloud Run usa este endpoint para readiness/liveness probes

---

### Semana 2: Validación y Sanitización

#### Tarea 1.4: Mejorar DTOs con Validación

**Archivo: `src/modules/auth/dto/register.dto.ts`**
```typescript
import { IsEmail, IsString, MinLength, MaxLength, Matches, IsIn, IsOptional, IsArray } from 'class-validator'

export class RegisterDto {
  @IsEmail({}, { message: 'Email inválido' })
  email: string

  @IsString()
  @MinLength(8, { message: 'Mínimo 8 caracteres' })
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Debe contener mayúscula, minúscula y número'
  })
  password: string

  @IsString()
  @MinLength(2, { message: 'Mínimo 2 caracteres' })
  @MaxLength(100)
  nombreCompleto: string

  @IsIn(['pcd', 'tutor', 'institucion'], { message: 'Rol inválido' })
  rol: string

  @IsOptional()
  @IsString()
  ciudad?: string

  @IsOptional()
  @IsString()
  estado?: string

  @IsOptional()
  @IsString()
  tutorId?: string

  // ... resto de campos
}
```

**Archivo: `src/modules/messages/dto/enviar.dto.ts`**
```typescript
import { IsString, IsNotEmpty, MaxLength } from 'class-validator'

export class EnviarDto {
  @IsString()
  @IsNotEmpty({ message: 'El destinatario es requerido' })
  destinatarioId: string

  @IsString()
  @IsNotEmpty({ message: 'El mensaje no puede estar vacío' })
  @MaxLength(5000, { message: 'Máximo 5000 caracteres' })
  contenido: string
}
```

**Verificar:**
- [ ] Validación rechaza entradas inválidas
- [ ] Mensajes de error claros en español
- [ ] No se permiten campos extra (whitelist: true funciona)

---

#### Tarea 1.5: Sanitización de Campos de Texto

**Crear: `src/common/pipes/sanitize.pipe.ts`**
```typescript
import { PipeTransform, Injectable } from '@nestjs/common'

@Injectable()
export class SanitizePipe implements PipeTransform {
  transform(value: any) {
    if (typeof value === 'string') {
      return this.sanitizeString(value)
    }
    if (typeof value === 'object' && value !== null) {
      return this.sanitizeObject(value)
    }
    return value
  }

  private sanitizeString(str: string): string {
    return str
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
  }

  private sanitizeObject(obj: any): any {
    const sanitized: any = {}
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value)
      } else {
        sanitized[key] = value
      }
    }
    return sanitized
  }
}
```

**Usar en controllers:**
```typescript
@Post('publicacion')
async createPost(
  @Body(SanitizePipe) dto: CrearPublicacionDto,
  @CurrentUser() user: CurrentUserPayload,
) {
  return this.communityService.createPost(dto.grupoId, user.id, dto.contenido)
}
```

**Verificar:**
- [ ] Tags HTML se escapan correctamente
- [ ] No se rompe el rendering en frontend
- [ ] Performance aceptable

---

## 🔴 Fase 2: Testing y Calidad (2-3 semanas)

### Semana 3: Tests Críticos

#### Tarea 2.1: Crear Mock Helpers Compartidos

**Crear: `src/test-utils/mock-firestore.ts`**
```typescript
export function mockDoc(
  data: Record<string, any> | null, 
  exists = true, 
  docId = 'mock-doc-id'
) {
  return {
    id: docId,
    exists,
    data: () => data,
    ref: { 
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    },
  }
}

export function mockCollection(opts: {
  docResult?: any
  whereResult?: any
  empty?: boolean
  docs?: any[]
} = {}) {
  const { docResult, empty = true, docs = [] } = opts
  return {
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(docResult ?? mockDoc(null, false)),
      set: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    }),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ empty, docs, size: docs.length }),
  }
}

export function createFirestoreMock() {
  return { collection: jest.fn() }
}
```

**Crear: `src/test-utils/index.ts`**
```typescript
export { mockDoc, mockCollection, createFirestoreMock } from './mock-firestore'
```

---

#### Tarea 2.2: Tests para AI Service

**Crear: `src/modules/ai/ai.service.spec.ts`**
```typescript
import { Test, TestingModule } from '@nestjs/testing'
import { AiService } from './ai.service'
import { FIRESTORE } from '../../database/firebase.provider'

describe('AiService', () => {
  let service: AiService
  let firestoreMock: any

  beforeEach(async () => {
    firestoreMock = { collection: jest.fn() }
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: FIRESTORE, useValue: firestoreMock },
      ],
    }).compile()

    service = module.get<AiService>(AiService)
  })

  describe('chat', () => {
    it('should return mock response when Anthropic not configured', async () => {
      // Arrange
      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true }),
      })

      // Act
      const result = await service.chat('user1', 'Hola')

      // Assert
      expect(result.simulado).toBe(true)
      expect(result.respuesta).toBeDefined()
    })

    it('should handle user profile retrieval', async () => {
      // Arrange
      const perfilData = {
        tiposDiscapacidad: '["tea", "motriz"]',
        etapaVida: 'infancia',
      }
      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [{ data: () => perfilData }],
        }),
      })

      // Act
      const result = await service.chat('user1', 'Hola')

      // Assert
      expect(result.simulado).toBe(true)
    })
  })

  describe('recommend', () => {
    it('should return recommendations based on user profile', async () => {
      // Arrange
      const perfilData = {
        tiposDiscapacidad: '["tea"]',
        etapaVida: 'infancia',
        metasActuales: '["mejorar_comunicacion"]',
      }
      const usuarioData = {
        ciudad: 'Mérida',
        estado: 'Yucatán',
      }

      firestoreMock.collection
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({
            empty: false,
            docs: [{ data: () => perfilData }],
          }),
        })
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => usuarioData,
            }),
          }),
        })

      // Act
      const result = await service.recommend('user1')

      // Assert
      expect(result.proximosPasos).toBeDefined()
      expect(result.proximosPasos.length).toBe(3)
    })

    it('should prioritize diagnostic evaluation when no disability type', async () => {
      // Arrange
      firestoreMock.collection
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({
            empty: false,
            docs: [{ data: () => ({ tiposDiscapacidad: '[]' }) }],
          }),
        })
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ ciudad: 'Mérida' }),
            }),
          }),
        })

      // Act
      const result = await service.recommend('user1')

      // Assert
      expect(result.proximosPasos[0]).toContain('evaluación')
    })
  })
})
```

---

#### Tarea 2.3: Tests para Storage Service

**Crear: `src/modules/storage/storage.service.spec.ts`**
```typescript
import { Test, TestingModule } from '@nestjs/testing'
import { StorageService } from './storage.service'
import * as fs from 'fs'

// Mock de firebase-admin/storage
jest.mock('firebase-admin/storage', () => ({
  getStorage: jest.fn(() => ({
    bucket: jest.fn(() => ({
      file: jest.fn(() => ({
        save: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
      })),
    })),
  })),
}))

describe('StorageService', () => {
  let service: StorageService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StorageService],
    }).compile()

    service = module.get<StorageService>(StorageService)
  })

  describe('upload', () => {
    it('should upload file and return URL', async () => {
      // Arrange
      const fileBuffer = Buffer.from('test file content')
      const originalName = 'photo.jpg'

      // Act
      const result = await service.upload(fileBuffer, originalName, 'avatars')

      // Assert
      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
    })

    it('should handle different file extensions', async () => {
      // Arrange
      const testCases = [
        { name: 'photo.jpg', expected: 'image/jpeg' },
        { name: 'document.pdf', expected: 'application/pdf' },
        { name: 'image.png', expected: 'image/png' },
      ]

      for (const testCase of testCases) {
        const result = await service.upload(
          Buffer.from('test'),
          testCase.name,
          'uploads'
        )
        expect(result).toBeDefined()
      }
    })
  })

  describe('delete', () => {
    it('should delete file without error', async () => {
      // Act & Assert
      await expect(
        service.delete('avatars/test.jpg')
      ).resolves.not.toThrown()
    })
  })
})
```

---

### Semana 4: Tests de Integración

#### Tarea 2.4: Test de Flujo de Autenticación

**Crear: `src/modules/auth/auth.integration.spec.ts`**
```typescript
import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import * as request from 'supertest'
import { AppModule } from '../../app.module'

describe('Auth + Users Integration', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()
  }, 30000)

  afterAll(async () => {
    await app.close()
  })

  describe('Register flow', () => {
    it('should register a new user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `test-${Date.now()}@test.com`,
          password: 'Test1234',
          nombreCompleto: 'Test User',
          rol: 'pcd',
        })

      expect(response.status).toBe(201)
      expect(response.body.tokenAcceso).toBeDefined()
      expect(response.body.usuario).toBeDefined()
    })

    it('should reject duplicate email', async () => {
      const email = `duplicate-${Date.now()}@test.com`
      
      // First registration
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password: 'Test1234',
          nombreCompleto: 'Test User',
          rol: 'pcd',
        })

      // Duplicate
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password: 'Test1234',
          nombreCompleto: 'Test User 2',
          rol: 'pcd',
        })

      expect(response.status).toBe(409)
    })

    it('should reject weak password', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `weak-${Date.now()}@test.com`,
          password: '123',
          nombreCompleto: 'Test User',
          rol: 'pcd',
        })

      expect(response.status).toBe(400)
    })
  })

  describe('Login flow', () => {
    it('should login with valid credentials', async () => {
      // Register first
      const email = `login-${Date.now()}@test.com`
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password: 'Test1234',
          nombreCompleto: 'Login User',
          rol: 'pcd',
        })

      // Login
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'Test1234' })

      expect(response.status).toBe(200)
      expect(response.body.tokenAcceso).toBeDefined()
    })

    it('should reject invalid password', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'WrongPassword',
        })

      expect(response.status).toBe(401)
    })
  })

  describe('Protected endpoints', () => {
    let token: string

    beforeAll(async () => {
      const email = `protected-${Date.now()}@test.com`
      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password: 'Test1234',
          nombreCompleto: 'Protected User',
          rol: 'pcd',
        })
      token = registerResponse.body.tokenAcceso
    })

    it('should access profile with valid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/usuarios/perfil')
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(200)
      expect(response.body.email).toBeDefined()
    })

    it('should reject request without token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/usuarios/perfil')

      expect(response.status).toBe(401)
    })

    it('should reject request with invalid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/usuarios/perfil')
        .set('Authorization', 'Bearer invalid-token')

      expect(response.status).toBe(401)
    })
  })
})
```

---

### Semana 5: Tests de Seguridad

#### Tarea 2.5: Tests de Rate Limiting

**Crear: `src/common/guards/rate-limit.spec.ts`**
```typescript
import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import * as request from 'supertest'
import { ThrottlerModule } from '@nestjs/throttler'
import { AppModule } from '../../app.module'

describe('Rate Limiting', () => {
  let app: INestApplication

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ ttl: 1000, limit: 3 }]), // 3 requests per second for testing
        AppModule,
      ],
    }).compile()

    app = module.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('should allow requests within limit', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/catalogos/parentescos')

    expect(response.status).toBe(200)
  })

  it('should block requests exceeding limit', async () => {
    // Send 4 rapid requests (limit is 3)
    const requests = Array(4).fill(null).map(() =>
      request(app.getHttpServer()).get('/api/catalogos/parentescos')
    )

    const responses = await Promise.all(requests)
    const blocked = responses.filter(r => r.status === 429)

    expect(blocked.length).toBeGreaterThan(0)
  })
})
```

---

## 🟡 Fase 3: Arquitectura Limpia (3-4 semanas)

### Semana 6-7: Repository Pattern

#### Tarea 3.1: Crear Base Repository

**Crear: `src/common/base repository.ts`**
```typescript
import { Firestore, DocumentData } from 'firebase-admin/firestore'
import { Inject } from '@nestjs/common'
import { FIRESTORE } from '../database/firebase.provider'

export abstract class BaseRepository<T extends { id: string }> {
  protected readonly collection: FirebaseFirestore.CollectionReference<DocumentData>

  constructor(
    @Inject(FIRESTORE) protected readonly db: Firestore,
    collectionName: string,
  ) {
    this.collection = this.db.collection(collectionName)
  }

  async findById(id: string): Promise<T | null> {
    const doc = await this.collection.doc(id).get()
    return doc.exists ? { id: doc.id, ...doc.data() } as T : null
  }

  async findAll(
    filters?: Record<string, any>,
    limit = 50,
  ): Promise<T[]> {
    let query: FirebaseFirestore.Query<DocumentData> = this.collection

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          query = query.where(key, '==', value)
        }
      }
    }

    const snapshot = await query.limit(limit).get()
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as T)
  }

  async create(data: Omit<T, 'id'>): Promise<T> {
    const ref = this.collection.doc()
    const document = { id: ref.id, ...data }
    await ref.set(document)
    return document as T
  }

  async update(id: string, data: Partial<T>): Promise<void> {
    await this.collection.doc(id).update(data)
  }

  async delete(id: string): Promise<void> {
    await this.collection.doc(id).delete()
  }

  async count(filters?: Record<string, any>): Promise<number> {
    const docs = await this.findAll(filters, 1000)
    return docs.length
  }
}
```

---

#### Tarea 3.2: Crear Institutions Repository

**Crear: `src/features/institutions/institutions.repository.ts`**
```typescript
import { Injectable } from '@nestjs/common'
import { BaseRepository } from '../../common/base repository'
import { Institution } from './interfaces/institution.interface'
import { COLECCIONES } from '../../database/firestore.constants'

@Injectable()
export class InstitutionsRepository extends BaseRepository<Institution> {
  constructor() {
    super(COLECCIONES.instituciones)
  }

  async findByOwnerId(ownerId: string): Promise<Institution | null> {
    const snapshot = await this.collection
      .where('creadoPor', '==', ownerId)
      .limit(1)
      .get()

    if (snapshot.empty) return null
    
    const doc = snapshot.docs[0]
    return { id: doc.id, ...doc.data() } as Institution
  }

  async findPending(): Promise<Institution[]> {
    const snapshot = await this.collection
      .where('activa', '==', true)
      .where('verificada', '==', false)
      .get()

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Institution[]
  }

  async toggleVerification(id: string): Promise<boolean> {
    const doc = await this.findById(id)
    if (!doc) return false

    const newStatus = !doc.verificada
    await this.update(id, { verificada: newStatus })
    return newStatus
  }
}
```

---

### Semana 8-9: Separar AdminService

#### Tarea 3.3: Crear Analytics Service

**Crear: `src/features/admin/analytics.service.ts`**
```typescript
import { Injectable } from '@nestjs/common'
import { AdminRepository } from './admin.repository'

@Injectable()
export class AnalyticsService {
  constructor(private readonly repo: AdminRepository) {}

  async getStats() {
    const [usuarios, instituciones, resenas] = await Promise.all([
      this.repo.countUsers(),
      this.repo.countInstitutions(),
      this.repo.countReviews(),
    ])

    return {
      totalUsuarios: usuarios,
      totalInstituciones: instituciones,
      totalResenas: resenas,
    }
  }

  async getNeedsIntelligence() {
    // Lógica de inteligencia de necesidades
    return this.repo.getNeedsIntelligence()
  }
}
```

**Crear: `src/features/admin/alertas.service.ts`**
```typescript
import { Injectable } from '@nestjs/common'
import { AdminRepository } from './admin.repository'

@Injectable()
export class AlertasService {
  constructor(private readonly repo: AdminRepository) {}

  async getAlerts() {
    const alertas: any[] = []
    
    // Alertas de calificaciones bajas
    const lowRatingInstitutions = await this.repo.findLowRatingInstitutions()
    for (const inst of lowRatingInstitutions) {
      alertas.push({
        tipo: 'rating_risk',
        severidad: 'critica',
        titulo: `Calificación crítica: ${inst.nombre}`,
      })
    }

    // Más alertas...
    return alertas.sort((a, b) => 
      this.getSeverityOrder(a.severidad) - this.getSeverityOrder(b.severidad)
    )
  }

  private getSeverityOrder(severity: string): number {
    const order: Record<string, number> = { critica: 0, media: 1, info: 2 }
    return order[severity] ?? 9
  }
}
```

---

## 🟡 Fase 4: Performance y Monitoreo (2 semanas)

### Semana 10: Logging Estructurado

#### Tarea 4.1: Configurar NestJS Pino

```bash
npm install nestjs-pino pino pino-http
```

**Actualizar: `src/main.ts`**
```typescript
import { LoggerModule } from 'nestjs-pino'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  })

  // Configurar pino
  app.useLogger(app.get(LoggerService))

  // ... resto del bootstrap
}
```

---

### Semana 11: Health Checks y Métricas

#### Tarea 4.2: Health Check con Firestore

Ya implementado en Tarea 1.3.

#### Tarea 4.3: Métricas Básicas

**Crear: `src/common/interceptors/metrics.interceptor.ts`**
```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'
import { Logger } from '@nestjs/common'

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Metrics')

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest()
    const { method, url } = request
    const startTime = Date.now()

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime
        this.logger.log(`${method} ${url} - ${duration}ms`)
      }),
    )
  }
}
```

---

## 🟢 Fase 5: Documentación y DevOps (1-2 semanas)

### Semana 12: Documentación

#### Tarea 5.1: Actualizar Swagger

**Actualizar: `src/main.ts`**
```typescript
const config = new DocumentBuilder()
  .setTitle('Raíces para Florecer API')
  .setDescription(`
    API del ecosistema digital para personas con discapacidad en México.
    
    ## Autenticación
    Todos los endpoints protegidos requieren un token JWT en el header \`Authorization: Bearer <token>\`.
    
    ## Roles
    - **pcd**: Persona con discapacidad
    - **tutor**: Tutor o cuidador
    - **institucion**: Institución proveedora
    - **admin**: Administrador de la plataforma
    
    ## Rate Limiting
    - Login: 5 intentos por minuto
    - Registro: 3 por hora
    - General: 100 por minuto
  `)
  .setVersion('1.0.0')
  .addBearerAuth()
  .addServer('http://localhost:7000', 'Desarrollo')
  .addServer('https://api.raices.mx', 'Producción')
  .build()
```

---

### Semana 13: DevOps

#### Tarea 5.2: Dockerfile Optimizado

**Actualizar: `Dockerfile`**
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Production stage
FROM node:20-alpine AS production
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Security: non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001
USER nestjs

EXPOSE 7000
CMD ["node", "dist/main.js"]
```

---

## 📊 Resumen de Entregables por Fase

| Fase | Entregables | Archivos Creados/Modificados |
|------|-------------|------------------------------|
| Fase 1 | Helmet, Rate Limiting, Health Check, Validación | 5-8 archivos |
| Fase 2 | Tests unitarios, integración, seguridad | 10-15 archivos |
| Fase 3 | Repository Pattern, Separación de concerns | 15-20 archivos |
| Fase 4 | Logging, Métricas | 3-5 archivos |
| Fase 5 | Documentación, DevOps | 3-5 archivos |

**Total estimado:** 35-55 archivos creados/modificados

---

## ✅ Checklist de Aceptación

### Fase 1
- [ ] Helmet instalado y funcionando
- [ ] Rate limiting diferenciado por endpoint
- [ ] Health check endpoint respondiendo
- [ ] DTOs con validación completa
- [ ] Sanitización XSS implementada

### Fase 2
- [ ] Tests para AI Service (>80% coverage)
- [ ] Tests para Storage Service (>80% coverage)
- [ ] Tests de integración para auth flow
- [ ] Tests de rate limiting
- [ ] Mock helpers compartidos

### Fase 3
- [ ] Repository Pattern implementado
- [ ] AdminService separado en 3 servicios
- [ ] Interfaces definidas
- [ ] Barrel exports configurados

### Fase 4
- [ ] Logging estructurado con Pino
- [ ] Métricas básicas implementadas
- [ ] Performance monitoring

### Fase 5
- [ ] Swagger actualizado
- [ ] README mejorado
- [ ] Dockerfile optimizado
- [ ] Health check en Cloud Run configurado
