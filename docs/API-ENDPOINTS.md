# 📚 Documentación de Endpoints API — Raíces para Florecer

**Última actualización:** 25 de agosto, 2026  
**Base URL:** `https://raices-backend-jftu6lrbda-uc.a.run.app/api`

---

## 📋 Índice

1. [Autenticación](#-autenticación)
2. [Usuarios](#-usuarios)
3. [Instituciones](#-instituciones)
4. [Empleo](#-empleo)
5. [Comunidad](#-comunidad)
6. [Mensajes](#-mensajes)
7. [Favoritos](#-favoritos)
8. [Reseñas](#-reseñas)
9. [Descubrimiento](#-descubrimiento)
10. [Inteligencia Artificial](#-inteligencia-artificial)
11. [Administración](#-administración)
12. [Catálogos](#-catálogos)
13. [Multimedia](#-multimedia)
14. [Notificaciones](#-notificaciones)
15. [Salud del Sistema](#-salud-del-sistema)

---

## 🔐 Autenticación

### POST `/autenticacion/registro`
**Descripción:** Crear una nueva cuenta de usuario  
**Autenticación:** No requerida  
**Rate Limit:** 3 req/hora

**Request Body:**
```json
{
  "email": "usuario@ejemplo.com",
  "password": "MiPassword123",
  "nombreCompleto": "Juan Pérez",
  "rol": "pcd",
  "tutorId": "optional-tutor-id"
}
```

**Campos para institución:**
```json
{
  "email": "institucion@ejemplo.com",
  "password": "MiPassword123",
  "nombreCompleto": "Institución Ejemplo",
  "rol": "institucion",
  "categoria": "laboral",
  "descripcion": "Institución de empleo inclusivo",
  "telefono": "5551234567",
  "tiposDiscapacidad": ["fisica", "sensorial"]
}
```

**Response (201):**
```json
{
  "usuario": {
    "id": "abc123",
    "email": "usuario@ejemplo.com",
    "nombreCompleto": "Juan Pérez",
    "rol": "pcd"
  },
  "requiereInicioSesion": true
}
```

**Errores:**
- `400` - Email o contraseña inválidos
- `400` - Categoría obligatoria para instituciones
- `409` - Email ya registrado

---

### POST `/autenticacion/inicio-sesion`
**Descripción:** Iniciar sesión y obtener tokens  
**Autenticación:** No requerida  
**Rate Limit:** 5 req/minuto

**Request Body:**
```json
{
  "email": "usuario@ejemplo.com",
  "password": "MiPassword123"
}
```

**Response (200):**
```json
{
  "tokenAcceso": "eyJhbGciOiJSUzI1NiIs...",
  "tokenRefresco": "AMf9BxSj...",
  "expiraEn": 3600,
  "usuario": {
    "id": "abc123",
    "email": "usuario@ejemplo.com",
    "nombreCompleto": "Juan Pérez",
    "rol": "pcd",
    "features": {
      "chat": true,
      "postulaciones": true,
      "comunidad": true,
      "resenas": true,
      "descubrimiento": true,
      "favoritos": true,
      "multimedia": true
    }
  }
}
```

---

### POST `/autenticacion/renovar-token`
**Descripción:** Renovar token de acceso usando refresh token  
**Autenticación:** No requerida

**Request Body:**
```json
{
  "tokenRefresco": "AMf9BxSj..."
}
```

**Response (200):**
```json
{
  "tokenAcceso": "eyJhbGciOiJSUzI1NiIs...",
  "tokenRefresco": "AMf9BxSj-nuevo...",
  "expiraEn": 3600
}
```

---

### GET `/autenticacion/yo`
**Descripción:** Obtener perfil del usuario autenticado  
**Autenticación:** Bearer Token requerido

**Headers:**
```
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

**Response (200):**
```json
{
  "id": "abc123",
  "email": "usuario@ejemplo.com",
  "nombreCompleto": "Juan Pérez",
  "rol": "pcd",
  "avatarUrl": "https://storage.googleapis.com/...",
  "institucion": null
}
```

---

## 👤 Usuarios

### GET `/usuarios/perfil`
**Descripción:** Obtener perfil completo del usuario  
**Autenticación:** Bearer Token requerido

**Response (200):**
```json
{
  "id": "abc123",
  "email": "usuario@ejemplo.com",
  "nombreCompleto": "Juan Pérez",
  "rol": "pcd",
  "avatarUrl": "https://storage.googleapis.com/...",
  "fechaCreacion": "2026-08-01T00:00:00.000Z",
  "activo": true,
  "institucion": null,
  "perfilExtendido": {
    "etapaVida": "adulto",
    "tiposDiscapacidad": ["fisica"],
    "necesidades": ["transporte", "accesibilidad"]
  }
}
```

---

### PUT `/usuarios/perfil`
**Descripción:** Actualizar perfil del usuario  
**Autenticación:** Bearer Token requerido

**Request Body:**
```json
{
  "nombreCompleto": "Juan Pérez García",
  "avatarUrl": "https://storage.googleapis.com/..."
}
```

---

### POST `/usuarios/avatar`
**Descripción:** Subir avatar del usuario  
**Autenticación:** Bearer Token requerido  
**Content-Type:** multipart/form-data

**FormData:**
- `file`: Archivo imagen (JPEG, PNG, WebP, máximo 5MB)

**Response (200):**
```json
{
  "avatarUrl": "https://storage.googleapis.com/raices-avatars/abc123/avatar.jpg"
}
```

---

### POST `/usuarios/dependientes`
**Descripción:** Agregar dependiente (para tutores)  
**Autenticación:** Bearer Token requerido  
**Rate Limit:** Guard `LimitDependientesGuard`

**Request Body:**
```json
{
  "nombreCompleto": "María García",
  "parentesco": "hijo",
  "fechaNacimiento": "2010-05-15",
  "tiposDiscapacidad": ["intelectual"]
}
```

**Response (201):**
```json
{
  "id": "dep-abc123",
  "nombreCompleto": "María García",
  "parentesco": "hijo",
  "tutorId": "abc123"
}
```

---

### GET `/usuarios/dependientes`
**Descripción:** Listar dependientes del usuario  
**Autenticación:** Bearer Token requerido

---

### GET `/usuarios/dependientes/count`
**Descripción:** Contar dependientes del usuario  
**Autenticación:** Bearer Token requerido

**Response (200):**
```json
{
  "count": 2,
  "limite": 5
}
```

---

### GET `/usuarios/dependientes/:id`
**Descripción:** Obtener detalle de un dependiente  
**Autenticación:** Bearer Token requerido

---

### GET `/usuarios/dependientes/:id/permisos`
**Descripción:** Obtener permisos de un dependiente  
**Autenticación:** Bearer Token requerido

---

### POST `/usuarios/vincular-pcd`
**Descripción:** Vincular usuario PCD con tutor  
**Autenticación:** Bearer Token requerido

**Request Body:**
```json
{
  "pcdId": "id-usuario-pcd"
}
```

---

## 🏢 Instituciones

### GET `/instituciones`
**Descripción:** Listar instituciones (público, solo verificadas)  
**Autenticación:** No requerida

**Query Params:**
- `page` (number): Página (default: 1)
- `limite` (number): Resultados por página (default: 10)
- `buscar` (string): Búsqueda por nombre
- `categoria` (string): Filtrar por categoría
- `discapacidad` (string): Filtrar por tipo de discapacidad

**Response (200):**
```json
{
  "datos": [
    {
      "id": "inst-abc",
      "nombre": "Institución Ejemplo",
      "descripcion": "Empleo inclusivo",
      "categoria": "laboral",
      "tiposDiscapacidad": ["fisica", "sensorial"],
      "calificacionPromedio": 4.5,
      "cantidadCalificaciones": 12,
      "verificada": true,
      "activa": true
    }
  ],
  "paginaActual": 1,
  "totalPaginas": 5,
  "totalResultados": 50
}
```

---

### GET `/instituciones/:id`
**Descripción:** Detalle de institución (público, solo verificadas)  
**Autenticación:** No requerida

---

### GET `/instituciones/mi-institucion`
**Descripción:** Obtener institución del usuario autenticado  
**Autenticación:** Bearer Token requerido (rol: institución)

---

### PUT `/instituciones/mi-institucion`
**Descripción:** Actualizar institución propia  
**Autenticación:** Bearer Token requerido (rol: institución o admin)

**Errores:**
- `401`: No autenticado
- `403`: Rol insuficiente (se requiere rol institución o admin)
- `404`: El usuario no tiene institución registrada

**Request Body:**
```json
{
  "nombre": "Institución Actualizada",
  "descripcion": "Nueva descripción",
  "telefono": "5559876543"
}
```

---

### DELETE `/instituciones/mi-institucion`
**Descripción:** Eliminar institución propia (soft-delete: `activa: false` + `fechaEliminacion`)  
**Autenticación:** Bearer Token requerido (rol: institución o admin)

**Response:** `204 No Content`

**Errores:**
- `401`: No autenticado
- `403`: Rol insuficiente (se requiere rol institución o admin)
- `404`: El usuario no tiene institución registrada (o ya fue eliminada)

> Nota: rate limit de 5 eliminaciones por minuto. Una segunda llamada después de eliminar responde `404`.

---

### POST `/instituciones`
**Descripción:** Crear nueva institución  
**Autenticación:** Bearer Token requerido (rol: institución o admin)

**Request Body:**
```json
{
  "nombre": "Nueva Institución",
  "emailContacto": "contacto@institucion.com",
  "categoria": "laboral",
  "descripcion": "Descripción de la institución",
  "telefono": "5551234567",
  "tiposDiscapacidad": ["fisica", "intelectual"]
}
```

---

### PUT `/instituciones/:id`
**Descripción:** Actualizar institución (admin o propietario)  
**Autenticación:** Bearer Token requerido (rol: admin o propietario)

---

### DELETE `/instituciones/:id`
**Descripción:** Eliminar institución (admin o propietario)  
**Autenticación:** Bearer Token requerido (rol: admin o propietario)

---

### GET `/instituciones/:id/detalle`
**Descripción:** Detalle de institución sin filtrar estado (admin o propietario)  
**Autenticación:** Bearer Token requerido

---

## 💼 Empleo

### GET `/empleo`
**Descripción:** Listar vacantes (público, solo de instituciones verificadas)  
**Autenticación:** No requerida

**Query Params:**
- `page` (number): Página
- `limite` (number): Resultados por página
- `buscar` (string): Búsqueda por título/descripción
- `institucionId` (string): Filtrar por institución
- `modalidad` (string): Filtrar por modalidad
- `discapacidad` (string): Filtrar por discapacidad

**Response (200):**
```json
{
  "datos": [
    {
      "id": "vac-abc123",
      "titulo": "Desarrollador Web Inclusivo",
      "descripcion": "Buscamos desarrollador...",
      "institucionId": "inst-abc",
      "institucionNombre": "Institución Ejemplo",
      "institucionLogo": "https://...",
      "modalidad": "hibrido",
      "salario": "$15,000 - $20,000 MXN",
      "requisitos": ["JavaScript", "React"],
      "tiposDiscapacidad": ["fisica"],
      "activa": true,
      "fechaCreacion": "2026-08-01T00:00:00.000Z"
    }
  ],
  "paginaActual": 1,
  "totalPaginas": 3,
  "totalResultados": 25
}
```

---

### GET `/empleo/:id`
**Descripción:** Detalle de una vacante  
**Autenticación:** No requerida

---

### POST `/empleo`
**Descripción:** Crear nueva vacante  
**Autenticación:** Bearer Token requerido (rol: institución o admin)  
**Feature Guard:** `@Feature('postulaciones')`

**Request Body:**
```json
{
  "titulo": "Desarrollador Web Inclusivo",
  "descripcion": "Buscamos desarrollador con experiencia...",
  "requisitos": ["JavaScript", "React", "Accesibilidad web"],
  "modalidad": "hibrido",
  "salario": "$15,000 - $20,000 MXN",
  "ubicacion": "Ciudad de México",
  "horario": "Lunes a Viernes 9:00 - 18:00",
  "tiposDiscapacidad": ["fisica", "sensorial"],
  "contactoEmail": "empleo@institucion.com",
  "contactoTelefono": "5551234567"
}
```

**Response (201):**
```json
{
  "id": "vac-abc123",
  "titulo": "Desarrollador Web Inclusivo",
  "institucionId": "inst-abc",
  "activa": true,
  "fechaCreacion": "2026-08-11T00:00:00.000Z"
}
```

**Errores:**
- `403` - La institución debe estar aprobada
- `404` - No tienes una institución registrada

---

### PUT `/empleo/:id`
**Descripción:** Actualizar vacante  
**Autenticación:** Bearer Token requerido (rol: institución propietaria o admin)

---

### DELETE `/empleo/:id`
**Descripción:** Desactivar vacante  
**Autenticación:** Bearer Token requerido (rol: institución propietaria o admin)

---

### POST `/empleo/:id/postularse`
**Descripción:** Postularse a una vacante  
**Autenticación:** Bearer Token requerido (rol: pcd o tutor)

**Request Body:**
```json
{
  "cartaPresentacion": "Estimado equipo de selección, me interesa esta vacante porque..."
}
```

**Response (201):**
```json
{
  "id": "post-abc123",
  "vacanteId": "vac-abc123",
  "usuarioId": "usr-abc123",
  "estado": "pendiente",
  "fechaPostulacion": "2026-08-11T00:00:00.000Z"
}
```

**Errores:**
- `409` - Ya enviaste una solicitud a esta vacante
- `404` - Vacante no encontrada o inactiva

---

### GET `/empleo/postuladas`
**Descripción:** Obtener IDs de vacantes donde el usuario se ha postulado  
**Autenticación:** Bearer Token requerido

**Response (200):**
```json
{
  "vacanteIds": ["vac-abc123", "vac-def456"]
}
```

---

### GET `/empleo/mis-postulaciones`
**Descripción:** Obtener postulaciones del usuario con detalles  
**Autenticación:** Bearer Token requerido (rol: pcd o tutor)

**Query Params:**
- `estado` (string): Filtrar por estado (pendiente, aceptada, rechazada)
- `buscar` (string): Búsqueda por título de vacante

**Response (200):**
```json
{
  "datos": [
    {
      "id": "post-abc123",
      "vacanteId": "vac-abc123",
      "vacanteTitulo": "Desarrollador Web Inclusivo",
      "institucionNombre": "Institución Ejemplo",
      "estado": "pendiente",
      "fechaPostulacion": "2026-08-11T00:00:00.000Z",
      "cartaPresentacion": "Estimado equipo..."
    }
  ]
}
```

---

### GET `/empleo/postulantes-institucion`
**Descripción:** Obtener postulantes de MI institución  
**Autenticación:** Bearer Token requerido (rol: institución o admin)  
**Feature Guard:** `@Feature('postulaciones')`

**Query Params:**
- `vacanteId` (string): Filtrar por vacante específica
- `estado` (string): Filtrar por estado de postulación
- `buscar` (string): Búsqueda por nombre/email del postulante
- `page` (number): Página
- `limite` (number): Resultados por página

**Response (200):**
```json
{
  "datos": [
    {
      "postulacionId": "post-abc123",
      "usuarioId": "usr-abc123",
      "nombreCompleto": "Juan Pérez",
      "email": "juan@ejemplo.com",
      "avatarUrl": "https://...",
      "vacanteId": "vac-abc123",
      "vacanteTitulo": "Desarrollador Web Inclusivo",
      "estado": "pendiente",
      "fechaPostulacion": "2026-08-11T00:00:00.000Z",
      "cartaPresentacion": "Estimado equipo..."
    }
  ],
  "paginaActual": 1,
  "totalPaginas": 2,
  "totalResultados": 15
}
```

---

### GET `/empleo/postulantes-vacante`
**Descripción:** Obtener postulantes de una vacante específica  
**Autenticación:** Bearer Token requerido (rol: institución o admin)  
**Feature Guard:** `@Feature('postulaciones')`

**Query Params (requeridos):**
- `vacanteId` (string): ID de la vacante

**Query Params (opcionales):**
- `estado` (string): Filtrar por estado de postulación
- `buscar` (string): Búsqueda por nombre/email del postulante
- `page` (number): Página
- `limite` (number): Resultados por página

**Response (200):**
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
      "fechaPostulacion": "2026-08-11T00:00:00.000Z",
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

**Errores:**
- `400` - vacanteId es requerido
- `403` - No tienes permisos para ver esta vacante
- `404` - Vacante no encontrada

---

### GET `/empleo/postulaciones`
**Descripción:** Alias de `postulantes-vacante` para compatibilidad  
**Autenticación:** Bearer Token requerido (rol: institución o admin)  
**Feature Guard:** `@Feature('postulaciones')`

**Query Params:** Igual que `/empleo/postulantes-vacante`

---

### PATCH `/empleo/postulaciones/:id/estado`
**Descripción:** Cambiar estado de una postulación  
**Autenticación:** Bearer Token requerido (rol: institución o admin)  
**Feature Guard:** `@Feature('postulaciones')`

**Request Body:**
```json
{
  "estado": "aceptada",
  "comentarios": "¡Felicitaciones! Has sido aceptado."
}
```

**Estados posibles:** `pendiente`, `aceptada`, `rechazada`, `en_revision`

---

## 🌐 Comunidad

### GET `/comunidad/publicaciones`
**Descripción:** Listar publicaciones de la comunidad  
**Autenticación:** Bearer Token requerido

**Query Params:**
- `page` (number): Página
- `limite` (number): Resultados por página
- `grupoId` (string): Filtrar por grupo

---

### POST `/comunidad/publicaciones`
**Descripción:** Crear nueva publicación  
**Autenticación:** Bearer Token requerido

**Request Body:**
```json
{
  "contenido": "¡Hola comunidad! Quiero compartir...",
  "grupoId": "opcional-grupo-id",
  "multimedia": ["url-imagen-1.jpg"]
}
```

---

### GET `/comunidad/publicaciones/:id`
**Descripción:** Obtener detalle de publicación  
**Autenticación:** Bearer Token requerido

---

### PUT `/comunidad/publicaciones/:id`
**Descripción:** Actualizar publicación (solo autor)  
**Autenticación:** Bearer Token requerido

---

### DELETE `/comunidad/publicaciones/:id`
**Descripción:** Eliminar publicación (solo autor o admin)  
**Autenticación:** Bearer Token requerido

---

### POST `/comunidad/publicaciones/:id/comentarios`
**Descripción:** Agregar comentario a publicación  
**Autenticación:** Bearer Token requerido

**Request Body:**
```json
{
  "contenido": "¡Muy buena publicación!"
}
```

---

### GET `/comunidad/publicaciones/:id/comentarios`
**Descripción:** Listar comentarios de publicación  
**Autenticación:** Bearer Token requerido

---

### POST `/comunidad/publicaciones/:id/me-gusta`
**Descripción:** Agregar/quitar me gusta  
**Autenticación:** Bearer Token requerido

---

### GET `/comunidad/grupos`
**Descripción:** Listar grupos de la comunidad  
**Autenticación:** Bearer Token requerido

---

### POST `/comunidad/grupos`
**Descripción:** Crear nuevo grupo  
**Autenticación:** Bearer Token requerido

**Request Body:**
```json
{
  "nombre": "Grupo de Empleo Inclusivo",
  "descripcion": "Espacio para compartir oportunidades laborales",
  "categoria": "laboral"
}
```

---

### GET `/comunidad/grupos/:id`
**Descripción:** Detalle de grupo  
**Autenticación:** Bearer Token requerido

---

### POST `/comunidad/grupos/:id/unirse`
**Descripción:** Unirse a un grupo  
**Autenticación:** Bearer Token requerido

---

### POST `/comunidad/grupos/:id/salir`
**Descripción:** Salir de un grupo  
**Autenticación:** Bearer Token requerido

---

### GET `/comunidad/grupos/:id/miembros`
**Descripción:** Listar miembros de grupo  
**Autenticación:** Bearer Token requerido

---

## 💬 Mensajes

### GET `/mensajes`
**Descripción:** Listar conversaciones  
**Autenticación:** Bearer Token requerido

**Response (200):**
```json
{
  "conversaciones": [
    {
      "usuarioId": "usr-abc123",
      "nombreCompleto": "María García",
      "avatarUrl": "https://...",
      "ultimoMensaje": "¿Cómo estás?",
      "fechaUltimoMensaje": "2026-08-11T10:30:00.000Z",
      "noLeidos": 2
    }
  ]
}
```

---

### GET `/mensajes/:usuarioId`
**Descripción:** Obtener mensajes con un usuario  
**Autenticación:** Bearer Token requerido

---

### POST `/mensajes/enviar/:usuarioId`
**Descripción:** Enviar mensaje a usuario  
**Autenticación:** Bearer Token requerido

**Request Body:**
```json
{
  "contenido": "Hola, me interesa la vacante que publicaste."
}
```

---

### GET `/mensajes/no-leidos/count`
**Descripción:** Contar mensajes no leídos  
**Autenticación:** Bearer Token requerido

**Response (200):**
```json
{
  "count": 5
}
```

---

## ⭐ Favoritos

### GET `/favoritos`
**Descripción:** Listar instituciones favoritas  
**Autenticación:** Bearer Token requerido

---

### POST `/favoritos/:institutionId/alternar`
**Descripción:** Agregar/quitar institución de favoritos  
**Autenticación:** Bearer Token requerido

**Response (200):**
```json
{
  "favorito": true,
  "mensaje": "Institución agregada a favoritos"
}
```

---

### GET `/favoritos/verificar/:institutionId`
**Descripción:** Verificar si una institución es favorita  
**Autenticación:** Bearer Token requerido

---

## ⭐ Reseñas

### GET `/resenas/institucion/:id`
**Descripción:** Listar reseñas de una institución  
**Autenticación:** No requerida

---

### POST `/resenas/institucion/:id`
**Descripción:** Crear reseña para institución  
**Autenticación:** Bearer Token requerido

**Request Body:**
```json
{
  "puntuacion": 5,
  "comentario": "Excelente institución, muy profesional."
}
```

---

### PUT `/resenas/:id`
**Descripción:** Actualizar reseña (solo autor)  
**Autenticación:** Bearer Token requerido

---

### DELETE `/resenas/:id`
**Descripción:** Eliminar reseña (solo autor o admin)  
**Autenticación:** Bearer Token requerido

---

### GET `/resenas/mias`
**Descripción:** Listar reseñas del usuario  
**Autenticación:** Bearer Token requerido

---

## 🔍 Descubrimiento

### GET `/descubrimiento`
**Descripción:** Búsqueda inteligente de instituciones y vacantes  
**Autenticación:** No requerida

**Query Params:**
- `q` (string): Texto de búsqueda
- `lat` (number): Latitud para búsqueda cercana
- `lng` (number): Longitud para búsqueda cercana
- `radio` (number): Radio en km (default: 50)
- `categoria` (string): Filtrar por categoría

**Response (200):**
```json
{
  "instituciones": [...],
  "vacantes": [...],
  "total": 15
}
```

---

### GET `/descubrimiento/recomendaciones`
**Descripción:** Obtener recomendaciones personalizadas  
**Autenticación:** Bearer Token requerido

---

## 🤖 Inteligencia Artificial

### POST `/ia/conversacion`
**Descripción:** Chat con asistente de IA  
**Autenticación:** Bearer Token requerido  
**Rate Limit:** 20 req/hora

**Request Body:**
```json
{
  "mensaje": "¿Qué vacantes hay para personas con discapacidad visual?",
  "historial": []
}
```

**Response (200):**
```json
{
  "respuesta": "Basado en tu perfil, encontré las siguientes oportunidades...",
  "simulado": false
}
```

---

### POST `/ia/recomendaciones`
**Descripción:** Obtener recomendaciones personalizadas con IA  
**Autenticación:** Bearer Token requerido

---

## 📊 Administración

### GET `/administracion/estadisticas`
**Descripción:** Obtener estadísticas generales  
**Autenticación:** Bearer Token requerido (rol: admin)

**Response (200):**
```json
{
  "totalUsuarios": 1250,
  "totalInstituciones": 45,
  "totalVacantes": 120,
  "totalPostulaciones": 890,
  "usuariosPorRol": {
    "pcd": 800,
    "tutor": 200,
    "institucion": 45,
    "admin": 5
  }
}
```

---

### GET `/administracion/analiticas`
**Descripción:** Obtener analíticas detalladas  
**Autenticación:** Bearer Token requerido (rol: admin)

---

### GET `/administracion/usuarios`
**Descripción:** Listar todos los usuarios  
**Autenticación:** Bearer Token requerido (rol: admin)

**Query Params:**
- `page` (number): Página
- `limite` (number): Resultados por página
- `rol` (string): Filtrar por rol
- `buscar` (string): Búsqueda por nombre/email

---

### PUT `/administracion/usuarios/:id/rol`
**Descripción:** Cambiar rol de usuario  
**Autenticación:** Bearer Token requerido (rol: admin)

**Request Body:**
```json
{
  "rol": "admin"
}
```

---

### PATCH `/administracion/usuarios/:id/activo`
**Descripción:** Activar/desactivar usuario  
**Autenticación:** Bearer Token requerido (rol: admin)

---

### DELETE `/administracion/usuarios/:id`
**Descripción:** Eliminar usuario (soft delete)  
**Autenticación:** Bearer Token requerido (rol: admin)

---

### GET `/administracion/instituciones/pendientes`
**Descripción:** Listar instituciones pendientes de aprobación  
**Autenticación:** Bearer Token requerido (rol: admin)

---

### POST `/administracion/instituciones/:id/aprobar`
**Descripción:** Aprobar institución  
**Autenticación:** Bearer Token requerido (rol: admin)

---

### PATCH `/administracion/instituciones/:id/verificar`
**Descripción:** Alternar verificación de institución  
**Autenticación:** Bearer Token requerido (rol: admin)

---

### DELETE `/administracion/instituciones/:id`
**Descripción:** Rechazar/eliminar institución  
**Autenticación:** Bearer Token requerido (rol: admin)

---

### GET `/administracion/resenas`
**Descripción:** Listar todas las reseñas (moderación)  
**Autenticación:** Bearer Token requerido (rol: admin)

---

### DELETE `/administracion/resenas/:id`
**Descripción:** Eliminar reseña (moderación)  
**Autenticación:** Bearer Token requerido (rol: admin)

---

### GET `/administracion/audit-log`
**Descripción:** Obtener log de auditoría  
**Autenticación:** Bearer Token requerido (rol: admin)

**Query Params:**
- `page` (number): Página
- `limite` (number): Resultados por página
- `accion` (string): Filtrar por tipo de acción
- `usuarioId` (string): Filtrar por usuario

---

### GET `/administracion/configuracion`
**Descripción:** Obtener configuración del sistema  
**Autenticación:** Bearer Token requerido (rol: admin)

---

### PUT `/administracion/configuracion`
**Descripción:** Actualizar configuración del sistema  
**Autenticación:** Bearer Token requerido (rol: admin)

---

## 📚 Catálogos

### GET `/catalogos/parentescos`
**Descripción:** Listar parentescos disponibles  
**Autenticación:** No requerida

**Response (200):**
```json
[
  { "id": "madre", "nombre": "Madre" },
  { "id": "padre", "nombre": "Padre" },
  { "id": "hijo", "nombre": "Hijo/a" },
  { "id": "hermano", "nombre": "Hermano/a" },
  { "id": "tutor", "nombre": "Tutor Legal" }
]
```

---

### GET `/catalogos/discapacidades`
**Descripción:** Listar tipos de discapacidad  
**Autenticación:** No requerida

**Response (200):**
```json
[
  { "id": "fisica", "nombre": "Física", "descripcion": "Movilidad, fuerza, coordinación" },
  { "id": "sensorial", "nombre": "Sensorial", "descripcion": "Visual, auditiva" },
  { "id": "intelectual", "nombre": "Intelectual", "descripcion": "Cognitiva, aprendizaje" },
  { "id": "psicosocial", "nombre": "Psicosocial", "descripcion": "Salud mental" },
  { "id": "multiple", "nombre": "Múltiple", "descripcion": "Combinación de tipos" }
]
```

---

### GET `/catalogos/features`
**Descripción:** Listar features disponibles del sistema  
**Autenticación:** No requerida

**Response (200):**
```json
{
  "features": [
    { "id": "chat", "nombre": "Mensajería", "descripcion": "Chat entre usuarios" },
    { "id": "postulaciones", "nombre": "Empleo", "descripcion": "Postulaciones laborales" },
    { "id": "comunidad", "nombre": "Comunidad", "descripcion": "Publicaciones y grupos" },
    { "id": "resenas", "nombre": "Reseñas", "descripcion": "Calificaciones de instituciones" },
    { "id": "descubrimiento", "nombre": "Descubrimiento", "descripcion": "Búsqueda inteligente" },
    { "id": "favoritos", "nombre": "Favoritos", "descripcion": "Instituciones favoritas" },
    { "id": "multimedia", "nombre": "Multimedia", "descripcion": "Subida de archivos" }
  ]
}
```

---

### GET `/catalogos/etapas-vida`
**Descripción:** Listar etapas de vida  
**Autenticación:** No requerida

---

### GET `/catalogos/modalidades`
**Descripción:** Listar modalidades de trabajo  
**Autenticación:** No requerida

**Response (200):**
```json
[
  { "id": "presencial", "nombre": "Presencial" },
  { "id": "remoto", "nombre": "Remoto" },
  { "id": "hibrido", "nombre": "Híbrido" }
]
```

---

## 📁 Multimedia

### POST `/multimedia`
**Descripción:** Subir archivo multimedia  
**Autenticación:** Bearer Token requerido  
**Content-Type:** multipart/form-data  
**Feature Guard:** `@Feature('multimedia')`

**FormData:**
- `file`: Archivo (imagen, video, audio)
- `categoria` (string): Tipo de archivo

**Validaciones:**
- Tamaño máximo: 10MB (imágenes), 50MB (videos)
- Tipos permitidos: JPEG, PNG, WebP, MP4, MP3, PDF
- Validación por magic bytes

**Response (200):**
```json
{
  "url": "https://storage.googleapis.com/raices-multimedia/abc123/archivo.jpg",
  "tipo": "imagen",
  "tamaño": 1024000
}
```

---

## 🔔 Notificaciones

### GET `/notificaciones`
**Descripción:** Listar notificaciones del usuario  
**Autenticación:** Bearer Token requerido

**Query Params:**
- `soloNoLeidas` (boolean): Filtrar solo no leídas

**Response (200):**
```json
{
  "datos": [
    {
      "id": "notif-abc123",
      "tipo": "nueva_postulacion",
      "titulo": "Nueva postulación recibida",
      "mensaje": "Juan Pérez se postuló a tu vacante",
      "leida": false,
      "fechaCreacion": "2026-08-11T10:00:00.000Z",
      "datosExtra": {
        "vacanteId": "vac-abc123",
        "usuarioId": "usr-abc123"
      }
    }
  ]
}
```

---

### PATCH `/notificaciones/:id/leida`
**Descripción:** Marcar notificación como leída  
**Autenticación:** Bearer Token requerido

---

### PATCH `/notificaciones/todas-leidas`
**Descripción:** Marcar todas las notificaciones como leídas  
**Autenticación:** Bearer Token requerido

---

### DELETE `/notificaciones/:id`
**Descripción:** Eliminar notificación  
**Autenticación:** Bearer Token requerido

---

### GET `/notificaciones/stream`
**Descripción:** Server-Sent Events para notificaciones en tiempo real  
**Autenticación:** Bearer Token requerido (via query param o header)

---

## 🏥 Salud del Sistema

### GET `/health`
**Descripción:** Verificar estado del sistema  
**Autenticación:** No requerida

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2026-08-11T12:00:00.000Z",
  "uptime": 86400,
  "servicios": {
    "firestore": "conectado",
    "firebaseAuth": "conectado",
    "storage": "conectado"
  }
}
```

---

## 🔑 Autenticación en Endpoints

### Header de Autenticación
Todos los endpoints protegidos requieren el header:
```
Authorization: Bearer <tokenAcceso>
```

### Obtener Token
1. Registrar usuario: `POST /autenticacion/registro`
2. Iniciar sesión: `POST /autenticacion/inicio-sesion`
3. Usar el `tokenAcceso` en headers

### Renovar Token
Cuando el token expire (1 hora):
1. Enviar `POST /autenticacion/renovar-token` con el `tokenRefresco`
2. Usar el nuevo `tokenAcceso`

---

## 🛡️ Rate Limits

| Endpoint | Límite | Ventana |
|----------|--------|---------|
| `/autenticacion/registro` | 3 | 1 hora |
| `/autenticacion/inicio-sesion` | 5 | 1 minuto |
| `/ia/conversacion` | 20 | 1 hora |
| Otros endpoints | 100 | 1 minuto |

---

## ⚠️ Errores Comunes

| Código | Significado | Acción |
|--------|-------------|--------|
| `400` | Bad Request | Verificar formato de datos |
| `401` | Unauthorized | Verificar token de autenticación |
| `403` | Forbidden | No tienes permisos para esta acción |
| `404` | Not Found | Recurso no encontrado |
| `409` | Conflict | Recurso ya existe (duplicado) |
| `429` | Too Many Requests | Rate limit alcanzado, esperar |

---

## 📖 Swagger Documentation

Documentación interactiva disponible en:
```
https://raices-backend-jftu6lrbda-uc.a.run.app/docs
```

---

## 🔄 Cambios Recientes

### Agosto 2026
- ✅ Agregado endpoint `GET /empleo/postulantes-vacante` para consultar postulantes por vacante
- ✅ Agregado alias `GET /empleo/postulaciones` para compatibilidad con frontend
- ✅ Sistema de auditoría para trazabilidad de acciones admin
- ✅ Validación por magic bytes en uploads
- ✅ Sanitización XSS en campos de texto
- ✅ ETag con cache en memoria
- ✅ Rate limits configurables
