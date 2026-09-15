# 🏢 Flujo de Aprobación de Instituciones y Publicación de Vacantes

> **Para:** Isa (Backend Developer)
> **Autor:** Equipo Raíces
> **Fecha:** Agosto 2026
> **Objetivo:** Documentar el flujo completo del módulo de Empleo: registro como institución → aprobación por un administrador → publicación de vacantes, y las reglas de negocio aplicadas en el backend.

---

## 📋 Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Modelo de Datos en Firestore](#2-modelo-de-datos-en-firestore)
3. [Flujo Paso a Paso](#3-flujo-paso-a-paso)
4. [Reglas de Negocio y Validaciones](#4-reglas-de-negocio-y-validaciones)
5. [Endpoints Involucrados](#5-endpoints-involucrados)
6. [Estados Posibles de una Institución](#6-estados-posibles-de-una-institución)
7. [Casos de Error](#7-casos-de-error)
8. [Pruebas](#8-pruebas)
9. [Preguntas Frecuentes](#9-preguntas-frecuentes)

---

## 1. Resumen Ejecutivo

**¿Qué hace este flujo?** Una persona registra su organización como **institución**, un **administrador la aprueba** y solo entonces la institución puede **publicar vacantes** de empleo inclusivo en el directorio público.

**Reglas clave:**
- El rol canónico es **`institucion`** (el guard normaliza el legacy `institution` automáticamente).
- El registro crea de forma **atómica** (un solo `db.batch()`) los documentos `perfiles/{uid}` e `instituciones/{uid}`, con vínculo explícito (`institucionId`, `creadoPor`, `usuarioId`).
- Una institución recién registrada nace con **`activa: true`** y **`verificada: false`** (pendiente de aprobación).
- **Solo instituciones `activa: true` Y `verificada: true`** pueden:
  - Publicar vacantes (`POST /api/empleo`).
  - Aparecer en el listado público de vacantes (`GET /api/empleo`) y en el directorio (`GET /api/instituciones`).

---

## 2. Modelo de Datos en Firestore

### 📁 Colecciones involucradas

```
perfiles/{uid}                    ← Perfil del usuario
├── rol: "institucion"
├── institucionId: <uid>          ← Vínculo con su institución
├── activo: boolean
└── verificado: boolean

instituciones/{uid}               ← Documento de la institución (id = UID)
├── nombre, emailContacto
├── categoria: "funcional" | "educativo" | "laboral" | "social"
├── descripcion, telefono
├── tiposDiscapacidad: string[]
├── creadoPor: <uid>              ← Dueño (permite findMine y propiedad)
├── usuarioId: <uid>              ← Alias del dueño
├── activa: boolean
├── verificada: boolean           ← Aprobación del admin
├── calificacionPromedio, cantidadCalificaciones
└── fechaCreacion

vacantes/{id}                     ← Vacantes de empleo
├── institucionId: <institucionId>
├── titulo, descripcion, requisitos, modalidad, ...
└── activa: boolean
```

> **Nota:** las instituciones creadas vía `POST /api/instituciones` (endpoint de creación manual) usan un ID aleatorio y se localizan por `creadoPor`. Las creadas en el **registro** usan `id = UID` (documento canónico).

---

## 3. Flujo Paso a Paso

```mermaid
sequenceDiagram
    participant U as Usuario (Institución)
    participant A as API (AuthService)
    participant AD as Admin
    participant J as API (JobsService)

    U->>A: POST /autenticacion/registro { rol: "institucion", categoria, ... }
    A->>A: Valida que exista categoria
    A->>A: Crea usuario en Firebase Auth
    A->>A: db.batch(): perfiles/{uid} + instituciones/{uid} (atómico)
    Note over A: Si el batch falla → rollback (elimina el usuario de Firebase Auth)
    A-->>U: 201 { usuario, requiereInicioSesion: true }
    Note over U: El registro NO devuelve tokens: debe llamar a POST /autenticacion/inicio-sesion
    Note over U: Institución queda activa: true, verificada: false

    AD->>AD: GET /administracion/instituciones/pendientes
    AD->>AD: POST /administracion/instituciones/:id/aprobar
    Note over AD: Escribe { verificada: true, activa: true } + envía email
    AD-->>U: Institución aprobada ✅

    U->>J: POST /empleo (Bearer token, rol "institucion")
    J->>J: Valida institución por creadoPor
    J->>J: createJob(): ¿existe? ¿activa? ¿verificada?
    J-->>U: 201 Vacante creada

    U->>J: GET /empleo (público)
    Note over J: Solo vacantes de instituciones activa: true Y verificada: true
```

### Registro como institución (detalle)

1. **Validaciones previas** en `auth.service.ts` (`register`):
   - Si viene `tutorId`, solo aplica a rol `pcd` (no a instituciones).
   - Si `rol === 'institucion'` y falta `categoria` → `400 Bad Request: La categoría es obligatoria para registrar una institución`.
   - Email duplicado → `409 Conflict`.
2. **Creación del usuario** en Firebase Auth.
3. **Escritura atómica** con `db.batch()`:
   - `perfiles/{uid}` con `institucionId: uid`.
   - `instituciones/{uid}` con `creadoPor`, `usuarioId`, `categoria`, `descripcion`, `telefono`, `tiposDiscapacidad`, `activa: true`, `verificada: false`.
   - Si el `batch.commit()` falla → se elimina el usuario de Firebase Auth (rollback) y se propaga el error.

---

## 4. Reglas de Negocio y Validaciones

### Publicación de vacantes — `jobs.service.ts` (`createJob`)

| Condición | Resultado |
|-----------|-----------|
| La institución **no existe** | `404 Not Found` → *"Institución no encontrada"* |
| `activa !== true` | `403 Forbidden` → *"La institución se encuentra inactiva"* |
| `verificada !== true` | `403 Forbidden` → *"La institución debe estar aprobada por un administrador para publicar vacantes"* |
| Todo correcto | Crea la vacante y devuelve el detalle |

**Roles permitidos para crear vacantes** (`@Roles('institucion', 'admin')`):
- Usuario con rol `institucion`: se resuelve su institución por `creadoPor`.
- Admin: debe enviar `institucionId` explícito.
- Cualquier otro rol → `403` del `RolesGuard`.

### Listado público — `jobs.service.ts` (`findAll`)

- Se retornan **únicamente** vacantes cuya institución tenga `activa === true` **y** `verificada === true`.
- Vacantes de instituciones inactivas o no aprobadas quedan ocultas del público.

### Actualización y eliminación — `institutions.service.ts`

| Regla | Detalle |
|-------|---------|
| Roles en `PUT`/`DELETE` `/instituciones/:id` | `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('institucion', 'admin')` — defensa en profundidad: el guard rechaza otros roles con `403` y el servicio valida además la propiedad (`creadoPor`) |
| Institución eliminada (soft-delete) o inactiva | `update(id)` responde `404 Institución no encontrada` **antes** de validar permisos, para no revelar su existencia |
| `updateMine` | Solo localiza instituciones con `activa == true`: no se puede editar una institución ya eliminada vía `mi-institucion` |
| Sanitización XSS | `nombre` y `descripcion` se escapan con `sanitizeHtml` tanto en `CreateInstitucionDto` como en `UpdateInstitucionDto` |

### Aprobación — `admin.service.ts` (`approveInstitution`)

- Escribe **`{ verificada: true, activa: true }`** en `instituciones/{id}`.
- Envía correo de notificación (`sendInstitutionApproved`).
- Con esto la institución queda visible en el directorio y **desbloqueada para publicar vacantes**.

---

## 5. Endpoints Involucrados

### Público / Institución

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| `POST` | `/api/autenticacion/registro` | Público | Registro (rol `institucion` con `categoria` obligatoria) |
| `GET` | `/api/autenticacion/yo` | Autenticado | Perfil con objeto `institucion` adjunto |
| `GET` | `/api/usuarios/perfil` | Autenticado | Perfil completo con `institucion` adjunta |
| `GET` | `/api/instituciones/mi-institucion` | Autenticado | Institución del usuario (doc canónico o por `creadoPor`) |
| `PUT` | `/api/instituciones/mi-institucion` | Autenticado | Actualizar su institución (solo si está activa) |
| `GET` | `/api/instituciones` | Público | Directorio (solo `activa && verificada`) |
| `GET` | `/api/instituciones/:id` | Público | Detalle público (solo `activa && verificada`; `404` si está pendiente o inactiva) |
| `GET` | `/api/instituciones/:id/detalle` | Autenticado | Detalle sin filtrar estado (admin o propietario) |
| `PUT`/`DELETE` | `/api/instituciones/:id` | `institucion`, `admin` | Actualizar / soft-delete por ID (`RolesGuard` + propiedad validada en el servicio; `404` si está inactiva o eliminada) |
| `POST` | `/api/empleo` | `institucion`, `admin` | Crear vacante (requiere institución aprobada) |
| `GET` | `/api/empleo` | Público | Listado de vacantes (solo instituciones aprobadas) |
| `PUT`/`DELETE` | `/api/empleo/:id` | `institucion`, `admin` | Editar / desactivar vacante |
| `GET` | `/api/empleo/postulantes-vacante?vacanteId=xxx` | `institucion`, `admin` | Ver postulantes de una vacante específica |
| `GET` | `/api/empleo/postulaciones?vacanteId=xxx` | `institucion`, `admin` | Alias del anterior (compatibilidad frontend) |
| `GET` | `/api/empleo/postulantes-institucion` | `institucion`, `admin` | Ver todos los postulantes de MI institución |
| `PATCH` | `/api/empleo/postulaciones/:id/estado` | `institucion`, `admin` | Cambiar estado de postulación (aceptar/rechazar) |

### Administración (todos con `@Roles('admin')`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/administracion/instituciones/pendientes` | Instituciones pendientes de aprobación |
| `POST` | `/api/administracion/instituciones/:id/aprobar` | Aprobar (deja `verificada: true` y `activa: true`) |
| `PATCH` | `/api/administracion/instituciones/:id/verificar` | Alternar verificación |
| `DELETE` | `/api/administracion/instituciones/:id` | Rechazar (elimina institución + vacantes y desactiva el perfil vinculado) |

---

## 6. Estados Posibles de una Institución

| Estado | `activa` | `verificada` | En directorio | Publica vacantes | En listado de vacantes |
|--------|:-------:|:------------:|:-------------:|:----------------:|:----------------------:|
| Pendiente de aprobación | ✅ `true` | ❌ `false` | ❌ No | ❌ No (403) | ❌ No |
| **Aprobada** | ✅ `true` | ✅ `true` | ✅ Sí | ✅ Sí | ✅ Sí |
| Inactiva / desactivada | ❌ `false` | — | ❌ No | ❌ No (403 inactiva) | ❌ No |
| Rechazada | documento eliminado en cascada | | ❌ | ❌ | ❌ |

---

## 7. Casos de Error

| Escenario | Código | Mensaje |
|-----------|--------|---------|
| Registrar institución sin `categoria` | `400` | `La categoría es obligatoria para registrar una institución` |
| Email ya registrado | `409` | `Email ya registrado` |
| Crear vacante sin institución registrada | `404` | `No tienes una institución registrada. Crea una institución primero.` |
| Institución inexistente | `404` | `Institución no encontrada` |
| Institución inactiva | `403` | `La institución se encuentra inactiva` |
| Institución no aprobada | `403` | `La institución debe estar aprobada por un administrador para publicar vacantes` |
| Rol distinto a institución/admin | `403` | `Rol insuficiente` |
| Admin sin `institucionId` | `400` | `Como administrador, debes proporcionar el ID de la institución (institucionId).` |
| Actualizar institución eliminada/inactiva (`:id`) | `404` | `Institución no encontrada` |
| Actualizar sin institución activa (`mi-institucion`) | `404` | `No tienes una institución registrada` |
| Rol distinto a institución/admin en `PUT`/`DELETE /instituciones/:id` | `403` | `Rol insuficiente` |

---

## 8. Pruebas

Las reglas anteriores están cubiertas por la suite de Jest:

| Suite | Cobertura relevante |
|-------|---------------------|
| `institutions.service.spec.ts` | Directorio público filtra `activa && verificada`; detalle público `404` si pendiente/inactiva; anti-duplicado en `create`; `updateMine` ignora eliminadas; edición bloqueada de instituciones inactivas; sanitización XSS del DTO |
| `jobs.service.spec.ts` | Crear vacante con institución aprobada; 403 por no aprobada / inactiva; 404 por institución inexistente; filtro de `findAll` por `verificada` |
| `jobs.controller.spec.ts` | El endpoint `POST /empleo` acepta un usuario con rol `institucion` (delegación al servicio) |
| `roles.guard.spec.ts` | `RolesGuard` con `['institucion', 'admin']` permite `rol: 'institucion'` (sin 403) |
| `admin.service.spec.ts` | `approveInstitution` escribe `{ verificada: true, activa: true }` y envía email; `rejectInstitution` elimina institución + vacantes |
| `auth.service.spec.ts` | Registro atómico de institución (batch con `creadoPor`/`usuarioId`/`institucionId`/`categoria`), rollback y rechazo sin `categoria` |

---

## 9. Preguntas Frecuentes

**¿El registro devuelve tokens de acceso?**
No. El registro crea la cuenta y responde `201 { usuario, requiereInicioSesion: true }` sin tokens. El cliente debe llamar a `POST /api/autenticacion/inicio-sesion` para obtener el ID token y el token de refresco. Esto evita devolver custom tokens de Firebase que los guards rechazan.

**¿Por qué una institución recién registrada no aparece en el directorio?**
Porque nace con `verificada: false`. Un admin debe aprobarla (`POST /administracion/instituciones/:id/aprobar`). Tampoco es visible en el detalle público `GET /api/instituciones/:id` (responde `404` para no revelar su existencia). El propietario puede consultarla vía `GET /api/instituciones/mi-institucion` o `GET /api/instituciones/:id/detalle`; el admin, vía el detalle protegido o `GET /api/administracion/instituciones/pendientes`.

**¿Quién puede crear instituciones (`POST /api/instituciones`)?**
Solo cuentas con rol `institucion` o `admin`. El `RolesGuard` rechaza con `403` a los demás roles (pcd, tutor).

**¿Se puede editar una institución eliminada o pendiente?**
Una institución **pendiente** sí es editable por su propietario (vía `mi-institucion` o `:id`). Una institución **eliminada** (soft-delete, `activa: false`) no: `update(id)` responde `404` y `updateMine` solo consulta instituciones activas.

**¿Qué protección XSS tienen los textos de la institución?**
`nombre` y `descripcion` se escapan con `sanitizeHtml` tanto al crear (`CreateInstitucionDto`) como al actualizar (`UpdateInstitucionDto`).

**¿Puede una institución publicar vacantes antes de ser aprobada?**
No. `createJob` devuelve `403` con el mensaje de aprobación pendiente.

**¿Qué pasa si un admin rechaza la institución?**
Se elimina la institución y sus vacantes asociadas (cascada atómica) y se desactiva el perfil vinculado si existe.

**¿El rol se escribe como `institution` (inglés) o `institucion`?**
El canónico es `institucion`. El `FirebaseAuthGuard` normaliza automáticamente el valor legacy `institution` para compatibilidad con cuentas antiguas.

**¿Dónde vive la lógica de aprobación?**
En `admin.service.ts` (`approveInstitution` / `rejectInstitution`) y su exposición HTTP en `admin.controller.ts`.

---

## 10. Gestión de Postulantes

Una vez que la institución tiene vacantes publicadas, puede **ver y gestionar los postulantes**.

### Endpoints para Ver Postulantes

| Endpoint | Descripción | Requisitos |
|----------|-------------|------------|
| `GET /api/empleo/postulantes-vacante?vacanteId=xxx` | Postulantes de una vacante específica | Rol institución o admin, feature `postulaciones` |
| `GET /api/empleo/postulaciones?vacanteId=xxx` | Alias (compatibilidad frontend) | Misma que anterior |
| `GET /api/empleo/postulantes-institucion` | Todos los postulantes de MI institución | Rol institución o admin, feature `postulaciones` |
| `PATCH /api/empleo/postulaciones/:id/estado` | Cambiar estado de postulación | Rol institución o admin |

### Ejemplo: Obtener Postulantes de una Vacante

```bash
# Con curl
curl -X GET 'https://raices-backend-jftu6lrbda-uc.a.run.app/api/empleo/postulantes-vacante?vacanteId=abc123' \
  -H 'Authorization: Bearer eyJhbGciOiJSUzI1NiIs...'
```

**Response:**
```json
{
  "datos": [
    {
      "postulacionId": "post-abc123",
      "usuarioId": "usr-abc123",
      "nombreCompleto": "Juan Pérez",
      "email": "juan@ejemplo.com",
      "avatarUrl": "https://...",
      "estado": "pendiente",
      "fechaPostulacion": "2026-08-11T10:00:00.000Z",
      "cartaPresentacion": "Estimado equipo..."
    }
  ],
  "vacante": {
    "id": "vac-abc123",
    "titulo": "Desarrollador Web Inclusivo"
  },
  "paginaActual": 1,
  "totalPaginas": 1,
  "totalResultados": 5
}
```

### Cambiar Estado de una Postulación

```bash
curl -X PATCH 'https://raices-backend-jftu6lrbda-uc.a.run.app/api/empleo/postulaciones/post-abc123/estado' \
  -H 'Authorization: Bearer eyJhbGciOiJSUzI1NiIs...' \
  -H 'Content-Type: application/json' \
  -d '{"estado": "aceptada", "comentarios": "¡Felicitaciones!"}'
```

**Estados posibles:**
- `pendiente` — Recién postulado
- `en_revision` — En proceso de revisión
- `aceptada` — Aceptado para la posición
- `rechazada` — No seleccionado

---

## 🔗 Archivos de referencia

- `src/modules/auth/auth.service.ts` — registro atómico de instituciones
- `src/modules/auth/dto/register.dto.ts` — campos del registro
- `src/modules/institutions/institutions.service.ts` — directorio y `findMine`
- `src/modules/jobs/jobs.service.ts` — publicación, filtro de vacantes y consulta de postulantes
- `src/modules/jobs/jobs.controller.ts` — endpoints de empleo incluyendo postulantes
- `src/modules/admin/admin.service.ts` — aprobación / rechazo de instituciones
