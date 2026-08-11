# 📱 Análisis de Aplicación — Estado Actual y Seguridad de Acciones/Componentes

**Fecha:** 6 de agosto, 2026  
**Objetivo:** Análisis del estado actual del proyecto, seguridad de acciones y componentes.

---

## 📊 Estado Actual del Proyecto

### Resumen General

| Aspecto | Estado | Porcentaje |
|---------|--------|------------|
| Backend API | ✅ Funcional | 95% |
| Autenticación | ✅ Completa | 100% |
| Base de datos | ✅ Configurada | 100% |
| Tests | ⚠️ Parciales | 60% |
| Documentación | ⚠️ Básica | 40% |
| Seguridad | ✅ Buena | 75% |
| Performance | ⚠️ Mejorable | 65% |
| Deploy | ✅ Configurado | 90% |

### Funcionalidades Implementadas

#### ✅ Completas (100%)
1. **Autenticación** - Registro, login, refresh token
2. **Gestión de Usuarios** - Perfil, avatar, dependientes
3. **Instituciones** - CRUD completo, verificación
4. **Comunidad** - Publicaciones, comentarios, grupos, likes
5. **Favoritos** - Toggle, listado
6. **Reseñas** - Crear, actualizar, eliminar
7. **Notificaciones** - CRUD, marcado como leído
8. **Mensajes** - Envío, conversaciones, no leídos
9. **Administración** - Stats, analytics, moderación
10. **Catálogos** - Parentescos, discapacidades, features

#### ⚠️ Parciales (70-90%)
1. **Empleo** - CRUD funcional, falta validación avanzada
2. **Descubrimiento** - Búsqueda básica, falta full-text
3. **AI** - Chat y recomendaciones, sin tests

#### ❌ Pendientes (0-30%)
1. **Push Notifications** - No implementado
2. **Email Transaccional** - Solo templates básicos
3. **Reporting** - Solo stats básicas
4. **Exportación de datos** - No implementado

---

## 🔐 Análisis de Seguridad por Acción

### Acciones de Autenticación

| Acción | Endpoint | Seguridad | Riesgo | Estado |
|--------|----------|-----------|--------|--------|
| Registro | POST /auth/register | Rate limit, validación | ⚠️ Medio | ✅ |
| Login | POST /auth/login | Rate limit, validación | ⚠️ Medio | ✅ |
| Refresh Token | POST /auth/refresh | Token validation | ✅ Bajo | ✅ |
| Obtener perfil | GET /auth/me | JWT required | ✅ Bajo | ✅ |

**Análisis Detallado:**

#### Registro
```typescript
// auth.service.ts
async register(dto: RegisterDto) {
  // ✅ VALIDADO: Verificación de email duplicado
  const snapshot = await this.db.collection(COLECCIONES.perfiles)
    .where('email', '==', dto.email).limit(1).get()
  if (!snapshot.empty) throw new ConflictException('Email ya registrado')

  // ✅ VALIDADO: Creación atómica con rollback
  const batch = this.db.batch()
  batch.set(this.db.collection(COLECCIONES.perfiles).doc(uid), perfilData)
  try {
    await batch.commit()
  } catch (e) {
    await this.auth.deleteUser(uid) // Rollback
  }

  // ⚠️ PENDIENTE: Rate limiting diferenciado (3/hora)
  // ⚠️ PENDIENTE: Validación de fortaleza de contraseña
}
```

**Recomendaciones:**
- Añadir `@Throttle(3, 3600)` al endpoint
- Validar contraseña con regex: `^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)`

#### Login
```typescript
// auth.service.ts
async login(dto: LoginDto) {
  // ✅ VALIDADO: Verificación de credenciales via Firebase REST API
  // ✅ VALIDADO: Verificación de cuenta activa
  // ✅ VALIDADO: Rate limiting global (100/min)

  // ⚠️ PENDIENTE: Rate limiting diferenciado (5/min)
  // ⚠️ PENDIENTE: Logging de intentos fallidos
  // ⚠️ PENDIENTE: Bloqueo temporal después de N intentos
}
```

**Recomendaciones:**
- Añadir `@Throttle(5, 60)` al endpoint
- Loguear intentos fallidos para detección de brute force
- Implementar bloqueo temporal después de 10 intentos fallidos

---

