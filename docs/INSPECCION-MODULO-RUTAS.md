# 🔍 Inspección técnica — Módulo "Mi Camino" (`RoutesService`)

> Basado en el código de `src/modules/routes/` y tests `routes.service.spec.ts` (28/28 ✅) + `test/routes.e2e-spec.ts`.

---

## 1. 📂 Archivos afectados

**Núcleo del módulo** (`src/modules/routes/`):

| Archivo | Rol |
|---|---|
| `routes.controller.ts` | Endpoints bajo `/api/rutas-desarrollo` (prefijo global `api` en `main.ts`). `JwtAuthGuard`, `@UseETag`, throttling por endpoint. |
| `routes.service.ts` | Lógica CRUD de rutas/pasos + **generación personalizada con Gemini** (cliente `GoogleGenAI` propio). |
| `knowledge-base.service.ts` | Plantillas expertas ("Día Cero"), búsqueda de perfiles similares (Fase Evolutiva), instituciones y vacantes cercanas. |
| `routes-analytics.service.ts` | Eventos en `_analytics` (`ruta_generada`, `paso_completado`) y resumen admin. |
| `routes.module.ts` | Wiring: `RoutesController + RoutesService + KnowledgeBaseService + RoutesAnalyticsService` (exporta analytics). |
| `dto/ruta-desarrollo.dto.ts` | `CrearRutaDto`, `ActualizarRutaDto`, `CrearPasoDto` y DTOs de respuesta (`RutaDesarrolloDto`, `PasoRutaDto`, `RutaPersonalizadaResponseDto`, `MiRutaResponseDto`, `RecursoLocalDto`…). |

**Dependencias externas al módulo:**

- `src/database/firestore.constants.ts` → `COLECCIONES.rutasDesarrollo`, `.pasosRuta`, `.perfiles`, `.perfilesExtendidos`, `.instituciones`, `.vacantes`.
- `src/common/interfaces/firestore-documents.interface.ts` → `PerfilDoc`, `PerfilExtendidoDoc`.
- `src/common/utils/firestore-helpers.ts` → `parsearTiposDiscapacidad`, `parsearCampoJson` (campos JSON serializados como string).
- `src/common/guards/custom-throttler.guard.ts` → `generarRutaPersonalizada` está en `HANDLERS_IA`, así que su 429 usa el mensaje específico de IA.
- Guards/decorators: `jwt.guard`, `roles.guard`, `@Roles('admin')`, `@CurrentUser`, `throttlePorEntorno`.

**Tests:** `routes.service.spec.ts` (unit) y `test/routes.e2e-spec.ts` (E2E con `POST /generar-personalizada` y `GET /mi-ruta`).

> ⚠️ **`ai.service.ts` NO participa en la generación de rutas.** Es un cliente Gemini independiente (`src/modules/ai/`) para `chat`, `recomendaciones`, `resumen` y `validar-usuario`. `RoutesService` instancia su **propio** `GoogleGenAI`. Solo comparten convención de env vars (`GEMINI_*` → `VERTEX_AI_*` → `FIREBASE_PROJECT_ID`), el modelo por defecto `gemini-3.1-flash-lite` y `thinkingLevel: MINIMAL`.

**Endpoints del módulo:**

```
GET    /api/rutas-desarrollo                      ?estado=&areaInteres=
GET    /api/rutas-desarrollo/resumen
GET    /api/rutas-desarrollo/mi-ruta              ← vista "Mi Camino"
GET    /api/rutas-desarrollo/analytics            (RolesGuard: admin, declarado antes de :id)
GET    /api/rutas-desarrollo/:id
POST   /api/rutas-desarrollo                      CrearRutaDto · throttle 10/min
PUT    /api/rutas-desarrollo/:id                  ActualizarRutaDto · 10/min
DELETE /api/rutas-desarrollo/:id                  204
POST   /api/rutas-desarrollo/generar-personalizada   ← IA · throttlePorEntorno(3, 30, 60000)
POST   /api/rutas-desarrollo/:id/pasos            CrearPasoDto · 20/min
PATCH  /api/rutas-desarrollo/:rutaId/pasos/:pasoId/completar    · 30/min
PATCH  /api/rutas-desarrollo/:rutaId/pasos/:pasoId/descompletar · 30/min
```

