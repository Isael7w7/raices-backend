# API Raíces — Catálogo de Rutas (Frontend)

> **Base URL:** `http://localhost:7000/api` (producción: Cloud Run `*.run.app`)
> **Swagger vivo:** `http://localhost:7000/docs`
> Todas las rutas de abajo se sirven **bajo el prefijo `/api`**.

---

## Convenciones mínimas

| Tema | Detalle |
|---|---|
| **Auth** | Header `Authorization: Bearer <idTokenFirebase>` **o** cookies httpOnly (`token_acceso`, `token_refresco`). El header gana si hay ambos. |
| **CORS** | `credentials: true` habilitado; `localhost:3000` y `localhost:5173` permitidos. |
| **Éxito** | El recurso directo (sin wrapper). `200` / `201` (creación) / `204` (sin cuerpo). |
| **Error** | `{ statusCode: number, message: string \| string[] }`. |
| **Paginación** | Plana: `{ datos, total, pagina, limite, totalPaginas }` · Anidada: `{ datos, paginacion: { total, pagina, limite, totalPaginas } }`. Query estándar: `pagina`, `limite`, `ordenarPor`, `direccion`, `buscar`. |
| **ETag** | Muchos GET devuelven `ETag`; reenviar `If-None-Match` puede responder **304 sin cuerpo**. |
| **Rate limit** | `429` con `{ statusCode, message, ttl }` (`ttl` = segundos para reintentar). Límite global: 60 req/min por IP. |
| **Roles** | `pcd`, `padre_tutor`/`tutor`, `institucion`/`empresa`, `especialista`, `institucional`, `admin`. |
| **Features** | Guards por flag booleana: `chat`, `postulaciones`, `comunidad`, `resenas`, `descubrimiento`, `favoritos`, `multimedia` → `403` si está en `false`. |

### Leyenda de acceso
- 🌐 Público (sin token)
- 🔒 Cualquier usuario autenticado (JWT)
- 🛡️ Requiere rol específico

---

## 1. Autenticación — `/api/autenticacion`

| Método | Ruta | Acceso | Body / Query | Respuesta |
|---|---|---|---|---|
| POST | `/autenticacion/registro` | 🌐 | JSON `RegisterDto` o `multipart/form-data` con `csf` opcional (PDF/imagen ≤10MB). Requeridos: `email`, `password` (min 8, mayúscula+minúscula+número), `nombreCompleto`, `rol` (`pcd`\|`padre_tutor`\|`institucion`\|`especialista`\|`empresa`\|`institucional`). Opcionales: `ciudad`, `estado`, `fechaNacimiento`, `domicilio`, `categoria` (requerido si rol=institucion), `descripcion`, `telefono`, `tiposDiscapacidad[]`, `tutorId`, `features{}`, `profesion`, `bio`, `destinatarioRegistro`, `curp`, `telefonoContacto`, `preferenciasAcompanamiento`, `tonoContextual`, `documentoCsf` | `201` `{ usuario, requiereInicioSesion: true }` · `409` email duplicado · ⚡10/hora |
| POST | `/autenticacion/inicio-sesion` | 🌐 | `{ email, password }` | `200` `{ tokenAcceso, tokenRefresco, expiraEn, usuario }` + cookies httpOnly · `401` · ⚡5/min |
| POST | `/autenticacion/renovar-token` | 🌐 | `{ tokenRefresco }` (o cookie) | `200` misma estructura de sesión + cookies · ⚡10/min |
| POST | `/autenticacion/cerrar-sesion` | 🌐 | — | `204` borra cookies. **Llamar siempre al desloguear** (valida Origin → `403` CSRF) |
| POST | `/autenticacion/cerrar-sesion-global` | 🔒 | — | `200` `{ mensaje }` revoca todos los refresh tokens |
| GET | `/autenticacion/yo` | 🔒 | — | `200` perfil completo (`RespuestaPerfilDto`) |

> ⚠️ El registro **NO** inicia sesión: tras registrarse hay que llamar `inicio-sesion`.

---

## 2. Usuarios — `/api/usuarios`

