# 🔒 Análisis de Seguridad — Raíces para Florecer Backend

**Fecha:** 6 de agosto, 2026  
**Objetivo:** Evaluación completa de la postura de seguridad del backend.

---

## 📊 Resumen de Seguridad

| Área | Estado | Calificación |
|------|--------|-------------|
| Autenticación | ✅ Firebase Auth + JWT | ⭐⭐⭐⭐ |
| Autorización | ✅ Guards + Roles | ⭐⭐⭐⭐ |
| Rate Limiting | ✅ ThrottlerModule | ⭐⭐⭐ |
| Validación de entrada | ⚠️ Parcial | ⭐⭐⭐ |
| CORS | ✅ Configurado | ⭐⭐⭐⭐ |
| Protección de datos | ⚠️ Mejorable | ⭐⭐⭐ |
| Logging seguro | ⚠️ Parcial | ⭐⭐⭐ |
| Infraestructura | ✅ Docker + Cloud Run | ⭐⭐⭐⭐ |

---

## ✅ Controles de Seguridad Implementados

### 1. Autenticación Firebase Auth
```typescript
// firebase-auth.guard.ts
const decodedToken = await getAuth().verifyIdToken(token)
const doc = await this.db.collection(COLECCIONES.perfiles).doc(decodedToken.uid).get()
```
- ✅ Tokens JWT verificados con Firebase Admin SDK
- ✅ Verificación de cuenta activa (`perfil.activo === false`)
- ✅ Búsqueda de perfil en Firestore para roles y features

### 2. Sistema de Roles
```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
```
- ✅ Roles definidos: `pcd`, `tutor`, `institucion`, `admin`
- ✅ Guards reutilizables por endpoint
- ✅ Normalización de roles legacy (`institution` → `institucion`)

### 3. Feature Flags
```typescript
@UseGuards(JwtAuthGuard, FeatureGuard)
@Feature('chat')
```
- ✅ Control granular de funcionalidades por usuario
- ✅ Admin bypass para todas las features
- ✅ Mensajes de error descriptivos

### 4. Rate Limiting
```typescript
ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])
// 100 requests por minuto por IP
```
- ✅ Protección contra brute force
- ⚠️ Sin rate limiting diferenciado por endpoint

### 5. CORS
```typescript
app.enableCors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true) // Servidor a servidor
    if (allowedOrigins.includes(origin)) return callback(null, true)
    if (origin && /^https?:\/\/.+\.run\.app$/.test(origin)) {
      return callback(null, true) // Cloud Run
    }
    callback(new Error(`Origin ${origin} not allowed by CORS`))
  },
  credentials: true,
})
```
- ✅ Whitelist de orígenes
- ✅ Permitir peticiones sin origen (servidor a servidor)
- ✅ Cloud Run permitido

### 6. Validación de Firebase Service Account
```typescript
// firebase.provider.ts
const requiredFields = ['type', 'project_id', 'private_key', 'client_email']
const missingFields = requiredFields.filter((f) => !parsed[f])

if (parsed.type !== 'service_account') { throw }
if (parsed.project_id !== projectId) { throw }
if (parsed.private_key && !parsed.private_key.includes('-----BEGIN')) {
  logger.warn('Private key no parece PEM')
}
```
- ✅ Validación estricta de estructura
- ✅ Verificación de consistencia project_id
- ✅ Warning de formato PEM

### 7. ValidationPipe Global
```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,        // Elimina propiedades no decoradas
  transform: true,        // Transforma tipos automáticamente
  transformOptions: {
    enableImplicitConversion: true,
  },
}))
```
- ✅ `whitelist: true` elimina propiedades extra
- ✅ Transformación automática de tipos

### 8. Soft Delete
```typescript
// En lugar de eliminar físicamente
await doc.ref.update({ activa: false, fechaEliminacion: new Date().toISOString() })
```
- ✅ Preservación de datos históricos
- ✅ Posibilidad de recuperación

---

## ⚠️ Vulnerabilidades y Áreas de Mejora

### 1. 🟡 Falta de Sanitización XSS
**Riesgo:** Medio  
**Descripción:** No hay sanitización de entrada para campos de texto libre.

```typescript
// community.service.ts - El contenido se almacena sin sanitizar
async createPost(grupoId: string, autorId: string, contenido: string) { ... }

// messages.service.ts - Mensajes directos sin sanitizar
async sendMessage(remitenteId: string, destinatarioId: string, contenido: string) { ... }
```

**Recomendación:**
```typescript
import { sanitize } from 'class-sanitizer'
// O usar DOMPurify en el frontend para rendering
```