---

## 2. 📥 Insumos y datos de entrada

### Colecciones de Firestore leídas

| Colección | Uso en el flujo de rutas |
|---|---|
| `perfilesExtendidos` | **Principal.** `where('usuarioId','==',uid).limit(1)` → `tiposDiscapacidad` (string JSON), `etapaVida`, `metasActuales`, `areasInteres`, `escalasVida` (8 subescalas), `nivelApoyo`, `viabilidadEconomica`. También escaneado (límite 50) en `buscarPerfilesSimilares`. |
| `perfiles` | `doc(usuarioId)` → `ciudad`, `estado` (localización de entidades) y datos de sesión (`rol`, `activo`). |
| `rutasExpertos` | Plantilla experta por tipo de discapacidad (`doc('habla'|'tea'|…)` → `nombre`, `descripcion`, `areaInteres`, `pasos[]`). |
| `rutasDesarrollo` | Verificación de ruta activa, listado, progreso, candidatas "completadas" de perfiles similares. |
| `pasosRuta` | Pasos de cada ruta (lectura y escritura), pasos exitosos de similares (`completado == true`). |
| `instituciones` | `activa == true` + `ciudad ==` + match de discapacidad, excluye `tipo == 'empresa'`. Top 5. |
| `vacantes` | `activa == true`, match parcial de ciudad + discapacidad. Top 5. |
| `_analytics` (escritura) | Eventos `ruta_generada` y `paso_completado` (fire-and-forget). |

> ❌ **No se lee `borradoresOnboarding`** ni colecciones de salud/terapias: los módulos de rutas parten del perfil ya consolidado en `perfilesExtendidos` (el onboarding es quien promueve el borrador). `historialTerapia`/`tieneDiagnostico` existen en el perfil pero **no** se inyectan en el prompt.

### DTO de entrada del endpoint de generación

```ts
@Post('generar-personalizada')
@Throttle(throttlePorEntorno(3, 30, 60000)) // 3/min prod · 30/min dev
@HttpCode(201)
async generarRutaPersonalizada(@CurrentUser() user: CurrentUserPayload) {
  return this.svc.generarRutaPersonalizada(user.id)
}
```

**No recibe body.** Solo el `usuarioId` del JWT. Toda la personalización sale de Firestore.

Para creación manual, `CrearRutaDto`:

```ts
areaInteres!: string                      // requerido
nombre!: string                           // requerido, ≤200, sanitizeHtml
descripcion?: string                      // ≤2000
metaFinal?: string                        // ≤1000
prioridad?: 'baja' | 'media' | 'alta'
fechaLimite?: string                      // ISO 8601
```

---

## 3. ⚙️ Lógica del algoritmo y proceso de generación

### 3.1 Flujo de `generarRutaPersonalizada(usuarioId)`

```
1. Paralelo: perfilesExtendidos (limit 1) + perfiles doc(uid)
2. ¿Ruta activa?  where(usuarioId==, estado=='activa')  ── sí ──► retornar obtenerRuta()
3. parsearTiposDiscapacidad(perfil.tiposDiscapacidad)
4. KnowledgeBase.obtenerRutaExperta(tipos)      → "Día Cero"
5. KnowledgeBase.buscarPerfilesSimilares()      → "Fase Evolutiva" (top 5)
6. ¿this.ai && perfil?  ── sí ──► generarPasosConIa()  → origen='ia'
        │ falla → catch + warn → se conserva plantilla experta
7. ≥2 perfiles similares → mejorarPasosConComunidad(pasos)
8. Crear doc en rutasDesarrollo (estado 'activa', prioridad 'alta', origen, perfilesSimilaresUsados)
9. Crear docs en pasosRuta (loop secuencial) → analytics.registrarGeneracionRuta → return obtenerRuta()
```