| Método | Ruta | Acceso | Body / Query | Respuesta |
|---|---|---|---|---|
| GET | `/usuarios/perfil` | 🔒 | — | Perfil completo + profiling |
| GET | `/usuarios/buscar` | 🔒 | Query: `q`, `pagina`, `limite` | Paginado `{id, nombreCompleto, urlAvatar, rol, ciudad, profesion}` |
| GET | `/usuarios/perfil-pcd/:pcdUserId` | 🛡️ `padre_tutor`/`tutor`/`institucion`/`admin` | — | Perfil completo de PCD |
| PUT | `/usuarios/perfil` | 🔒 | `ActualizarPerfilDto` (parcial): `nombreCompleto`, `ciudad`, `estado`, `fechaNacimiento`, `domicilio`, `urlAvatar`, `profesion`, `bio`, `curp`, `telefonoContacto`, `destinatarioRegistro`, `preferenciasAcompanamiento`, `tonoContextual`, `sector`, `sitioWeb`, `emailContacto`, `accesibilidadInfraestructura[]` | `200` perfil · ⚡10/min |
| PUT | `/usuarios/perfil-necesidades` | 🔒 | `tiposDiscapacidad[]`, `etapaVida`, `necesidadesMovilidad[]`, `areasInteres[]`, `condiciones[]` (parcial) | `200` · ⚡10/min |
| PATCH | `/usuarios/perfil-necesidades` | 🔒 | (alias del PUT) | `200` · ⚡10/min |
| POST | `/usuarios/perfil-necesidades` | 🔒 | `GuardarPerfilNecesidadesDto` completo: `tiposDiscapacidad[]`, `severidadDiscapacidad`, `modosComunicacion[]`, `necesidadesMovilidad[]`, `accesoTecnologia[]`, `zonasPreferidas[]`, `necesidades[]`, `metasActuales[]`, `areasApoyo[]`, `historialEducacion[]`, `historialTerapia[]`, `etapaVida`, `preocupacionesActuales`, `nivelApoyo`, `historialInstituciones[]`, `tonoContextual` | `200` · ⚡10/min |
| POST | `/usuarios/escalas-vida` | 🔒 | Requeridos: `nivelAutonomia`, `nivelIndependencia`, `nivelComunicacion`, `nivelComprension`, `nivelEnergia`, `nivelMovilidad`, `nivelSocial`, `nivelEmocional` (enum 1-4), `tieneDiagnostico`. Opcional: `temporalidadOrigen`, `preferenciaFormato`, `areasInteres[]`, `viabilidadEconomica` | `201` · ⚡10/min |
| PUT | `/usuarios/:id` | 🛡️ `admin` | `nombreCompleto?`, `nombre?`, `apellido?`, `email?` | `200` · `409` email en uso · ⚡10/min |
| POST | `/usuarios/avatar` | 🔒 | `multipart` campo `avatar` (JPEG/PNG/WebP/GIF ≤5MB) | `201` `{ urlAvatar }` |
| DELETE | `/usuarios/avatar` | 🔒 | — | `204` |
| POST | `/usuarios/documento-identidad` | 🔒 | `multipart`: `documento` (JPEG/PNG/WebP/PDF ≤10MB, req), `tipo` (`curp`\|`identificacion_oficial`\|`certificado_discapacidad`, req), `numeroCurp?` | `201` `{tipo, urlDocumento, estado, fechaSubida, numeroCurp}` · ⚡5/min |
| GET | `/usuarios/estado-validacion-identidad` | 🔒 | — | `{ estado, tieneCurp, tieneIdentificacion, tieneCertificadoDiscapacidad, numeroCurp?, motivoRechazo?, ... }` |
| GET | `/usuarios/dependientes/count` | 🔒 | — | `{ total, limite, restantes }` |
| GET | `/usuarios/dependientes` | 🔒 | — | Lista de dependientes |
| GET | `/usuarios/mis-personas` | 🔒 | Query paginación + `buscar` | Paginado `{id, nombre, esCuentaVinculada, features, fotoUrl, pcdUserId?, fechaCreacion?}` |
| POST | `/usuarios/dependientes` | 🔒 | `nombreCompleto?`, `parentesco?`, `tiposDiscapacidad[]?`, `rangoEdad?`, `etapaVida?`, `notas?` | `201` · `400` si límite (env `MAX_DEPENDIENTES_POR_TUTOR`, default 5) · ⚡5/min |
| GET | `/usuarios/dependientes/:id` | 🔒 | — | Detalle |
| PUT | `/usuarios/dependientes/:id` | 🔒 | Mismo DTO que crear | `200` · ⚡10/min |
| DELETE | `/usuarios/dependientes/:id` | 🔒 | — | `204` |
| GET | `/usuarios/dependientes/:dependienteId/permisos` | 🛡️ `padre_tutor`/`tutor`/`admin` | — | `{ dependienteId, nombre, esCuentaVinculada, pcdUserId?, features, permisos }` |
| PUT | `/usuarios/dependientes/:dependienteId/permisos` | 🛡️ `padre_tutor`/`tutor`/`admin` | Módulos `instituciones`/`empleo`/`comunidad`; acciones `puedeComentar`, `puedeInteractuar`, `accesoMultimedia`, `accesoChat` + aliases clásicos (`chat`, `postulaciones`, `resenas`, `descubrimiento`, `favoritos`, `multimedia`) — parcial | `200` |
| PATCH | `/usuarios/dependientes/:dependienteId/permisos` | 🛡️ `padre_tutor`/`tutor`/`admin` | (alias del PUT) | `200` |
| PATCH | `/usuarios/dependientes/:dependienteId/features` | 🛡️ `padre_tutor`/`tutor` | Booleans: `chat`, `postulaciones`, `comunidad`, `resenas`, `descubrimiento`, `favoritos`, `multimedia` | `200` |
| POST | `/usuarios/vincular-pcd` | 🛡️ `padre_tutor`/`tutor` | `{ email }` (req) | `201` `{vinculado, pcdUserId, tutorId}` · `400` ya vinculada/no PCD · ⚡5/min |
| PATCH | `/usuarios/vincular-pcd/:pcdId/features` | 🛡️ `padre_tutor`/`tutor` | `UpdateFeaturesDto` | `200` |
| DELETE | `/usuarios/pcd-vinculado/:pcdUserId/desvincular` | 🛡️ `padre_tutor`/`tutor`/`admin` | — | `200` `{desvinculado, pcdUserId, tutorId}` |
| ~~PUT~~ | `/usuarios/dependientes/:id/features` | 🛡️ | ⚠️ **DEPRECADO** — usar PATCH `.../dependientes/:dependienteId/features` | |
| ~~PUT~~ | `/usuarios/pcd-vinculado/:pcdUserId/features` | 🛡️ | ⚠️ **DEPRECADO** — usar PATCH `.../vincular-pcd/:pcdId/features` | |
| DELETE | `/usuarios/cuenta` | 🔒 | — | `204` auto-eliminación reversible (60 días de gracia) |

