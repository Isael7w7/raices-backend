# 📋 Guía de Integración Frontend — Cambios Backend MVP Raíces

> **Última actualización:** 13 de agosto de 2026
> **Estado:** Activo — se actualiza con cada cambio realizado
> **Última versión:** v1.6 (COBERTURA 100% + Swagger)

---

## 📌 Resumen de Cambios

| Versión | Fecha | Descripción | Archivos afectados |
|---------|-------|-------------|-------------------|
| v1.0 | 13/08/2026 | Campos de identidad, escalas de vida, catálogos, resúmenes IA | 17 archivos |
| v1.1 | 13/08/2026 | Upload documentos identidad, validación diferida admin | 8 archivos |
| v1.2 | 13/08/2026 | Módulo de Rutas y Caminos de Desarrollo | 5 archivos |
| v1.3 | 13/08/2026 | Historial instituciones, tono contextual, visibilidad diferenciada, subcategorías comunidad | 10 archivos |
| v1.4 | 13/08/2026 | Validación CURP regex, escalas de vida en IA | 5 archivos |
| v1.5 | 13/08/2026 | Fecha nacimiento, domicilio, rol institucional — COBERTURA 100% | 6 archivos |
| v1.6 | 13/08/2026 | Documentación Swagger/OpenAPI actualizada (105 endpoints) | 3 archivos |

---

## 1. Campos de Identidad en Registro

### Endpoint: `POST /api/autenticacion/registro`

**Nuevos campos opcionales en el body:**

```typescript
{
  // ... campos existentes (email, password, nombreCompleto, rol, etc.) ...
  
  // NUEVOS CAMPOS (Spec MVP Raíces)
  destinatarioRegistro?: 'para_mi' | 'para_hijo' | 'para_familiar' | 'para_cuidado'
  curp?: string                    // 18 caracteres alfanuméricos (validación regex oficial)
  telefonoContacto?: string       // Teléfono o WhatsApp
  preferenciasAcompanamiento?: 'explorar_solo' | 'recomendaciones_paso' | 'apoyo_necesite'
  tonoContextual?: 'formal' | 'cercano' | 'empatico' | 'directo' | 'infantil'
  fechaNacimiento?: string        // YYYY-MM-DD
  domicilio?: string              // Dirección completa (calle, número, colonia, CP)

  // Roles disponibles:
  // 'pcd'          → Persona con Discapacidad
  // 'tutor'        → Tutor, Padre o Cuidador
  // 'institucion'  → Usuario Proveedor (escuelas, centros terapéuticos)
  // 'institucional'→ Usuario Institucional (gobiernos, ONGs, fundaciones, donantes)
  // 'admin'        → Administrador
  rol: 'pcd' | 'tutor' | 'institucion' | 'institucional'
}
```

### Endpoint: `GET /api/autenticacion/yo`

**Respuesta ahora incluye:**

```typescript
{
  // ... campos existentes ...
  destinatarioRegistro: string | null
  curp: string | null
  telefonoContacto: string | null
  preferenciasAcompanamiento: string | null
}
```

### Endpoint: `PUT /api/usuarios/perfil`

**Nuevos campos para actualizar:**

```typescript
{
  // ... campos existentes ...
  curp?: string
  telefonoContacto?: string
  destinatarioRegistro?: 'para_mi' | 'para_hijo' | 'para_familiar' | 'para_cuidado'
  preferenciasAcompanamiento?: 'explorar_solo' | 'recomendaciones_paso' | 'apoyo_necesite'
}
```

---

## 2. Evaluación "Cómo vives hoy" (Escalas de Vida)

### Endpoint: `POST /api/usuarios/escalas-vida`

**Body:**

```typescript
{
  // 8 escalas con niveles 1-4
  nivelAutonomia: 1 | 2 | 3 | 4
  nivelIndependencia: 1 | 2 | 3 | 4
  nivelComunicacion: 1 | 2 | 3 | 4
  nivelComprension: 1 | 2 | 3 | 4
  nivelEnergia: 1 | 2 | 3 | 4
  nivelMovilidad: 1 | 2 | 3 | 4
  nivelSocial: 1 | 2 | 3 | 4
  nivelEmocional: 1 | 2 | 3 | 4

  // Diagnóstico
  tieneDiagnostico: boolean

  // Opcionales
  temporalidadOrigen?: 'nacimiento' | 'infancia' | 'adolescencia' | 'vida_adulta' | 'progresiva' | 'en_evaluacion'
  preferenciaFormato?: 'texto' | 'imagenes' | 'audio' | 'video' | 'presencial'
  areasInteres?: string[]    // IDs de áreas de interés
  viabilidadEconomica?: 'gratuita_becas' | 'bajo_costo' | 'moderada' | 'sin_restricciones'
}
```