**Verificación de ruta activa existente (idempotencia):**

```ts
const rutasExistentes = await this.col(COLECCIONES.rutasDesarrollo)
  .where('usuarioId', '==', usuarioId)
  .where('estado', '==', 'activa')
  .get()

if (!rutasExistentes.empty) {
  return this.obtenerRuta(usuarioId, rutasExistentes.docs[0].id)  // no llama a la IA
}
```

(E2E lo confirma: la segunda llamada devuelve el **mismo id** que la primera.)

**Similitud de perfiles** (top 5, candidatos con ≥1 ruta completada):

```ts
const similaridad = tiposComunes / new Set([...tiposUsuario, ...tiposCandidato]).size
// requiere discapacidad en común Y etapaVida compatible ('desconocida' es wildcard)
// se descarta el propio usuario; se recolectan títulos de pasos completados
```

### 3.2 Construcción del prompt a Gemini

Se arma como **array de líneas** (9 bloques de instrucciones duras):

```ts
const prompt = [
  'Eres un Comité Médico y Pedagógico Experto en rutas de desarrollo para personas con discapacidad en México.',
  '2. BASE OBLIGATORIA EN GUÍAS OFICIALES: CENETEC (México) + OMS + protocolos estandarizados.',
  '3. PROHIBICIÓN EXPLÍCITA DE ALUCINACIONES (no inventar pasos/terapias, no diagnosticar).',
  '4. ORDEN MÉDICO OBLIGATORIO: evaluación → intervención terapéutica → integración social/educativa/laboral.',
  '5. MÍNIMO 5 PASOS, MÁXIMO 7 PASOS.',
  '6. CADA PASO: título ≤100, descripción ≤200, categoría ∈ {habla, motricidad, visual, auditiva, tea, cognitiva, educacion, laboral, social, general}',
  '7. CONTEXTO MÉXICO.',
  '8. RESPUESTA OBLIGATORIA SOLO JSON: {"pasos":[{"titulo","descripcion","categoria"}]}',
  '9. PROHIBIDO: diagnósticos, fármacos, intervención antes de evaluación.',
  // ── contexto del usuario ──
  '- Discapacidades: ' + discapacidades,
  '- Etapa de vida: ' + '(perfil.etapaVida ?? "no especificada")',   // ⚠️ ver hallazgo
  '- Metas actuales: ' + metas,
  '- Áreas de interés: ' + areas,
  '- Escalas de vida: ' + escalasVida,
  // ...
]

const result = await this.ai.models.generateContent({
  model: this.modelName,                       // gemini-3.1-flash-lite
  contents: prompt,
  config: {
    maxOutputTokens: 2048,
    responseMimeType: 'application/json',
    thinkingConfig: { thinkingLevel: 'MINIMAL' }, // evita que el thinking dinámico trunque el JSON
  },
})
```