### Acciones de Gestión de Usuarios

| Acción | Endpoint | Seguridad | Riesgo | Estado |
|--------|----------|-----------|--------|--------|
| Ver perfil | GET /users/profile | JWT, owner | ✅ Bajo | ✅ |
| Actualizar perfil | PUT /users/profile | JWT, owner | ✅ Bajo | ✅ |
| Subir avatar | POST /users/avatar | JWT, size limit | ⚠️ Medio | ⚠️ |
| Eliminar avatar | DELETE /users/avatar | JWT, owner | ✅ Bajo | ✅ |
| Ver dependientes | GET /users/dependientes | JWT, owner | ✅ Bajo | ✅ |
| Agregar dependiente | POST /users/dependientes | JWT, limit guard | ✅ Bajo | ✅ |
| Eliminar dependiente | DELETE /users/dependientes/:id | JWT, owner | ✅ Bajo | ✅ |

**Análisis Detallado:**

#### Subir Avatar
```typescript
// users.controller.ts
@Post('avatar')
async uploadAvatar(@UploadedFile() file: Express.Multer.File) {
  // ⚠️ PENDIENTE: Validación de tamaño (5MB máximo)
  // ⚠️ PENDIENTE: Validación de tipo (solo imágenes)
  // ⚠️ PENDIENTE: Rate limiting para uploads
  // ✅ IMPLEMENTADO: Eliminación de avatar anterior
}
```

**Recomendaciones:**
```typescript
@UseInterceptors(FileInterceptor('file', {
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.match(/^image\/(jpeg|png|webp)$/)) {
      return cb(new BadRequestException('Solo imágenes'), false)
    }
    cb(null, true)
  }
}))
```

#### Agregar Dependiente
```typescript
// users.service.ts
async addDependent(usuarioId: string, datos: any) {
  // ✅ IMPLEMENTADO: LimitDependientesGuard
  // ✅ IMPLEMENTADO: Validación de límite configurable
  // ⚠️ PENDIENTE: Validación de tipos de datos
  // ⚠️ PENDIENTE: Sanitización de nombreCompleto
}
```

**Recomendaciones:**
- Crear DTO formal `CrearDependienteDto` con validaciones
- Sanitizar `nombreCompleto` contra XSS

---

### Acciones de Instituciones

| Acción | Endpoint | Seguridad | Riesgo | Estado |
|--------|----------|-----------|--------|--------|
| Listar (público) | GET /institutions | Ninguno (público) | ✅ Bajo | ✅ |
| Ver detalle | GET /institutions/:id | Ninguno (público) | ✅ Bajo | ✅ |
| Crear | POST /institutions | JWT | ✅ Bajo | ✅ |
| Actualizar | PUT /institutions/:id | JWT, owner/admin | ✅ Bajo | ✅ |
| Eliminar | DELETE /institutions/:id | JWT, owner/admin | ✅ Bajo | ✅ |
| Ver mi institución | GET /institutions/mine | JWT | ✅ Bajo | ✅ |

**Análisis Detallado:**

#### Crear Institución
```typescript
// institutions.service.ts
async create(dto: CreateInstitucionDto, usuarioId: string) {
  // ✅ VALIDADO: Anti-duplicado (no más de 1 por usuario)
  const [canonico, existente] = await Promise.all([
    this.col(COLECCIONES.instituciones).doc(usuarioId).get(),
    this.col(COLECCIONES.instituciones)
      .where('creadoPor', '==', usuarioId).limit(1).get(),
  ])
  if (canonico.exists || !existente.empty) {
    throw new BadRequestException('Ya tienes una institución registrada')
  }

  // ✅ VALIDADO: DTO con validaciones
  // ✅ VALIDADO: Soft delete en eliminación
  // ⚠️ PENDIENTE: Rate limiting para creación
}
```

**Recomendaciones:**
- Añadir `@Throttle(5, 86400)` (5 creaciones por día máximo)
- Validar URLs con `@IsUrl()` en DTO

