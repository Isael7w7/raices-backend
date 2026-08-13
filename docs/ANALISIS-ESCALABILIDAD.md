# 🚀 Análisis de Escalabilidad — Raíces Backend

**Fecha:** 13 de agosto, 2026
**Objetivo:** Evaluar el estado actual del código y proponer mejoras para escalabilidad

---

## 📊 Tabla Comparativa: Estado Actual vs Estado Propuesto

| Área | Estado Actual | Estado Propuesto | Impacto | Esfuerzo |
|------|---------------|------------------|---------|----------|
| **1. Logging** | `console.log/error/warn` en seed y main.ts | `@nestjs/common` Logger en todos los services | 🔴 Alto | 🟡 Medio |
| **2. Repository Pattern** | Services acceden directamente a Firestore | Capa Repository abstrae acceso a datos | 🔴 Alto | 🔴 Alto |
| **3. Caching** | Sin caché (solo ETag) | Redis o caché en memoria para datos estáticos | 🔴 Alto | 🟡 Medio |
| **4. Rate Limiting Diferenciado** | Global (60/min) | Por endpoint: auth (5/min), AI (20/min) | 🟡 Medio | 🟢 Bajo |
| **5. Batch Operations** | Queries individuales (N+1) | Batch lookups y transacciones | 🟡 Medio | 🟡 Medio |
| **6. Índices Firestore** | Algunos creados | Todos los queries optimizados | 🟡 Medio | 🟢 Bajo |
| **7. Validación de Entrada** | DTOs con class-validator | + Sanitización XSS, validación estricta | 🟡 Medio | 🟢 Bajo |
| **8. Health Check** | `GET /api/health` básico | + Métricas de DB, memoria, uptime | 🟢 Bajo | 🟢 Bajo |
| **9. Métricas/监控** | Sin métricas | Prometheus o similar para monitoreo | 🟡 Medio | 🟡 Medio |
| **10. Documentación** | Swagger configurado | + Ejemplos reales, error codes, versionado | 🟢 Bajo | 🟢 Bajo |

---

## 🔍 Análisis Detallado por Área

### 1. Logging Estructurado

**Estado Actual:**
```typescript
// seed.ts - console.log (aceptable para scripts)
console.log("🌱 Sembrando datos demo en Firestore...")

// main.ts - console.log (aceptable para bootstrap)
console.log(`Raíces API running on http://localhost:${port}`)
```

**Problema:**
- Los services no usan logging estructurado
- No hay forma de filtrar logs por nivel (debug, info, warn, error)
- No hay correlación de requests (request ID)

**Estado Propuesto:**
```typescript
// En cada service
import { Logger } from '@nestjs/common'

@Injectable()
export class UsersService {
  private readonly logger = new Logger('UsersService')

  async getProfile(usuarioId: string) {
    this.logger.debug(`Obteniendo perfil: ${usuarioId}`)
    try {
      const doc = await this.col(COLECCIONES.perfiles).doc(usuarioId).get()
      if (!doc.exists) {
        this.logger.warn(`Perfil no encontrado: ${usuarioId}`)
        throw new NotFoundException('Usuario no encontrado')
      }
      this.logger.debug(`Perfil obtenido: ${usuarioId}`)
      return { id: doc.id, ...doc.data()! }
    } catch (error) {
      this.logger.error(`Error al obtener perfil ${usuarioId}: ${error.message}`)
      throw error
    }
  }
}
```

**Justificación:**
- **Facilita debugging**: Con logs estructurados puedes filtrar por service, nivel y request ID
- **Monitoreo**: Los logs se pueden enviar a servicios como ELK, Datadog o Cloud Logging
- **Auditoría**: Registro de acciones para compliance (LFPDPPP en México)
- **Rendimiento**: NestJS Logger es más eficiente que console.log (no bloquea el event loop)

---

### 2. Repository Pattern

**Estado Actual:**
```typescript
// Cada service accede directamente a Firestore
@Injectable()
export class UsersService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async getProfile(usuarioId: string) {
    const doc = await this.db.collection(COLECCIONES.perfiles).doc(usuarioId).get()
    // ...
  }
}
```

**Problema:**
- Lógica de acceso a datos mezclada con lógica de negocio
- Difícil de testear (requiere mock extenso de Firestore)
- Imposible cambiar de base de datos sin modificar cada service

**Estado Propuesto:**
```typescript
// users.repository.ts - Solo acceso a datos
@Injectable()
export class UsersRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async findById(id: string): Promise<PerfilDoc | null> {
    const doc = await this.db.collection(COLECCIONES.perfiles).doc(id).get()
    return doc.exists ? { id: doc.id, ...doc.data()! } : null
  }

  async update(id: string, data: Partial<PerfilDoc>): Promise<void> {
    await this.db.collection(COLECCIONES.perfiles).doc(id).update(data)
  }
}