### 2.1 Recomendaciones (montadas en `/api/usuarios`)

| Método | Ruta | Acceso | Body / Query | Respuesta |
|---|---|---|---|---|
| POST | `/usuarios/interacciones` | 🔒 | `{ institucionId, tipo: 'guardar'\|'ver_detalle'\|'click_card', categoria? }` | `201` `{exito, id, mensaje}` · ⚡100/min |
| GET | `/usuarios/interacciones/pesos` | 🔒 | — | `{ pesos: { categoria: puntos } }` |
| GET | `/usuarios/recomendaciones` | 🔒 | `pagina`, `limite` (max 50) | Anidado `{datos:[{id,nombre,categoria,ciudad,urlLogo,score_intereses,score_comportamiento,final_score}], paginacion}` |
| GET | `/usuarios/onboarding` | 🔒 | — | Estado de completitud |
| GET | `/usuarios/especialistas` | 🔒 | Query paginación | Especialistas por score |

---

## 3. Tutores — `/api/tutores`

| Método | Ruta | Acceso | Body | Respuesta |
|---|---|---|---|---|
| GET | `/tutores/dependientes/:dependienteId/permisos` | 🛡️ `padre_tutor`/`tutor`/`admin` | — | Features + permisos |
| PUT | `/tutores/dependientes/:dependienteId/permisos` | 🛡️ `padre_tutor`/`tutor`/`admin` | `ActualizarPermisosDependienteDto` | `200` |
| PATCH | `/tutores/dependientes/:dependienteId/permisos` | 🛡️ `padre_tutor`/`tutor`/`admin` | (alias del PUT) | `200` |

---

## 4. Instituciones — `/api/instituciones`