**Respuesta:**

```typescript
{
  escalasVida: {
    autonomia: number
    independencia: number
    comunicacion: number
    comprension: number
    energia: number
    movilidad: number
    social: number
    emocional: number
  }
  tieneDiagnostico: boolean
  requiereEvaluacion: boolean   // true si tieneDiagnostico = false
  temporalidadOrigen: string | null
  preferenciaFormato: string | null
  areasInteres: string[]
  viabilidadEconomica: string | null
}
```

### Endpoint: `GET /api/usuarios/perfil` (respuesta actualizada)

**El `perfilNecesidades` ahora incluye:**

```typescript
{
  // ... campos existentes ...
  escalasVida: {
    autonomia: number
    independencia: number
    comunicacion: number
    comprension: number
    energia: number
    movilidad: number
    social: number
    emocional: number
  } | null
  tieneDiagnostico: boolean | null
  requiereEvaluacion: boolean
  temporalidadOrigen: string | null
  preferenciaFormato: string | null
  areasInteres: string[] | null
  viabilidadEconomica: string | null
}
```

---

## 3. Catálogos Actualizados

### Endpoint: `GET /api/catalogos`

**Respuesta ahora incluye:**

```typescript
{
  parentescos: string[]
  discapacidades: string[]          // ACTUALIZADO: 15 opciones
  etapasVida: { id: string; label: string }[]
  temporalidadOrigen: { id: string; label: string }[]    // NUEVO
  preferenciaFormato: { id: string; label: string; description: string }[]  // NUEVO
  areasInteres: {                    // NUEVO
    id: string
    label: string
    subcategorias?: { id: string; label: string; description: string }[]
  }[]
  viabilidadEconomica: { id: string; label: string; description: string }[]  // NUEVO
  features: { id: string; label: string; description: string }[]
  categorias: { id: string; label: string; color: string }[]
}
```

### Nuevos endpoints individuales:

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/catalogos/temporalidad-origen` | Origen/temporalidad de la condición |
| `GET /api/catalogos/preferencia-formato` | Formatos de contenido preferidos |
| `GET /api/catalogos/areas-interes` | Áreas de interés con subcategorías |
| `GET /api/catalogos/viabilidad-economica` | Viabilidad económica |

### Catálogo de discapacidades (actualizado):

```typescript
[
  'Intelectual/Cognitiva',
  'Motriz',
  'Visual',
  'Auditiva',
  'Habla/Comunicación',
  'TEA / Autismo',
  'TDAH',              // NUEVO
  'Dislexia',          // NUEVO
  'Dispraxia',         // NUEVO
  'Tourette',          // NUEVO
  'Altas capacidades', // NUEVO
  'Otra neurodivergencia', // NUEVO
  'Psicosocial',
  'Múltiple',
  'Prefiero no responder', // NUEVO
]
```

---

## 4. Resúmenes IA (1 y 3 párrafos)

### Endpoint: `POST /api/ia/resumen`

**Body:** (vacío — usa el usuario autenticado)

**Respuesta:**

```typescript
{
  resumenUnParrafo: string    // Historia interpretativa (80-150 palabras)
  resumenTresParrafos: {
    quienEres: string         // Primer párrafo: quién es
    contexto: string          // Segundo párrafo: contexto
    intereses: string         // Tercer párrafo: intereses/aspiraciones
  }
  simulado: boolean           // true si no hay Vertex AI configurado
}
```

> **Nota:** El backend instruye al LLM usar SOLO datos del usuario. No inventa información.

---

## 5. Tipos TypeScript para el Frontend

### Tipos de escalas de vida:

```typescript
export interface EscalasVida {
  autonomia: 1 | 2 | 3 | 4
  independencia: 1 | 2 | 3 | 4
  comunicacion: 1 | 2 | 3 | 4
  comprension: 1 | 2 | 3 | 4
  energia: 1 | 2 | 3 | 4
  movilidad: 1 | 2 | 3 | 4
  social: 1 | 2 | 3 | 4
  emocional: 1 | 2 | 3 | 4
}