// users.service.ts - Solo lógica de negocio
@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly storage: StorageService,
  ) {}

  async getProfile(usuarioId: string) {
    const perfil = await this.repo.findById(usuarioId)
    if (!perfil) throw new NotFoundException('Usuario no encontrado')
    return perfil
  }
}
```

**Justificación:**
- **Testeabilidad**: Puedes mockear el Repository en lugar de Firestore completo
- **Separación de responsabilidades**: Business logic vs Data access
- **Flexibilidad**: Podrías migrar a PostgreSQL o MongoDB cambiando solo el Repository
- **Reutilización**: Múltiples services pueden usar el mismo Repository

---

### 3. Caching

**Estado Actual:**
- Solo ETag en responses (30s TTL)
- Sin caché para datos estáticos (catálogos, features)

**Problema:**
- Cada request consulta Firestore (latencia ~100ms)
- Catálogos no cambian frecuentemente pero se consultan mucho

**Estado Propuesto:**
```typescript
// catalogs.service.ts con caché en memoria
@Injectable()
export class CatalogsService {
  private readonly cache = new Map<string, { data: any; expiry: number }>()
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutos

  async getCatalogos() {
    const cached = this.cache.get('catalogos')
    if (cached && cached.expiry > Date.now()) {
      return cached.data
    }

    const data = await this.fetchCatalogosFromDB()
    this.cache.set('catalogos', { data, expiry: Date.now() + this CACHE_TTL })
    return data
  }
}
```

**Alternativa: Redis**
```typescript
// Para distribución multi-instancia
@Injectable()
export class CatalogsService {
  constructor(@Inject('REDIS') private readonly redis: Redis) {}

  async getCatalogos() {
    const cached = await this.redis.get('catalogos')
    if (cached) return JSON.parse(cached)

    const data = await this.fetchCatalogosFromDB()
    await this.redis.setex('catalogos', 300, JSON.stringify(data))
    return data
  }
}
```

**Justificación:**
- **Reducción de latencia**: Cache hit = ~1ms vs Firestore = ~100ms
- **Reducción de costos**: Menos lecturas en Firestore (se cobran por lectura)
- **Disponibilidad**: Si Firestore falla, los datos cacheados siguen disponibles
- **Escalabilidad**: Redis permite caché compartido entre múltiples instancias

---

### 4. Rate Limiting Diferenciado

**Estado Actual:**
```typescript
// Global: 60 requests/min por IP
ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }])
```

**Problema:**
- Login y registro tienen el mismo límite que endpoints normales
- AI (Vertex AI) es costoso pero no tiene límite estricto

**Estado Propuesto:**
```typescript
// auth.controller.ts
@Post('register')
@Throttle({ default: { limit: 3, ttl: 300000 } }) // 3 registros cada 5 min
register(@Body() dto: RegisterDto) { ... }

@Post('login')
@Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 intentos por minuto
login(@Body() dto: LoginDto) { ... }