| Método | Ruta | Acceso | Body / Query | Respuesta |
|---|---|---|---|---|
| GET | `/instituciones` | 🌐 | Query: `page`, `limit` (default 20, max 50), `busqueda`, `categoria` (`funcional`\|`educativo`\|`laboral`\|`social`), `ciudad` | Anidado paginado de `InstitucionDto` |
| GET | `/instituciones/:id` | 🌐 | — | Solo activas+verificadas; incluye `servicios` activos |
| GET | `/instituciones/:id/detalle` | 🔒 | — | Detalle sin importar estado (solo propietario o admin) |
| POST | `/instituciones` | 🛡️ `institucion`/`admin` + verificada | Requeridos: `nombre` (≤200), `categoria`. Opcionales: `descripcion`, `subcategoria`, `direccion`, `ciudad`, `estado`, `lat`, `lng`, `telefono`, `whatsapp`, `email`, `sitioWeb`, `urlLogo`, `urlPortada`, `tiposDiscapacidad[]`, `edadMinima`, `edadMaxima`, `horarioAtencion`, `tipoPlan` (`gratuito`\|`pago`\|`mixto`), `servicios[]`, `fotos[]` | `201` · ⚡5/min |
| PUT | `/instituciones/:id` | 🛡️ propietario/`admin` | Mismo DTO, parcial | `200` · ⚡10/min |
| DELETE | `/instituciones/:id` | 🛡️ propietario/`admin` | — | `204` (soft-delete) |
| GET | `/instituciones/mi-institucion` | 🔒 | — | `InstitucionDto` · `404` si no tiene |
| PUT | `/instituciones/mi-institucion` | 🛡️ `institucion`/`admin` | `UpdateInstitucionDto` (parcial) | `200` · ⚡10/min |
| DELETE | `/instituciones/mi-institucion` | 🛡️ `institucion`/`admin` | — | `204` (soft-delete) · ⚡5/min |
| GET | `/instituciones/mi-institucion/estado-verificacion` | 🔒 | — | Pasos (CSF obligatorio, aprobación admin, identificación opcional) + porcentaje |
| POST | `/instituciones/validar-csf-qr` | 🔒 | `multipart` `documento` (PDF/imagen ≤10MB) | `200` `{exito, mensaje, urlSat}` · ⚡5/min |
| POST | `/instituciones/verificacion/documentos` | 🛡️ `institucion`/`empresa`/`admin` | `multipart`: `documento` (≤10MB, req), `tipo` (`csf`\|`identificacion_representante`, req) | `201` · ⚡5/min |
| GET | `/instituciones/mi-institucion/servicios/inscripciones/resumen` | 🔒 | — | Conteo pendientes/activas/rechazadas por servicio |
| GET | `/instituciones/:id/mis-inscripciones` | 🔒 | — | `{institucionId, datos:[{institucionId, servicioId, estado}]}` |
| POST | `/instituciones/:id/servicios/:servicioId/inscripcion` | 🔒 | — | `201` idempotente, estado inicial `pendiente` · ⚡10/min |
| GET | `/instituciones/:id/servicios/:servicioId/inscripcion` | 🔒 | — | `{institucionId, servicioId, estado, inscrito, solicitado}` |
| DELETE | `/instituciones/:id/servicios/:servicioId/inscripcion` | 🔒 | — | `200` (estado → `cancelada`) · ⚡10/min |
| GET | `/instituciones/:id/servicios/:servicioId/inscripciones` | 🔒 dueño/admin | Query: `estado` (`pendiente`\|`activa`\|`rechazada`\|`cancelada`\|`todas`) | Lista `{id,nombre,email}` |
| POST | `/instituciones/:id/servicios/:servicioId/inscripciones/:inscripcionId/aprobar` | 🔒 dueño/admin | — | `200` |
| POST | `/instituciones/:id/servicios/:servicioId/inscripciones/:inscripcionId/rechazar` | 🔒 dueño/admin | — | `200` |

---

## 5. Descubrimiento — `/api/descubrimiento`

| Método | Ruta | Acceso | Query | Respuesta |
|---|---|---|---|---|
| GET | `/descubrimiento` | 🔒 | `categoria`, `categorias` (prioritarias separadas por coma, ej. `laboral,funcional`), `ciudad`, `busqueda`, `tipoDiscapacidad` | Array de `InstitucionDto` + `coincidePerfil`, ordenado por relevancia |

---

## 6. Favoritos — `/api/favoritos`

| Método | Ruta | Acceso | Respuesta |
|---|---|---|---|
| GET | `/favoritos` | 🔒 | Array de `InstitucionDto` |
| GET | `/favoritos/ids` | 🔒 | `string[]` (respuesta ligera) |
| POST | `/favoritos/:institutionId/alternar` | 🔒 + feature `favoritos` | `{ favorito: boolean }` · ⚡20/min |

---

## 7. Reseñas — `/api/resenas`

| Método | Ruta | Acceso | Body / Query | Respuesta |
|---|---|---|---|---|
| GET | `/resenas/institucion/:id` | 🌐 | Query paginación | Paginado `{id, calificacion, comentario, fechaCreacion, autor...}` |
| GET | `/resenas/mias` | 🔒 | Query paginación | Paginado |
| POST | `/resenas/institucion/:id` | 🔒 + feature `resenas` | `{ calificacion: 1-5 (req), comentario? (≤1000) }` | Crea **o actualiza** (1 reseña/usuario/institución) · ⚡5/min |
| PUT | `/resenas/:id` | 🔒 (solo autor) | `{ calificacion?, comentario? }` | `200` · ⚡10/min |
| DELETE | `/resenas/:id` | 🔒 (solo autor) | — | `204` |

---

## 8. Comunidad — `/api/comunidad`