### 2. 🟡 Tokens de Firebase API Key en URLs
**Riesgo:** Bajo-Medio  
**Descripción:** La API key se construye en URLs de petición:
```typescript
this.identityToolkitUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${this.firebaseApiKey}`
```
- La API key de Firebase es pública por diseño (se valida por IP/domain)
- Pero se debería configurar en Firebase Console la lista de dominios permitidos

**Recomendación:** Configurar `API_KEY` restrictions en Firebase Console.

### 3. 🟡 Falta de Helmet (Headers de Seguridad)
**Riesgo:** Medio  
**Descripción:** No hay configuración de headers de seguridad HTTP:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security`
- `Content-Security-Policy`

**Recomendación:**
```bash
npm install helmet @types/helmet
```
```typescript
import * as helmet from 'helmet'
app.use(helmet())
```

### 4. 🟡 Rate Limiting Global Sin Diferenciación
**Riesgo:** Medio  
**Descripción:** El rate limiting es el mismo para todos los endpoints:
```typescript
ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])
```

**Problema:** Endpoints sensibles como login y registro deberían tener límites más estrictos.

**Recomendación:**
```typescript
// Para login: 5 intentos por minuto
@UseGuards(ThrottlerGuard)
@Throttle(5, 60)
async login(@Body() dto: LoginDto) { ... }

// Para registro: 3 por hora
@Throttle(3, 3600)
async register(@Body() dto: RegisterDto) { ... }
```

### 5. 🟡 Logging de Datos Sensibles
**Riesgo:** Medio  
**Descripción:** Algunos logs podrían exponer información sensible:

```typescript
// admin.service.ts
this.logger.warn(`No se pudo eliminar archivo de Storage: ${err.message}`)

// auth.service.ts
this.logger.error(`Firebase Auth user creation failed: ${e?.message ?? e}`)
```

**Recomendación:** 
- No loguear tokens, emails completos, o stack traces en producción
- Usar logging estructurado con niveles apropiados

### 6. 🟠 Falta de Validación de Owner en Algunos Endpoints
**Riesgo:** Medio-Alto  
**Descripción:** En algunos servicios, la validación de propiedad se hace en el servicio, no en el guard:

```typescript
// institutions.service.ts
async update(id: string, dto: UpdateInstitucionDto, usuarioId: string, rol: string) {
  const creadoPor = doc.data()?.creadoPor
  if (rol !== 'admin' && creadoPor !== usuarioId) {
    throw new ForbiddenException('No tienes permisos')
  }
}
```

**Recomendación:** Crear un `@OwnershipGuard` o usar `@Authorize()` decorator para consistencia.

### 7. 🟠 Sin Auditing Trail
**Riesgo:** Medio  
**Descripción:** No hay registro de acciones importantes:
- Quién creó/modificó/eliminó un recurso
- Cambios de roles
- Login/logout

**Recomendación:** Crear colección `auditoria` en Firestore:
```typescript
await this.db.collection('auditoria').add({
  accion: 'UPDATE_ROL',
  entidad: 'perfiles',
  entidadId: userId,
  actorId: adminId,
  antes: { rol: 'pcd' },
  despues: { rol: 'tutor' },
  timestamp: new Date().toISOString(),
})
```

### 8. 🟠 Sin Content Security Policy para AI
**Riesgo:** Bajo  
**Descripción:** El servicio de AI envía el perfil del usuario completo a la API de Vertex AI (Gemini):
```typescript
const sistema = `Eres el asistente de Raíces para Florecer...
Perfil del usuario: etapa=${perfil?.etapaVida ?? 'no especificada'}, discapacidades=${tiposDiscapacidad}.`
```

**Recomendación:** 
- Anonimizar datos sensibles antes de enviarlos a APIs externas
- Revisar compliance con GDPR/LFPDPPP
- Nota: Vertex AI está dentro del ecosistema GCP, lo cual reduce el riesgo de cumplimiento

### 9. 🟡 Sin Validación de Tamaño de Archivos
**Riesgo:** Bajo  
**Descripción:** El endpoint de upload de avatares no valida tamaño máximo:
```typescript
// users.controller.ts
@Post('avatar')
async uploadAvatar(@UploadedFile() file: Express.Multer.File) { ... }
```

**Recomendación:**
```typescript
@UseInterceptors(FileInterceptor('file', {
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.match(/^image\/(jpeg|png|webp)$/)) {
      return cb(new BadRequestException('Solo se permiten imágenes'), false)
    }
    cb(null, true)
  }
}))
```