// ai.controller.ts
@Post('chat')
@Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 chats por minuto
chat(@Body() dto: AiChatDto) { ... }

@Post('recommendations')
@Throttle({ default: { limit: 5, ttl: 300000 } }) // 5 recomendaciones cada 5 min
recommend(@Body() dto: AiRecommendDto) { ... }
```

**Justificación:**
- **Protección contra brute force**: Login con 5 intentos/min previene fuerza bruta
- **Control de costos**: AI con límite estricto previene gastos inesperados
- **Fair use**: Usuarios legítimos no se ven afectados (5/min es generoso)
- **Cumplimiento**: OWASP Top 10 recomienda rate limiting en endpoints sensibles

---

### 5. Batch Operations (Anti N+1)

**Estado Actual:**
```typescript
// jobs.service.ts - N+1 queries
const vacantes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
for (const vacante of vacantes) {
  const instDoc = await this.db.collection(COLECCIONES.instituciones).doc(vacante.institucionId).get()
  // ...
}
```

**Problema:**
- Con 50 vacantes = 51 queries (1 lista + 50 instituciones)
- Latencia lineal: 50 * 100ms = 5 segundos

**Estado Propuesto:**
```typescript
// Batch lookup (ya implementado parcialmente)
const instIds = [...new Set(vacantes.map(v => v.institucionId))]
const mapaInst = await obtenerDocumentosPorIds(this.db, COLECCIONES.instituciones, instIds)
```

**Mejora adicional:**
```typescript
// Transacciones para operaciones atómicas
async updateUserProfile(userId: string, data: any) {
  const batch = this.db.batch()
  batch.update(this.db.collection(COLECCIONES.perfiles).doc(userId), data)
  batch.update(this.db.collection(COLECCIONES.perfilesExtendidos).doc(userId), data)
  await batch.commit()
}
```

**Justificación:**
- **Reducción de latencia**: 2 queries en lugar de 51
- **Reducción de costos**: Firestore cobra por operación, no por lote
- **Consistencia**: Batch operations son atómicas (todo o nada)
- **Escalabilidad**: Con 10,000 vacantes, la diferencia es 2 queries vs 10,001

---

### 6. Índices Firestore Optimizados

**Estado Actual:**
- Algunos índices en `firestore.indexes.json`
- Queries con `.orderBy()` que fallan sin índice compuesto

**Problema:**
- Errores de índice en producción
- Queries lentas sin índices adecuados

**Estado Propuesto:**
```json
// firestore.indexes.json - Índices faltantes
{
  "indexes": [
    {
      "collectionGroup": "postulaciones",
      "fields": [
        { "fieldPath": "vacanteId", "order": "ASCENDING" },
        { "fieldPath": "usuarioId", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "publicaciones",
      "fields": [
        { "fieldPath": "autorId", "order": "ASCENDING" },
        { "fieldPath": "fechaCreacion", "order": "DESCENDING" }
      ]
    }
  ]
}
```

**Justificación:**
- **Queries rápidas**: Índices compuestos permiten filtros + ordenamiento sin carga en memoria
- **Consistencia**: Firestore puede fallar sin índices (error 500)
- **Escalabilidad**: Con millones de documentos, los índices son críticos

---

### 7. Health Check Mejorado

**Estado Actual:**
```typescript
// health.controller.ts
@Get()
check() {
  return { status: 'ok', timestamp: new Date().toISOString() }
}
```

**Estado Propuesto:**
```typescript
@Get()
async check() {
  const [dbStatus, memoryUsage] = await Promise.all([
    this.checkDatabase(),
    this.checkMemory(),
  ])

  return {
    status: dbStatus && memoryUsage ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus ? 'up' : 'down',
      memory: {
        used: memoryUsage.used,
        total: memoryUsage.total,
        percentage: memoryUsage.percentage,
      },
    },
    uptime: process.uptime(),
  }
}

private async checkDatabase(): Promise<boolean> {
  try {
    await this.db.collection('_health').doc('ping').get()
    return true
  } catch {
    return false
  }
}
```

**Justificación:**
- **Monitoreo proactivo**: Detectar problemas antes de que los usuarios los reporten
- **Load balancers**: Cloud Run usa health checks para decidir routing
- **Debugging**: Saber si el problema es DB, memoria o CPU
- **SLA**: Métricas para calcular disponibilidad real

---

### 8. Métricas y Monitoring

**Estado Actual:**
- Sin métricas de rendimiento
- Sin alertas

**Estado Propuesto:**
```typescript
// Opción 1: Prometheus con nestjs-prometheus
import { Counter, Histogram } from 'prom-client'

@Injectable()
export class MetricsService {
  private readonly requestCounter = new Counter({
    name: 'http_requests_total',
    help: 'Total de requests HTTP',
    labelNames: ['method', 'route', 'status'],
  })

  private readonly requestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duración de requests HTTP',
    labelNames: ['method', 'route'],
    buckets: [0.1, 0.5, 1, 2, 5],
  })

  recordRequest(method: string, route: string, status: number, duration: number) {
    this.requestCounter.inc({ method, route, status })
    this.requestDuration.observe({ method, route }, duration)
  }
}
```

**Opción 2: Google Cloud Monitoring (sin dependencias)**
```typescript
// main.ts - Middleware simple
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    console.log(JSON.stringify({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      timestamp: new Date().toISOString(),
    }))
  })
  next()
})
```

**Justificación:**
- **Visibilidad**: Saber qué endpoints son lentos o tienen errores
- **Capacity planning**: Entender cuándo escalar
- **Alertas**: Notificar cuando algo falla (error rate > 5%)
- **Cost optimization**: Identificar endpoints que consumen más recursos

---

## 📋 Plan de Implementación Priorizado

### Fase 1: Fundamentos (1-2 semanas)
| Prioridad | Tarea | Impacto | Esfuerzo |
|-----------|-------|---------|----------|
| 🔴 Alta | Agregar Logger a todos los services | Alto | Medio |
| 🔴 Alta | Rate limiting diferenciado | Alto | Bajo |
| 🔴 Alta | Health check mejorado | Medio | Bajo |

### Fase 2: Rendimiento (2-3 semanas)
| Prioridad | Tarea | Impacto | Esfuerzo |
|-----------|-------|---------|----------|
| 🟡 Media | Caching para catálogos | Alto | Medio |
| 🟡 Media | Optimizar queries N+1 | Alto | Medio |
| 🟡 Media | Índices Firestore faltantes | Medio | Bajo |

### Fase 3: Arquitectura (1-2 meses)
| Prioridad | Tarea | Impacto | Esfuerzo |
|-----------|-------|---------|----------|
| 🟡 Media | Repository Pattern (gradual) | Alto | Alto |
| 🟢 Baja | Métricas con Prometheus | Medio | Medio |
| 🟢 Baja | Documentación mejorada | Bajo | Bajo |

---

## 🎯 Métricas de Éxito

| Métrica | Actual | Objetivo |
|---------|--------|----------|
| Latencia promedio (p95) | ~200ms | <100ms |
| Error rate | Desconocido | <1% |
| Firestore reads/request | ~5-10 | <3 |
| Cache hit rate | 0% | >60% (catálogos) |
| Test coverage | ~60% | >80% |

---

## 📚 Recursos

- [NestJS Scalability](https://docs.nestjs.com/recipes/scalability)
- [Firestore Best Practices](https://firebase.google.com/docs/firestore/best-practices)
- [OWASP Rate Limiting](https://cheatsheetseries.owasp.org/cheatsheets/Rate_Limiting_Cheat_Sheet.html)
- [Redis Caching Patterns](https://redis.io/docs/manual/patterns/)

---

*Documento generado por análisis de código fuente - Raíces Backend*