| Método | Ruta | Acceso | Body / Query | Respuesta |
|---|---|---|---|---|
| GET | `/comunidad/grupos` | 🌐 | Paginación + `buscar` | `{id,nombre,descripcion,esPublico,exclusivoPadres,creadorId,cantidadMiembros,fechaCreacion}` |
| POST | `/comunidad/grupos` | 🔒 | `{ nombre (≤200, req), descripcion?, esPublico?=true, exclusivoPadres?=false }` | `201` · ⚡5/min |
| POST | `/comunidad/grupos/:id/unirse` | 🔒 | — | `200` · ⚡10/min |
| POST | `/comunidad/grupos/:id/salir` | 🔒 | — | `200` · `403` si es creador · ⚡10/min |
| GET | `/comunidad/publicaciones` | 🔒 | Query: `grupoId?` + paginación | Paginado |
| POST | `/comunidad/publicaciones` | 🔒 + feature `comunidad` | `{ contenido (req ≤5000), grupoId?, mediaUrl?, categoriaCreativa?: 'arte'\|'dibujo'\|'historia'\|'general', exclusivoPadres? }` | `201` · ⚡5/min |
| PUT | `/comunidad/publicaciones/:id` | 🔒 (solo autor) + feature | `{ contenido (≤5000), mediaUrl? }` | `200` · ⚡10/min |
| DELETE | `/comunidad/publicaciones/:id` | 🔒 (autor/admin) | — | `204` |
| GET | `/comunidad/publicaciones/:id/comentarios` | 🌐 | Paginación | Paginado |
| POST | `/comunidad/publicaciones/:id/comentarios` | 🔒 + feature | `{ contenido (≤2000) }` | `201` · ⚡10/min |
| POST | `/comunidad/publicaciones/:id/me-gusta` | 🔒 + feature | — | Toggle `{ meGusta: boolean }` · ⚡20/min |
| GET | `/comunidad/feed-mixto` | 🔒 | Paginación (default 12) | 50% comunidad + 50% ruta activa |
| GET | `/comunidad/estadisticas` | 🌐 | — | `{ totalGrupos, totalPublicaciones, totalComentarios }` |
| GET | `/comunidad/miembros` | 🌐 | `pagina`, `limite`, `buscar` | Testimonios `{id,nombreCompleto,rol,profesion,bio,ciudad,estado,urlAvatar}` |
| POST | `/comunidad/foros` | 🛡️ `institucion`/`admin` | `{ titulo (req), descripcion?, preguntasDetonantes: string[] (req, no vacío), exclusivoPadres? }` | `201` · ⚡5/min |
| GET | `/comunidad/foros` | 🌐 | Paginación + `buscar` | Paginado |
| GET | `/comunidad/foros/:id` | 🌐 | — | Foro + `preguntasConRespuestas[{pregunta, respuestas[]}]` |
| POST | `/comunidad/foros/:id/respuestas` | 🔒 | `{ preguntaIndex: number (≥0, req), contenido (req) }` | `201` · ⚡20/min |
| GET | `/comunidad/eventos` | 🔒 | `pagina`, `limite`, `categoria` (`taller`\|`deporte`\|`cultural`\|`encuentro`\|`voluntariado`\|`otro`), `fecha` (YYYY-MM-DD), `desde` (ISO8601), `buscar`. Solo próximos | Cada item incluye `asisto` |
| GET | `/comunidad/eventos/:id` | 🔒 | — | Detalle con organizador + `asisto` |
| POST | `/comunidad/eventos` | 🔒 + feature `comunidad` | `{ titulo (≤200, req), descripcion? (≤5000), categoria (req), fechaInicio (ISO8601, req), fechaFin?, ubicacion? (≤300), urlImagen? (≤2000) }` | `201` · ⚡5/min |
| POST | `/comunidad/eventos/:id/asistir` | 🔒 + feature | — | Toggle asistencia · ⚡10/min |
| GET | `/comunidad/conectemos/publicaciones` | 🌐 | `pagina`, `limite`, `categoriaCreativa`, `buscar` | Solo multimedia real |
| GET | `/comunidad/galeria` | 🌐 | (alias de `/conectemos/publicaciones`) | — |

---

## 9. Notificaciones — `/api/notificaciones`

| Método | Ruta | Acceso | Respuesta |
|---|---|---|---|
| GET | `/notificaciones` | 🔒 | Últimas 50: `[{id, usuarioId, tipo, titulo, cuerpo, leida, fechaCreacion}]` |
| PATCH | `/notificaciones/:id/leer` | 🔒 | `204` · ⚡30/min |
| PATCH | `/notificaciones/leer-todas` | 🔒 | `204` |
| GET | `/notificaciones/flujo` | 🔒 | **SSE** (`text/event-stream`) — tiempo real. ⚠️ `EventSource` no envía header Authorization; funciona con la cookie `token_acceso` |

---

## 10. Administración — `/api/administracion` (🛡️ solo `admin`)

| Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|
| GET | `/administracion/estadisticas` | — | Contadores generales |
| GET | `/administracion/analiticas` | — | Registros por mes, roles, categorías, geo |
| GET | `/administracion/inteligencia-necesidades` | — | Demanda vs oferta por discapacidad |
| GET | `/administracion/visitantes-activos` | — | Métricas |
| GET | `/administracion/auditoria` | `pagina`, `limite`, `usuarioId`, `accion`, `recurso`, `fechaDesde`, `fechaHasta` | Paginado |
| GET | `/administracion/auditoria/estadisticas` | — | — |
| GET | `/administracion/instituciones` | Paginación | Paginado |
| GET | `/administracion/instituciones/pendientes` | — | `activa=true, verificada=false` |
| GET | `/administracion/instituciones/:id/verificacion-identidad` | — | — |
| POST | `/administracion/instituciones/:id/aprobar` | — | `204` · `400` si identidad del representante sin verificar · ⚡10/min |
| PATCH | `/administracion/instituciones/:id/verificar` | — | Toggle verificación · ⚡10/min |
| DELETE | `/administracion/instituciones/:id` | — | `204` (borrado permanente) · ⚡10/min |
| GET | `/administracion/usuarios` | Paginación | Paginado |
| PATCH | `/administracion/usuarios/:id/activo` | — | Toggle activo · `400` propia cuenta · ⚡10/min |
| PATCH | `/administracion/usuarios/:id/rol` | `{ role: 'pcd'\|'tutor'\|'institucion'\|'admin' }` | `200` · `400` rol inválido o propio rol · ⚡10/min |
| PATCH | `/administracion/usuarios/:id` | `nombreCompleto?`/`nombre?`+`apellido?`/`email?` | `200` · `409` email en uso · ⚡10/min |
| PUT | `/administracion/usuarios/:id` | (alias del PATCH) | `200` · ⚡10/min |
| DELETE | `/administracion/usuarios/:id` | — | `204` eliminación permanente · no propia cuenta · ⚡10/min |
| POST | `/administracion/usuarios/purgar-eliminados` | — | Purga cuentas con gracia de 60 días vencida · ⚡5/min |
| GET | `/administracion/resenas` | Paginación | Moderación |
| DELETE | `/administracion/resenas/:id` | — | `204` recalcula promedio · ⚡10/min |
| GET | `/administracion/alertas` | — | Alertas por severidad |
| GET | `/administracion/configuracion` | — | — |
| PUT | `/administracion/configuracion` | `nombrePlataforma?`, `emailSoporte?`, `permitirRegistro?`, `aprobacionInstitucionRequerida?`, `iaHabilitada?`, `modoMantenimiento?`, `maxResenasPorUsuario?`, `ciudadPorDefecto?` (valores como string) | `200` · ⚡10/min |
| GET | `/administracion/documentos-identidad/pendientes` | `pagina`, `limite` | Paginado |
| POST | `/administracion/documentos-identidad/:id/aprobar` | — | `204` envía correo · ⚡10/min |
| POST | `/administracion/documentos-identidad/:id/rechazar` | `{ motivo: string }` (req, no vacío) | `204` · ⚡10/min |

---

## 11. Inteligencia Artificial — `/api/ia`

| Método | Ruta | Acceso | Body | Respuesta |
|---|---|---|---|---|
| POST | `/ia/conversacion` | 🔒 | `{ mensaje: string (≤2000, req), historial?: [{role, content}] }` | `200` respuesta ≤150 palabras · ⚡20/h prod, 100/h dev |
| POST | `/ia/recomendaciones` | 🔒 | `{ dependienteId? }` | `200` 3 próximos pasos + sugerencias · `404` si el dependiente no pertenece al tutor · ⚡10/h prod |
| POST | `/ia/resumen` | 🔒 | — | `200` resumen narrativo del perfil · ⚡5/h prod |
| POST | `/ia/validar-usuario/:id` | 🛡️ `admin` | — | `200` `{usuarioId, aprobado, requiereRevisionManual, confianza, razonamiento, detalles{...}, fuente, fechaValidacion}` · ⚡20/h prod |
| PATCH | `/ia/validar-usuario/:id/override` | 🛡️ `admin` | `{ aprobado: boolean (req), motivo? }` | `200` |
| GET | `/ia/validar-usuario/:id/historial` | 🛡️ `admin` | — | Array de registros de validación |

---

## 12. Empleo — `/api/empleo`

| Método | Ruta | Acceso | Body / Query | Respuesta |
|---|---|---|---|---|
| GET | `/empleo` | 🌐 | `ciudad`, `modalidad` (`presencial`\|`remoto`\|`híbrido`) + paginación | Paginado |
| GET | `/empleo/:id` | 🌐 | — | Detalle con info de institución |
| POST | `/empleo` | 🛡️ `institucion`/`empresa`/`admin` + verificada | Requerido: `titulo` (≤200). Opcional: `descripcion` (≤2000), `requisitos` (≤1000), `modalidad`, `horario`, `rangoSalario`, `ciudad`, `estado`, `inclusivaDiscapacidad?=true`, `tiposDiscapacidad[]`, `institucionId` (solo admin) | `201` · `403` sin CSF cargada/aprobación · ⚡10/min |
| PUT | `/empleo/:id` | 🛡️ propietario/`admin` + verificada | `ActualizarVacanteDto` (parcial, incluye `activa?`) | `200` |
| DELETE | `/empleo/:id` | 🛡️ propietario/`admin` + verificada | — | `204` (desactiva) |
| GET | `/empleo/postuladas` | 🔒 | — | `string[]` de IDs |
| GET | `/empleo/mis-postulaciones` | 🔒 | Paginación | Paginado |
| POST | `/empleo/:id/postularse` | 🔒 + feature `postulaciones` | `{ cartaPresentacion? (≤5000) }` | `201` · `409` si ya postuló · ⚡5/min |
| GET | `/empleo/postulantes-institucion` | 🛡️ `institucion`/`empresa`/`admin` | `institucionId` (req para admin), `estado`, paginación, `buscar` | Paginado |
| GET | `/empleo/postulantes-vacante` | 🛡️ `institucion`/`empresa`/`admin` | **`vacanteId` (req)**, `estado`, paginación, `buscar` | Paginado |
| GET | `/empleo/postulaciones` | 🛡️ | (alias de `postulantes-vacante`) | Paginado |
| GET | `/empleo/mis-vacantes` | 🛡️ `institucion`/`empresa`/`admin` | `institucionId?` (req para admin) | Incluye inactivas |
| PATCH | `/empleo/postulaciones/:id/estado` | 🛡️ + verificada | `{ estado: 'pendiente'\|'aceptada'\|'rechazada' }` | `200` notifica al postulante · ⚡20/min |