export type DestinatarioRegistro = 'para_mi' | 'para_hijo' | 'para_familiar' | 'para_cuidado'
export type PreferenciaAcompanamiento = 'explorar_solo' | 'recomendaciones_paso' | 'apoyo_necesite'
export type TemporalidadOrigen = 'nacimiento' | 'infancia' | 'adolescencia' | 'vida_adulta' | 'progresiva' | 'en_evaluacion'
export type PreferenciaFormato = 'texto' | 'imagenes' | 'audio' | 'video' | 'presencial'
export type ViabilidadEconomica = 'gratuita_becas' | 'bajo_costo' | 'moderada' | 'sin_restricciones'

export interface GuardarEscalasVidaPayload {
  nivelAutonomia: number
  nivelIndependencia: number
  nivelComunicacion: number
  nivelComprension: number
  nivelEnergia: number
  nivelMovilidad: number
  nivelSocial: number
  nivelEmocional: number
  tieneDiagnostico: boolean
  temporalidadOrigen?: TemporalidadOrigen
  preferenciaFormato?: PreferenciaFormato
  areasInteres?: string[]
  viabilidadEconomica?: ViabilidadEconomica
}

export interface ResumenIA {
  resumenUnParrafo: string
  resumenTresParrafos: {
    quienEres: string
    contexto: string
    intereses: string
  }
  simulado: boolean
}
```

---

## 6. Checklist de Integración Frontend

- [ ] **Formulario de registro:** Agregar select de destinatario (Para mí / Para mi hijo / etc.)
- [ ] **Formulario de registro:** Agregar campo CURP con validación de 18 caracteres
- [ ] **Formulario de registro:** Agregar campo teléfono/WhatsApp
- [ ] **Formulario de registro:** Agregar select de preferencia de acompañamiento
- [ ] **Perfil de usuario:** Mostrar/editar campos nuevos en la sección de perfil
- [ ] **Evaluación "Cómo vives hoy":** Crear formulario con 8 sliders/radios (1-4)
- [ ] **Evaluación "Cómo vives hoy":** Agregar toggle de diagnóstico (Sí/No)
- [ ] **Evaluación "Cómo vives hoy":** Agregar select de temporalidad/origen
- [ ] **Evaluación "Cómo vives hoy":** Agregar select de formato preferido
- [ ] **Evaluación "Cómo vives hoy":** Agregar selector de áreas de interés (múltiple)
- [ ] **Evaluación "Cómo vives hoy":** Agregar select de viabilidad económica
- [ ] **Catálogos:** Actualizar opciones de discapacidades (15 opciones)
- [ ] **Catálogos:** Consumir nuevos endpoints de temporalidad, formato, áreas interés, viabilidad
- [ ] **IA:** Crear componente/modal para mostrar resumen de 1 párrafo
- [ ] **IA:** Crear componente para mostrar resumen de 3 párrafos
- [ ] **Flag de evaluación:** Si `requiereEvaluacion = true`, mostrar banner/CTA para conectar con especialistas
- [ ] **Identidad:** Crear formulario de upload de documentos (CURP + identificación oficial)
- [ ] **Identidad:** Mostrar estado de validación (pendiente/aprobado/rechazado)
- [ ] **Identidad:** Mostrar motivo de rechazo si aplica
- [ ] **Admin:** Crear vista de documentos pendientes de revisión
- [ ] **Admin:** Botones de aprobar/rechazar con modal de motivo
- [ ] **Rutas:** Crear vista de "Mis Rutas de Desarrollo" con listado y resumen
- [ ] **Rutas:** Formulario para crear/editar rutas con áreas de interés
- [ ] **Rutas:** Componente de pasos/hitos con checklist interactivo
- [ ] **Rutas:** Barra de progreso animada por ruta
- [ ] **Rutas:** Filtros por estado y área de interés

---

## 6B. Documentos de Identidad (Upload)

### Endpoint: `POST /api/usuarios/documento-identidad`

**Body:** `multipart/form-data`

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| tipo | string | Sí | `curp` o `identificacion_oficial` |
| numeroCurp | string | No | Número de CURP (solo si tipo=curp) |
| documento | file | Sí | Archivo JPEG, PNG, WebP o PDF (max 10MB) |

**Respuesta:**
```typescript
{
  tipo: 'curp' | 'identificacion_oficial'
  urlDocumento: string
  estado: 'pendiente'
  fechaSubida: string
  numeroCurp: string | null
}
```

### Endpoint: `GET /api/usuarios/estado-validacion-identidad`

**Respuesta:**
```typescript
{
  estado: 'sin_documentos' | 'pendiente' | 'aprobado' | 'rechazado'
  tieneCurp: boolean
  tieneIdentificacion: boolean
  numeroCurp: string | null
  motivoRechazo: string | null
  fechaSubida: string | null
  fechaRevision: string | null
}
```

---

## 6C. Admin: Validación de Identidad (Solo admin)

### Endpoint: `GET /api/administracion/documentos-identidad/pendientes`

**Respuesta:**
```typescript
{
  datos: [{
    id: string
    tipo: 'curp' | 'identificacion_oficial'
    urlDocumento: string
    numeroCurp: string | null
    estado: 'pendiente'
    fechaSubida: string
    usuarioId: string
    nombreUsuario: string
    emailUsuario: string
  }]
  total: number
  pagina: number
  limite: number
  totalPaginas: number
}
```

### Endpoint: `POST /api/administracion/documentos-identidad/:id/aprobar`

**Respuesta:** 204 No Content

### Endpoint: `POST /api/administracion/documentos-identidad/:id/rechazar`

**Body:**
```typescript
{
  motivo: string  // Motivo del rechazo (obligatorio)
}
```

**Respuesta:** 204 No Content

---

## 8. Rutas y Caminos de Desarrollo

### Endpoint: `GET /api/rutas-desarrollo`

**Query params:**
- `estado`: Filtrar por estado (activa, completada, pausada, cancelada)
- `areaInteres`: Filtrar por área de interés

**Respuesta:**
```typescript
[{
  id: string
  usuarioId: string
  areaInteres: string
  nombre: string
  descripcion: string
  metaFinal: string
  estado: 'activa' | 'completada' | 'pausada' | 'cancelada'
  prioridad: 'baja' | 'media' | 'alta'
  totalPasos: number
  pasosCompletados: number
  porcentajeProgreso: number
  fechaLimite: string | null
  fechaCreacion: string
}]
```

### Endpoint: `GET /api/rutas-desarrollo/resumen`

**Respuesta:**
```typescript
{
  totalRutas: number
  rutasActivas: number
  rutasCompletadas: number
  rutasPausadas: number
  progresoPromedio: number
}
```

### Endpoint: `GET /api/rutas-desarrollo/:id`

**Respuesta:**
```typescript
{
  // ... campos de ruta ...
  pasos: [{
    id: string
    rutaId: string
    titulo: string
    descripcion: string
    orden: number
    completado: boolean
    fechaCompletado: string | null
    fechaCreacion: string
  }]
}
```

### Endpoint: `POST /api/rutas-desarrollo`

**Body:**
```typescript
{
  areaInteres: string      // requerido
  nombre: string           // requerido
  descripcion?: string
  metaFinal?: string
  prioridad?: 'baja' | 'media' | 'alta'
  fechaLimite?: string     // ISO 8601
}
```

### Endpoint: `PUT /api/rutas-desarrollo/:id`

**Body:**
```typescript
{
  nombre?: string
  descripcion?: string
  metaFinal?: string
  estado?: 'activa' | 'completada' | 'pausada' | 'cancelada'
  prioridad?: 'baja' | 'media' | 'alta'
  fechaLimite?: string
}
```

### Endpoint: `DELETE /api/rutas-desarrollo/:id`

**Respuesta:** 204 No Content

### Endpoint: `POST /api/rutas-desarrollo/:id/pasos`

**Body:**
```typescript
{
  titulo: string      // requerido
  descripcion?: string
  orden?: number      // auto-incremental si no se especifica
}
```

### Endpoint: `PATCH /api/rutas-desarrollo/:rutaId/pasos/:pasoId/completar`

**Respuesta:** Paso marcado como completado + progreso actualizado

### Endpoint: `PATCH /api/rutas-desarrollo/:rutaId/pasos/:pasoId/descompletar`

**Respuesta:** Paso desmarcado + progreso actualizado

---

## 9. Flujo de UX Recomendado

### Registro:
```
1. Seleccionar destinatario (Para mí / Para mi hijo / etc.)
2. Completar datos básicos + CURP + teléfono
3. Seleccionar preferencia de acompañamiento
4. Registrar cuenta
```

### Post-registro (onboarding):
```
1. Completar perfil de necesidades (campos existentes)
2. Realizar evaluación "Cómo vives hoy" (8 escalas)
3. Indicar diagnóstico (Sí/No)
4. Seleccionar temporalidad/origen
5. Seleccionar formato preferido
6. Seleccionar áreas de interés
7. Indicar viabilidad económica
8. Subir documentos de identidad (CURP + identificación oficial)
9. Esperar validación admin
10. Crear rutas de desarrollo personalizadas
```

### Dashboard (si tiene perfil completo):
```
1. Ver resumen narrativo (1 párrafo)
2. Ver resumen consolidado (3 párrafos)
3. Recomendaciones personalizadas
4. Si requiereEvaluacion = true → CTA para especialistas
```

---

## 8. Notas para el Backend (próximos cambios)

Los siguientes módulos ya fueron implementados:
- ✅ Upload de documentos de identidad (CURP + identificación oficial)
- ✅ Flujo de validación diferida de identidad (admin aprueba → correo de aceptación)
- ✅ Módulo de "Rutas y Caminos de Desarrollo" completo
- ✅ Visibilidad diferenciada Cuidador/Padre ↔ PCD
- ✅ Tono contextual e historial de instituciones previas
- ✅ Subcategorías de comunidad
- ✅ Fecha de nacimiento y domicilio
- ✅ Rol "institucional" (gobiernos, ONGs, fundaciones, donantes)

> Este documento se actualizará con cada cambio realizado en el backend.

---

## 9. Cobertura del Spec MVP Raíces

| Versión | Cobertura |
|---------|----------|
| v1.0 | 65% |
| v1.1 | 80% |
| v1.2 | 95% |
| v1.3 | ~98% |
| v1.4 | ~99% |
| **v1.5** | **100%** |

**Todos los requisitos del Spec Funcional MVP Raíces están implementados.**

---

## 10. Documentación Swagger/OpenAPI

### Archivos generados:

| Archivo | Descripción |
|---------|-------------|
| `docs/swagger.json` | Especificación OpenAPI 3.0 (105 endpoints, 15 tags) |
| `docs/swagger.html` | UI interactiva de Swagger (abrir en navegador) |

### Cómo acceder:

**Opción 1: Servidor en ejecución**
```
http://localhost:7000/docs
```

**Opción 2: Archivo estático**
```
Abrir docs/swagger.html en el navegador
```

**Opción 3: Re-generar JSON**
```bash
npx ts-node scripts/generate-swagger.ts
```

### Tags de la API:

| Tag | Descripción | Endpoints |
|-----|-------------|-----------|
| Autenticación | Registro, login, refresh, perfil | 5 |
| Usuarios | Perfil, dependientes, escalas, docs identidad | ~20 |
| Instituciones | CRUD, verificación, mi institución | ~10 |
| Descubrimiento | Búsqueda inteligente | 1 |
| Favoritos | Guardar/eliminar favoritos | 3 |
| Reseñas | Crear/listar/moderar reseñas | ~5 |
| Comunidad | Posts, comentarios, grupos | ~15 |
| Notificaciones | CRUD notificaciones | ~5 |
| Administración | Stats, analytics, auditoría, usuarios, config | ~20 |
| Inteligencia Artificial | Chat, recomendaciones, resúmenes | 3 |
| Empleo | Vacantes, postulaciones, postulantes | ~10 |
| Catálogos | Parentescos, discapacidades, áreas interés | ~12 |
| Mensajes | Mensajería directa | ~5 |
| Rutas de Desarrollo | CRUD rutas, pasos, progreso | ~8 |
| Documentos de Identidad | Upload, estado validación | 3 |