**Post-proceso:** `extractText()` (lee `candidates[0].content.parts[].text`) → `parseJsonResponse()` (recorta fences ```` ```json ````) → filtra objetos con `titulo`/`descripcion` string → `.slice(0,7)` → normaliza (`titulo≤200`, `descripcion≤500`, `categoria` default `'general'`, `orden = i+1`). Si 0 pasos válidos → `throw`.

### 3.3 Mecanismos de fallback / degradación suave

| Capa | Comportamiento |
|---|---|
| **Sin credenciales/GCP** (`GEMINI_PROJECT_ID` ausente) | `this.ai = null` + `logger.warn` → la generación usa **plantillas expertas**; endpoint sigue respondiendo 201. |
| **Constructor falla** | `try/catch` en `initializeAi()` → `ai = null`. |
| **Gemini lanza error / JSON vacío / 0 pasos** | `catch` en el paso 6 → warn y se conserva `pasosBase` (experto o comunidad). |
| **`rutasExpertos` no existe o Firestore falla** | `KnowledgeBaseService` → plantillas hardcodeadas `RUTAS_EXPERTAS_POR_DISCAPACIDAD` (`habla`, `motricidad`, `visual`, `auditiva`, `tea`, `cognitiva`) → `RUTA_GENERICA`. |
| **`buscarPerfilesSimilares` falla** | `catch` → `[]` (no enriquece, no rompe). |
| **Instituciones/vacantes fallan o no hay ciudad** | `catch`/`!ciudad` → `[]`. |
| **Comunidad insuficiente** | Enriquecer solo con `perfilesSimilares.length >= 2`; si no, se pasan los pasos base tal cual. |
| **Analytics** | `fire-and-forget` (`.catch(()=>{})`) + `try/catch` interno → nunca 5xx. |
| **Rate limit IA** | `CustomThrottlerGuard` reconoce `generarRutaPersonalizada` → 429 con `MENSAJE_429_IA` y `ttl`. |

**Orden de precedencia de los pasos:** `IA (origen='ia')` → si falla → `plantilla experta (origen='experto')`, y si hay ≥2 similares se anota encima (`origen='comunidad'` cuando no hubo IA).

---

## 4. 📤 Estructura de salida

### Respuesta de `POST /generar-personalizada` ( = `obtenerRuta()` )

```json
{
  "id": "abc123",
  "usuarioId": "uid-rutas",
  "areaInteres": "terapia",
  "nombre": "Desarrollo de Comunicación y Habla",
  "descripcion": "Ruta progresiva para fortalecer habilidades de comunicación…",
  "metaFinal": "Completar todos los pasos de la ruta de desarrollo",
  "estado": "activa",
  "prioridad": "alta",
  "totalPasos": 6,
  "pasosCompletados": 0,
  "porcentajeProgreso": 0,
  "fechaLimite": null,
  "fechaCreacion": "2026-10-15T12:00:00.000Z",
  "fechaActualizacion": "2026-10-15T12:00:00.000Z",
  "origen": "ia",
  "perfilesSimilaresUsados": ["uid-9", "uid-4"],
  "pasos": [
    {
      "id": "p1", "rutaId": "abc123",
      "titulo": "Evaluación inicial del habla",
      "descripcion": "Programar evaluación con un especialista…",
      "orden": 1, "completado": false, "fechaCompletado": null,
      "fechaCreacion": "2026-10-15T12:00:00.000Z"
    }
  ]
}
```

### Persistencia en Firestore

**`rutasDesarrollo/{id}`** (campos extra de la generación automática: `origen`, `perfilesSimilaresUsados`):

```jsonc
{
  "id": "abc123", "usuarioId": "uid",
  "areaInteres": "terapia", "nombre": "…", "descripcion": "…", "metaFinal": "…",
  "estado": "activa",              // activa | completada | pausada | cancelada
  "prioridad": "alta",             // alta → media → baja (orden de listado)
  "totalPasos": 6, "pasosCompletados": 0, "porcentajeProgreso": 0,
  "fechaLimite": null, "fechaCreacion": "…ISO…", "fechaActualizacion": "…ISO…",
  "origen": "ia",                  // ia | experto | comunidad
  "perfilesSimilaresUsados": ["uid-9", "uid-4"]
}
```

**`pasosRuta/{id}`** (uno por paso, `set()` secuencial en el paso 9):

```jsonc
{
  "id": "p1", "rutaId": "abc123",
  "titulo": "…", "descripcion": "…",
  "orden": 1,
  "completado": false,
  "fechaCompletado": null,
  "fechaCreacion": "…ISO…"
  // ⚠️ no se persiste `categoria` (ver hallazgos)
}
```

**Progreso:** al completar un paso se recalcula `porcentajeProgreso = round(completados/total*100)`; al llegar a 100 → `estado: 'completada'`; descompletar vuelve a `'activa'`.

**`GET /mi-ruta`** devuelve además:

```json
{
  "ruta": { "…": "…" },
  "pasos": [],
  "pasoActual": { "orden": 1 },
  "entidadesLocales": { "instituciones": [], "vacantes": [] },
  "origen": "ia",
  "perfilesSimilaresUsados": ["uid-9"]
}
```

y si no hay ruta activa: `{ "ruta": null, "pasos": [], "entidadesLocales": {…}, "mensaje": "No tienes una ruta activa…" }` (HTTP 200, no 404).

---

## 5. 🔗 Integración con otras secciones

- **Empleo / vacantes:** `GET /mi-ruta` solo llama `knowledgeBase.obtenerVacantesRelevantes(ciudad, tipos)` cuando `pasoActual?.categoria === 'laboral'`; lee la colección `vacantes` (activas, match de ciudad/discapacidad, top 5).
- **Instituciones:** `obtenerInstitucionesCercanas()` lee `instituciones` activas de la ciudad del usuario, filtra `tipo !== 'empresa'` y por `tiposDiscapacidad`, top 5 → `entidadesLocales.instituciones`.
- **Comunidad ("Fase Evolutiva"):** cruza `perfilesExtendidos` con rutas `completada` de otros usuarios; si ≥2 similares, `mejorarPasosConComunidad()` marca los pasos populares (umbral 40%) con *"(recomendado por la comunidad)"* y guarda `perfilesSimilaresUsados` en la ruta.
- **Analytics / admin:** `ruta_generada` y `paso_completado` → colección `_analytics` → `GET /rutas-desarrollo/analytics` (`RolesGuard` + `@Roles('admin')`) → `ResumenAnalytics` (`tasaCompletado`, `porDiscapacidad`, `pasosMasSaltados`, `tiempoPromedioDias`).
- **Onboarding:** el módulo no consulta `borradoresOnboarding`; consume el perfil consolidado. En `onboarding.service.ts` la etapa 3 (`caminos`, `oportunidades`, `comunidad`) sigue marcada como pendiente: el progreso de onboarding aún no se enlaza con este módulo.
- **Módulo AI:** solo comparte env vars, modelo y el mensaje 429 de IA (`HANDLERS_IA`); no se invoca entre sí.
- **Auth/propietario:** cada operación valida `ruta.usuarioId !== usuarioId` → `403`; pasos validan `paso.rutaId === rutaId` → `400`.

---

## 🐛 Hallazgos detectados durante la inspección

1. **Prompt con interpolación rota (4 líneas):** en `generarPasosConIa` se usan comillas simples en lugar de template literals, así que el modelo recibe el **texto literal** del código:
   ```ts
   '- Etapa de vida: ' + '(perfil.etapaVida ?? "no especificada")',
   '- Ciudad: ' + '(registro?.ciudad ?? "no especificada") + ", " + (registro?.estado ?? "")',
   '- Nivel de apoyo: ' + '(perfil.nivelApoyo ?? "no especificado")',
   '- Viabilidad económica: ' + '(perfil.viabilidadEconomica ?? "no especificada")',
   ```
   (`ai.service.ts` sí usa backticks correctamente en su prompt equivalente.)
2. **`categoria` se genera pero no se persiste:** el paso 9 guarda solo `titulo/descripcion/orden`, y `CrearPasoDto` tampoco la tiene → `pasoActual?.categoria === 'laboral'` nunca es true para rutas generadas, por lo que **las vacantes de empleo jamás se devuelven** en `entidadesLocales`.
3. **`recursosLocales` (Fase 2)** está documentado en `PasoRutaDto` pero nunca se inyecta en ningún paso.
4. **`mejorarPasosConComunidad` no reordena** pese al comentario: solo aplica el sufijo "…(recomendado por la comunidad)".
5. **Ejemplo JSON del prompt usa comillas simples** (`{'pasos':[…]}`): si el modelo lo sigue literalmente, `JSON.parse` fallaría y se caería al fallback experto (`responseMimeType: 'application/json'` mitiga el riesgo).
6. **Escritura de pasos en loop secuencial** (9 `await`) en lugar de `batch()` — a 7 pasos es menor, pero inconsistente con `eliminarRuta` que sí usa batch.