---

## 13. Mensajes — `/api/mensajes`

| Método | Ruta | Acceso | Body | Respuesta |
|---|---|---|---|---|
| GET | `/mensajes/conversaciones` | 🔒 | — | `[{socio:{id,nombre,urlAvatar}, ultimoMensaje, ultimoEn, noLeidos, isDeleted, destinatarioActivo}]` |
| GET | `/mensajes/no-leidos` | 🔒 | — | Número total |
| GET | `/mensajes/con/:userId` | 🔒 | — | Mensajes cronológicos |
| POST | `/mensajes/enviar/:userId` | 🔒 + feature `chat` | `{ contenido (req ≤5000), mediaUrl? }` | `201` · `403` autodestino/sin feature/destino inexistente · ⚡10/min |
| PATCH | `/mensajes/leer/:userId` | 🔒 | `{ actualizados: number }` | `200` · ⚡30/min |
| DELETE | `/mensajes/conversaciones/:userId` | 🔒 | — | `200` borrado lógico solo para el emisor · reaparece si llega mensaje nuevo · ⚡10/min |

---

## 14. Catálogos — `/api/catalogos` (🌐 todos públicos)

| Método | Ruta |
|---|---|
| GET | `/catalogos` (todos juntos) |
| GET | `/catalogos/parentescos` |
| GET | `/catalogos/discapacidades` |
| GET | `/catalogos/etapas-vida` |
| GET | `/catalogos/features` |
| GET | `/catalogos/categorias` |
| GET | `/catalogos/temporalidad-origen` |
| GET | `/catalogos/preferencia-formato` |
| GET | `/catalogos/areas-interes` |
| GET | `/catalogos/viabilidad-economica` |
| GET | `/catalogos/subcategorias-comunidad` |
| GET | `/catalogos/tono-contextual` |

---

## 15. Salud — `/api/health`

| Método | Ruta | Acceso | Respuesta |
|---|---|---|---|
| GET | `/health` | 🌐 (sin rate limit) | `200` `{status, checks:{proceso, firestore}, tiempoMs}` o `503` si Firestore cae |
| GET | `/health/simular-error-500` | 🌐 | ⚠️ **Solo si `NODE_ENV !== 'production'`**. Siempre 500 (pruebas de observabilidad) |

---

## 16. Rutas de desarrollo — `/api/rutas-desarrollo`

| Método | Ruta | Acceso | Body / Query | Respuesta |
|---|---|---|---|---|
| GET | `/rutas-desarrollo` | 🔒 | `estado` (`activa`\|`completada`\|`pausada`\|`cancelada`), `areaInteres` | Lista |
| GET | `/rutas-desarrollo/resumen` | 🔒 | — | `{totalRutas, rutasActivas, rutasCompletadas, rutasPausadas, progresoPromedio}` |
| GET | `/rutas-desarrollo/mi-ruta` | 🔒 | — | `{ruta, pasos[], pasoActual, entidadesLocales:{instituciones[], vacantes[]}, origen, perfilesSimilaresUsados[], mensaje?}` |
| GET | `/rutas-desarrollo/:id` | 🔒 | — | Ruta con pasos |
| POST | `/rutas-desarrollo` | 🔒 | Requeridos: `areaInteres`, `nombre` (≤200). Opcionales: `descripcion` (≤2000), `metaFinal` (≤1000), `prioridad` (`baja`\|`media`\|`alta`), `fechaLimite` | `201` · ⚡10/min |
| PUT | `/rutas-desarrollo/:id` | 🔒 | `ActualizarRutaDto` (parcial, incluye `estado`) | `200` · ⚡10/min |
| DELETE | `/rutas-desarrollo/:id` | 🔒 | — | `204` |
| GET | `/rutas-desarrollo/analytics` | 🛡️ `admin` | — | Métricas agregadas |
| POST | `/rutas-desarrollo/generar-personalizada` | 🔒 | — | `201` genera (o retorna existente) ruta activa · ⚡3/min prod, 30/min dev |
| POST | `/rutas-desarrollo/:id/pasos` | 🔒 | `titulo` (req ≤200), `descripcion?`, `orden?` (≥1), `categoria?` (`habla`\|`motricidad`\|`visual`\|`auditiva`\|`tea`\|`cognitiva`\|`educacion`\|`laboral`\|`social`\|`funcional`\|`general`) | `201` · ⚡20/min |
| PATCH | `/rutas-desarrollo/:rutaId/pasos/:pasoId/completar` | 🔒 | — | `200` · ⚡30/min |
| PATCH | `/rutas-desarrollo/:rutaId/pasos/:pasoId/descompletar` | 🔒 | — | `200` · ⚡30/min |
| POST | `/rutas-desarrollo/conocimiento/ingestar` | 🛡️ `admin` | **array** de `{knowledge_id, title, content, practical_guidance, limitations_and_warnings}` (dataset CENETEC/SEP/OMS para RAG) | `201` |