### 10. 🟡 Sin CSRF Protection
**Riesgo:** Bajo (API stateless con JWT)  
**Descripción:** Como es una API REST con JWT, CSRF no es un vector principal. Pero:
- Si se usa cookies para refresh tokens, se necesita CSRF
- Actualmente se usan tokens en body, así que el riesgo es bajo

---

## 🔐 Matriz de Seguridad por Endpoint

### Auth Endpoints
| Endpoint | Auth | Rate Limit | Validación | Riesgo |
|----------|------|------------|------------|--------|
| POST /auth/register | ❌ | Global (100/min) | ✅ DTO | ⚠️ Medio |
| POST /auth/login | ❌ | Global (100/min) | ✅ DTO | ⚠️ Medio |
| POST /auth/refresh | ❌ | Global (100/min) | ✅ DTO | ✅ Bajo |
| GET /auth/me | ✅ JWT | Global | N/A | ✅ Bajo |

### Users Endpoints
| Endpoint | Auth | Roles | Rate Limit | Riesgo |
|----------|------|-------|------------|--------|
| GET /users/profile | ✅ JWT | Any | Global | ✅ Bajo |
| PUT /users/profile | ✅ JWT | Any | Global | ✅ Bajo |
| POST /users/avatar | ✅ JWT | Any | Global | ⚠️ Sin validación tamaño |
| DELETE /users/dependiente/:id | ✅ JWT | tutor | Global | ✅ Bajo |

### Institutions Endpoints
| Endpoint | Auth | Roles | Rate Limit | Riesgo |
|----------|------|-------|------------|--------|
| GET /institutions | ❌ | Public | Global | ✅ Bajo |
| POST /institutions | ✅ JWT | Any | Global | ✅ Bajo |
| PUT /institutions/:id | ✅ JWT | Owner/Admin | Global | ✅ Bajo |
| DELETE /institutions/:id | ✅ JWT | Owner/Admin | Global | ✅ Bajo |

### Admin Endpoints
| Endpoint | Auth | Roles | Rate Limit | Riesgo |
|----------|------|-------|------------|--------|
| GET /admin/stats | ✅ JWT | admin | Global | ✅ Bajo |
| PUT /admin/user/:id/active | ✅ JWT | admin | Global | ✅ Bajo |
| DELETE /admin/user/:id | ✅ JWT | admin | Global | ✅ Bajo |
| POST /admin/institution/:id/approve | ✅ JWT | admin | Global | ✅ Bajo |

### Messages Endpoints
| Endpoint | Auth | Roles | Rate Limit | Riesgo |
|----------|------|-------|------------|--------|
| GET /messages/conversations | ✅ JWT | Any | Global | ✅ Bajo |
| POST /messages/send | ✅ JWT | Any | Global | ⚠️ Sin rate limit diferenciado |
| GET /messages/:socioId | ✅ JWT | Any | Global | ✅ Bajo |

### AI Endpoints
| Endpoint | Auth | Roles | Rate Limit | Riesgo |
|----------|------|-------|------------|--------|
| POST /ai/chat | ✅ JWT | Any | Global | ⚠️ Datos a API externa |
| POST /ai/recommend | ✅ JWT | Any | Global | ⚠️ Datos a API externa |

---

## 🛡️ Recomendaciones de Seguridad

### Prioridad Alta
1. **Instalar Helmet** para headers de seguridad HTTP
2. **Rate limiting diferenciado** para login/registro
3. **Sanitización de XSS** en campos de texto libre
4. **Validación de tamaño de archivos** en uploads

### Prioridad Media
5. **Auditing trail** para acciones críticas
6. **Validación de ownership consistente** con decorator/guard
7. **Logging estructurado** sin datos sensibles
8. **Anonimización de datos** antes de enviar a APIs externas

### Prioridad Baja
9. **CSP headers** para prevenir injection
10. **Rotate API keys** periódicamente
11. **Secret scanning** en CI/CD
12. **Dependency scanning** con Snyk/npm audit

---

## 📋 Checklist de Seguridad Pre-Producción

- [ ] Helmet instalado y configurado
- [ ] Rate limiting diferenciado para auth endpoints
- [ ] Sanitización XSS en todos los campos de texto
- [ ] Validación de tamaño en uploads
- [ ] Logging estructurado sin datos sensibles
- [ ] Auditoría trail para acciones críticas
- [ ] CORS configurado solo para dominios de producción
- [ ] HTTPS forzado en Cloud Run
- [ ] Firebase Security Rules revisados
- [ ] Variables de entorno en Secret Manager (no en .env)
- [ ] npm audit sin vulnerabilidades críticas
- [ ] Health check endpoint funcionando