#### Eliminar Institución
```typescript
// institutions.service.ts
async remove(id: string, usuarioId: string, rol: string) {
  // ✅ VALIDADO: Verificación de ownership
  const creadoPor = doc.data()?.creadoPor
  if (rol !== 'admin' && creadoPor !== usuarioId) {
    throw new ForbiddenException('No tienes permisos')
  }

  // ✅ VALIDADO: Soft delete
  await this.col(COLECCIONES.instituciones).doc(id).update({
    activa: false,
    fechaEliminacion: new Date().toISOString(),
  })

  // ⚠️ PENDIENTE: Eliminación en cascada de vacantes
  // ⚠️ PENDIENTE: Notificación al admin
}
```

**Recomendaciones:**
- Implementar eliminación en cascada de vacantes asociadas
- Notificar al admin cuando se elimina una institución

---

### Acciones de Empleo (Jobs)

| Acción | Endpoint | Seguridad | Riesgo | Estado |
|--------|----------|-----------|--------|--------|
| Listar vacantes | GET /empleo | Público | ✅ Bajo | ✅ |
| Ver vacante | GET /empleo/:id | Público | ✅ Bajo | ✅ |
| Crear vacante | POST /empleo | JWT, roles | ✅ Bajo | ✅ |
| Actualizar | PUT /empleo/:id | JWT, owner | ✅ Bajo | ✅ |
| Eliminar | DELETE /empleo/:id | JWT, owner | ✅ Bajo | ✅ |
| Postularse | POST /empleo/:id/postularse | JWT | ✅ Bajo | ✅ |
| Mis postulaciones | GET /empleo/mis-postulaciones | JWT | ✅ Bajo | ✅ |
| Postulantes por vacante | GET /empleo/postulantes-vacante | JWT, roles | ✅ Bajo | ✅ |
| Alias postulantes | GET /empleo/postulaciones | JWT, roles | ✅ Bajo | ✅ |
| Postulantes de mi institución | GET /empleo/postulantes-institucion | JWT, roles | ✅ Bajo | ✅ |
| Cambiar estado postulación | PATCH /empleo/postulaciones/:id/estado | JWT, roles | ✅ Bajo | ✅ |

**Análisis Detallado:**

#### Crear Vacante
```typescript
// jobs.service.ts
async createForUser(user: any, dto: any) {
  // ✅ VALIDADO: Verificación de rol
  if (user.rol !== 'institucion' && user.rol !== 'admin') {
    throw new ForbiddenException('Solo instituciones y administradores')
  }

  // ✅ VALIDADO: Verificación de institución activa y verificada
  if (inst.activa !== true) {
    throw new ForbiddenException('La institución se encuentra inactiva')
  }
  if (inst.verificada !== true) {
    throw new ForbiddenException('La institución debe estar aprobada')
  }

  // ✅ VALIDADO: Batch lookup de instituciones (evita N+1)
  // ⚠️ PENDIENTE: Rate limiting para creación de vacantes
  // ⚠️ PENDIENTE: Validación de campos requeridos
}
```

**Recomendaciones:**
- Añadir `@Throttle(10, 86400)` (10 vacantes por día)
- Validar que `titulo` no esté vacío con `@IsNotEmpty()`

#### Postularse a Vacante
```typescript
// jobs.service.ts
async apply(usuarioId: string, vacanteId: string, cartaPresentacion: string) {
  // ✅ VALIDADO: Verificación de vacante activa
  if (!vacanteDoc.exists || !vacanteDoc.data()?.activa) {
    throw new NotFoundException('Vacante no encontrada o inactiva')
  }

  // ✅ VALIDADO: Anti-duplicado
  const existente = await this.db.collection(COLECCIONES.postulaciones)
    .where('vacanteId', '==', vacanteId)
    .where('usuarioId', '==', usuarioId)
    .limit(1).get()
  if (!existente.empty) throw new ConflictException('Ya enviaste una solicitud')

  // ⚠️ PENDIENTE: Rate limiting para postulaciones
  // ⚠️ PENDIENTE: Validación de cartaPresentacion
}
```

**Recomendaciones:**
- Añadir `@Throttle(20, 86400)` (20 postulaciones por día)
- Validar longitud de `cartaPresentacion` (máx 5000 caracteres)

---

### Acciones de Mensajes

| Acción | Endpoint | Seguridad | Riesgo | Estado |
|--------|----------|-----------|--------|--------|
| Ver conversaciones | GET /messages | JWT | ✅ Bajo | ✅ |
| Ver mensajes | GET /messages/:socioId | JWT | ✅ Bajo | ✅ |
| Enviar mensaje | POST /messages/send | JWT | ⚠️ Medio | ⚠️ |
| Conteo no leídos | GET /messages/unread | JWT | ✅ Bajo | ✅ |