---

## 17. Onboarding — `/api/onboarding`

| Método | Ruta | Acceso | Body | Respuesta |
|---|---|---|---|---|
| GET | `/onboarding/estado` | 🔒 | — | `{onboardingCompleto, completado, seccionesFaltantes[], porcentajeProgreso, ultimoPasoCompletado, destinatarioPerfil, nombrePcd, pasosPendientes[], etapas{etapa1,etapa2,etapa3}, modulosPermitidos[]}` |
| POST | `/onboarding/borrador` | 🔒 | **Todos opcionales** (nunca 400 por incompletitud): `observacionesGenerales`, `fechaNacimiento`, `curp`, `ciudad`, `historialEducacion[]`, `etapaVida`, `historialTerapia[]`, `tieneDiagnostico?`, `tiposDiscapacidad[]`, `necesidades[]`, `metasActuales[]`, `preferenciasAcompanamiento`, `tonoContextual`, `areasInteres[]`, `escalasVida{}` | `200` borrador fusionado + progreso · ⚡30/min |
| POST | `/onboarding/completar` | 🔒 | — | `200` consolidación idempotente (`onboardingCompleto=true`, `porcentajeProgreso=100`) · ⚡10/min |

---

## 18. Contacto — `/api/contacto`

| Método | Ruta | Acceso | Body | Respuesta |
|---|---|---|---|---|
| POST | `/contacto` | 🌐 | `email` (req), `nombre` (3-80, req), `asunto` (`consulta`\|`institucion`\|`empresa`\|`soporte`\|`otro`, req), `mensaje` (20-2000, req), `aceptoContacto?` (`true` o `'true'`) | `201` · ⚡**3 / 10 min por IP** |

---

## 19. Multimedia — `/api/multimedia`

| Método | Ruta | Acceso | Body | Respuesta |
|---|---|---|---|---|
| POST | `/multimedia` | 🔒 + feature `multimedia` | `multipart` campo `archivo` (imagen o video ≤10MB, valida magic bytes) | `201` `{ url }` · `400` inválido / `403` feature desactivada · ⚡10/min |

---

## 20. Seed — ⚠️ NO DISPONIBLE

| Método | Ruta | Nota |
|---|---|---|
| GET | `/seed/institutions` | ⚠️ El módulo `SeedInstitutionsModule` **NO está montado** en `app.module.ts`. **Ruta inactiva** — no usar. |

---

## Notas clave para integración

1. **Prefijo**: todas las rutas van bajo `/api` + path en español.
2. **Registro no loguea**: tras `POST /autenticacion/registro` llamar `POST /autenticacion/inicio-sesion`.
3. **Logout**: llamar `POST /autenticacion/cerrar-sesion` (borra cookies httpOnly que JS no puede borrar) + eliminar token local.
4. **ETag**: los GET pueden devolver `ETag`; reenviar `If-None-Match` devuelve **304 sin cuerpo** — manejar en el cliente.
5. **Rate limit**: manejar **429** y usar el campo `ttl` (segundos) del cuerpo para reintentar.
6. **Roles tutor**: los guards aceptan `padre_tutor` y `tutor`.
7. **Aliases**: `PUT/PATCH /usuarios/perfil-necesidades`, `PUT/PATCH /administracion/usuarios/:id`, `GET /comunidad/galeria` (= `/conectemos/publicaciones`), `GET /empleo/postulaciones` (= `postulantes-vacante`).
8. **Endpoints deprecados** (funcionan pero no usar): `PUT /usuarios/dependientes/:id/features`, `PUT /usuarios/pcd-vinculado/:pcdUserId/features`.
9. **Validación global** (`whitelist: true`): los campos no declarados en el DTO se **eliminan** del body silenciosamente.
10. **Swagger vivo** en `/docs` es la fuente generada desde los DTOs — complemento recomendado.