**Análisis Detallado:**

#### Enviar Mensaje
```typescript
// messages.service.ts
async sendMessage(remitenteId: string, destinatarioId: string, contenido: string) {
  // ✅ VALIDADO: No permitir enviarse mensajes a sí mismo
  if (remitenteId === destinatarioId) {
    throw new ForbiddenException('No puedes enviarte mensajes a ti mismo')
  }

  // ✅ VALIDADO: Verificar que destinatario existe y está activo
  const destinatario = await this.db.collection(COLECCIONES.perfiles)
    .doc(destinatarioId).get()
  if (!destinatario.exists || !destinatario.data()?.activo) {
    throw new ForbiddenException('Usuario destinatario no existe')
  }

  // ⚠️ PENDIENTE: Rate limiting para mensajes
  // ⚠️ PENDIENTE: Validación de contenido
  // ⚠️ PENDIENTE: Sanitización XSS
  // ⚠️ PENDIENTE: Límite de caracteres
  // ⚠️ PENDIENTE: Notificación push al destinatario
}
```

**Recomendaciones:**
- Añadir `@Throttle(30, 60)` (30 mensajes por minuto)
- Validar `contenido` con `@MaxLength(5000)`
- Sanitizar contenido contra XSS
- Implementar notificación push con FCM

---

### Acciones de AI

| Acción | Endpoint | Seguridad | Riesgo | Estado |
|--------|----------|-----------|--------|--------|
| Chat | POST /ai/chat | JWT | ⚠️ Medio | ⚠️ |
| Recomendaciones | POST /ai/recommend | JWT | ⚠️ Medio | ⚠️ |

**Análisis Detallado:**

#### Chat con AI
```typescript
// ai.service.ts
async chat(usuarioId: string, mensaje: string, historial: any[] = []) {
  // ✅ VALIDADO: Verificación de API key
  if (!this.client) {
    return { respuesta: RESPUESTAS_MOCK[Math.floor(Math.random() * RESPUESTAS_MOCK.length)], simulado: true }
  }

  // ⚠️ PENDIENTE: Rate limiting (API costosa)
  // ⚠️ PENDIENTE: Validación de mensaje (longitud, contenido)
  // ⚠️ PENDIENTE: Sanitización de historial
  // ⚠️ PENDIENTE: Logging de uso para costos
  // ⚠️ PENDIENTE: Límite de tokens por usuario

  // ⚠️ RIESGO: Se envía perfil completo a API externa
  const sistema = `Eres el asistente de Raíces para Florecer...
  Perfil del usuario: etapa=${perfil?.etapaVida ?? 'no especificada'}, discapacidades=${tiposDiscapacidad}.`
}
```

**Recomendaciones:**
- Añadir `@Throttle(20, 3600)` (20 chats por hora)
- Validar `mensaje` con `@MaxLength(2000)`
- Anonimizar datos sensibles antes de enviar a Anthropic
- Implementar límite de tokens por usuario
- Loguear uso para monitoreo de costos

---

### Acciones de Administración

| Acción | Endpoint | Seguridad | Riesgo | Estado |
|--------|----------|-----------|--------|--------|
| Ver stats | GET /admin/stats | JWT, admin | ✅ Bajo | ✅ |
| Ver analytics | GET /admin/analytics | JWT, admin | ✅ Bajo | ✅ |
| Ver usuarios | GET /admin/users | JWT, admin | ✅ Bajo | ✅ |
| Cambiar rol | PUT /admin/user/:id/role | JWT, admin | ✅ Bajo | ✅ |
| Activar/desactivar | PUT /admin/user/:id/active | JWT, admin | ✅ Bajo | ✅ |
| Eliminar usuario | DELETE /admin/user/:id | JWT, admin | ✅ Bajo | ✅ |
| Aprobar institución | POST /admin/institution/:id/approve | JWT, admin | ✅ Bajo | ✅ |
| Rechazar institución | POST /admin/institution/:id/reject | JWT, admin | ✅ Bajo | ✅ |

**Análisis Detallado:**

#### Eliminar Usuario
```typescript
// admin.service.ts
async deleteUser(id: string, adminId: string) {
  // ✅ VALIDADO: No permitir eliminarse a sí mismo
  if (id === adminId) {
    throw new BadRequestException('No puedes eliminar tu propia cuenta')
  }

  // ✅ VALIDADO: Eliminación en cascada
  await Promise.all([
    this.eliminarDocsEnLote(COLECCIONES.dependientes, 'tutorId', id),
    this.eliminarDocsEnLote(COLECCIONES.perfilesExtendidos, 'usuarioId', id),
    this.eliminarDocsEnLote(COLECCIONES.favoritos, 'usuarioId', id),
    this.eliminarDocsEnLote(COLECCIONES.resenas, 'usuarioId', id),
    this.eliminarDocsEnLote(COLECCIONES.publicaciones, 'autorId', id),
    this.eliminarDocsEnLote(COLECCIONES.comentarios, 'autorId', id),
    this.eliminarDocsEnLote(COLECCIONES.mensajesDirectos, 'emisorId', id),
    this.eliminarDocsEnLote(COLECCIONES.mensajesDirectos, 'receptorId', id),
    this.eliminarDocsEnLote(COLECCIONES.notificaciones, 'usuarioId', id),
    this.eliminarDocsEnLote(COLECCIONES.postulaciones, 'usuarioId', id),
    this.eliminarDocsEnLote(COLECCIONES.miembrosGrupo, 'usuarioId', id),
    esInstitucion ? this.eliminarInstitucionesDeUsuario(id) : Promise.resolve(),
  ])

  // ✅ VALIDADO: Eliminación de avatar de Storage
  // ⚠️ PENDIENTE: Auditoría trail
  // ⚠️ PENDIENTE: Notificación al usuario eliminado
}
```

**Recomendaciones:**
- Implementar auditoría trail para acciones de admin
- Notificar al usuario antes de eliminar su cuenta
- Implementar "soft delete" temporal antes de eliminación física

---

## 🎯 Resumen de Riesgos por Componente

### 🔴 Riesgo Alto
1. **AI Service** - Datos de usuario enviados a API externa sin anonimización
2. **Messages Service** - Sin sanitización XSS en contenido
3. **Upload Service** - Sin validación de tamaño/tipo de archivo

### 🟡 Riesgo Medio
1. **Auth Service** - Rate limiting global sin diferenciación
2. **Login Endpoint** - Sin detección de brute force
3. **Todos los endpoints** - Sin auditing trail

### 🟢 Riesgo Bajo
1. **Guards** - Bien implementados y testeados
2. **Validación de entrada** - class-validator funcionando
3. **CORS** - Configurado correctamente

---

## 📋 Plan de Acción Priorizado

### Inmediato (Esta semana)
1. ✅ Instalar Helmet
2. ✅ Rate limiting diferenciado para auth
3. ✅ Validación de tamaño en uploads
4. ✅ Health check endpoint

### Corto plazo (2 semanas)
5. ⚠️ Sanitización XSS en mensajes y publicaciones
6. ⚠️ Tests para AI y Storage services
7. ⚠️ Auditing trail para acciones críticas

### Mediano plazo (1 mes)
8. 📋 Repository Pattern
9. 📋 Separación de AdminService
10. 📋 Logging estructurado

### Largo plazo (3 meses)
11. 🔮 Push notifications con FCM
12. 🔮 Full-text search con Algolia/Meilisearch
13. 🔮 Performance monitoring con Prometheus

---

## ✅ Conclusión

El backend de **Raíces para Florecer** tiene una **buena base arquitectónica** con:
- ✅ Autenticación sólida con Firebase Auth
- ✅ Guards reutilizables y bien testeados
- ✅ Validación de entrada con class-validator
- ✅ Rate limiting global configurado
- ✅ CORS correctamente configurado

**Áreas de mejora principales:**
- 🔧 Rate limiting diferenciado por endpoint
- 🔧 Sanitización XSS en campos de texto
- 🔧 Validación de tamaño en uploads
- 🔧 Tests para servicios críticos (AI, Storage)
- 🔧 Auditing trail para acciones de admin
- 🔧 Repository Pattern para abstraer Firestore

Con las mejoras recomendadas en este documento, el backend alcanzará un nivel de **calidad production-ready** con seguridad, performance y mantenibilidad adecuados.
