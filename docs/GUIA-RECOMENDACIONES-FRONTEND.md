# 📡 Guía Frontend — Recomendaciones y Descubrimiento

> **Última actualización:** 26 de agosto de 2026
> **Base URL:** `https://raices-backend-jftu6lrbda-uc.a.run.app/api`
> **Swagger:** `https://raices-backend-jftu6lrbda-uc.a.run.app/docs`

---

## 📋 Índice

1. [Resumen de Endpoints](#-resumen-de-endpoints)
2. [Registrar Interacción](#1-post-apiusuariosinteracciones)
3. [Pesos de Comportamiento](#2-get-apiusuariosinteraccionespesos)
4. [Recomendaciones Personalizadas](#3-get-apiusuariosrecomendaciones)
5. [Descubrimiento con Filtros](#4-get-apidescubrimiento)
6. [Tipos TypeScript](#tipos-typescript)
7. [Cálculo de Scores](#-cálculo-de-scores)

---

## 📌 Resumen de Endpoints

| # | Método | Ruta | Auth | Descripción |
|---|--------|------|------|-------------|
| 1 | `POST` | `/api/usuarios/interacciones` | ✅ Bearer JWT | Registrar interacción (guardar, ver detalle, click) |
| 2 | `GET` | `/api/usuarios/interacciones/pesos` | ✅ Bearer JWT | Pesos acumulados por categoría (últimos 30 días) |
| 3 | `GET` | `/api/usuarios/recomendaciones` | ✅ Bearer JWT | Recomendaciones personalizadas con scoring |
| 4 | `GET` | `/api/descubrimiento` | ✅ Bearer JWT | Búsqueda inteligente de instituciones (con `?categorias=...`) |

> **Todos los endpoints** requieren el header `Authorization: Bearer <token>`.

---

## 1. `POST /api/usuarios/interacciones`

Registra un evento de comportamiento del usuario con una institución. Se usa para calcular los pesos de recomendación por categoría.

### Request

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `institucionId` | `string` | ✅ | ID de la institución |
| `tipo` | `string` | ✅ | Tipo de interacción: `"guardar"` · `"ver_detalle"` · `"click_card"` |
| `categoria` | `string` | ❌ | Categoría de la institución: `"funcional"` · `"educativo"` · `"laboral"` · `"social"` |

### Payload de Ejemplo

```json
{
  "institucionId": "inst-abc123",
  "tipo": "ver_detalle",
  "categoria": "laboral"
}
```

### Respuesta 201 — Éxito

```json
{
  "exito": true,
  "id": "inter-xyz789",
  "mensaje": "Interacción registrada"
}
```

### Respuesta 400 — Datos inválidos

```json
{
  "statusCode": 400,
  "message": ["tipo must be one of the following values: guardar, ver_detalle, click_card"],
  "error": "Bad Request"
}
```

### Respuesta 401 — Sin token

```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### cURL

```bash
curl -X POST https://raices-backend-jftu6lrbda-uc.a.run.app/api/usuarios/interacciones \
  -H "Authorization: Bearer <TU_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "institucionId": "inst-abc123",
    "tipo": "ver_detalle",
    "categoria": "laboral"
  }'
```

---

## 2. `GET /api/usuarios/interacciones/pesos`

Devuelve los puntos acumulados por categoría de las interacciones de los últimos 30 días. Se usa para ponderar las recomendaciones.

### Pesos por tipo de interacción

| Tipo | Puntos |
|------|--------|
| `guardar` | 10 |
| `ver_detalle` | 5 |
| `click_card` | 2 |

### Request

Sin parámetros. El usuario se extrae del JWT.

### Respuesta 200

```json
{
  "pesos": {
    "laboral": 15,
    "social": 5,
    "educativo": 0,
    "funcional": 0
  }
}
```

### Respuesta 401 — Sin token

```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### cURL

```bash
curl https://raices-backend-jftu6lrbda-uc.a.run.app/api/usuarios/interacciones/pesos \
  -H "Authorization: Bearer <TU_TOKEN>"
```

---

## 3. `GET /api/usuarios/recomendaciones`

Devuelve instituciones activas ordenadas por un `final_score` que combina:
- **60%** coincidencia con intereses/metas del perfil extendido
- **40%** peso de comportamiento (interacciones de los últimos 30 días)

### Query Params

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `pagina` | `number` | `1` | Número de página (empieza en 1) |
| `limite` | `number` | `20` | Elementos por página (máximo 50) |

### Respuesta 200

```json
{
  "datos": [
    {
      "id": "inst-abc123",
      "nombre": "Centro de Empleo Inclusivo",
      "categoria": "laboral",
      "ciudad": "Mérida",
      "urlLogo": "https://...",
      "score_intereses": 0.8,
      "score_comportamiento": 0.6,
      "final_score": 0.72
    },
    {
      "id": "inst-xyz789",
      "nombre": "Centro Social Comunitario",
      "categoria": "social",
      "ciudad": "Valladolid",
      "urlLogo": null,
      "score_intereses": 0.2,
      "score_comportamiento": 0.4,
      "final_score": 0.28
    }
  ],
  "paginacion": {
    "total": 2,
    "pagina": 1,
    "limite": 20,
    "totalPaginas": 1
  }
}
```

### Respuesta 200 — Página 2

```json
{
  "datos": [],
  "paginacion": {
    "total": 2,
    "pagina": 2,
    "limite": 1,
    "totalPaginas": 2
  }
}
```

### Respuesta 401 — Sin token

```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### cURL

```bash
# Primera página (default: 20 resultados)
curl https://raices-backend-jftu6lrbda-uc.a.run.app/api/usuarios/recomendaciones \
  -H "Authorization: Bearer <TU_TOKEN>"

# Página 1 con 5 resultados por página
curl "https://raices-backend-jftu6lrbda-uc.a.run.app/api/usuarios/recomendaciones?pagina=1&limite=5" \
  -H "Authorization: Bearer <TU_TOKEN>"
```

---

## 4. `GET /api/descubrimiento`

Búsqueda inteligente de instituciones. Filtra por el perfil del usuario y permite priorizar categorías con el query param `categorias`.

### Query Params

| Param | Tipo | Descripción |
|-------|------|-------------|
| `categorias` | `string` | Categorías prioritarias separadas por coma. Ej: `"laboral,social"`. Las coincidentes aparecen primero **respetando el orden del array**. |
| `categoria` | `string` | Filtrar por una sola categoría exacta. |
| `ciudad` | `string` | Filtrar por ciudad (búsqueda parcial, case-insensitive). |
| `busqueda` | `string` | Buscar por nombre (parcial, case-insensitive). |
| `tipoDiscapacidad` | `string` | Filtrar por tipo de discapacidad soportado. |

### Respuesta 200

```json
[
  {
    "id": "inst-social",
    "nombre": "Centro Social Comunitario",
    "categoria": "social",
    "ciudad": "Valladolid",
    "descripcion": "Centro comunitario de integración",
    "activa": true,
    "verificada": true,
    "tiposDiscapacidad": ["motriz", "visual"],
    "coincidePerfil": true
  },
  {
    "id": "inst-laboral",
    "nombre": "Centro de Empleo Inclusivo",
    "categoria": "laboral",
    "ciudad": "Mérida",
    "descripcion": "Empleo y tecnología inclusiva",
    "activa": true,
    "verificada": true,
    "tiposDiscapacidad": ["tea", "intelectual"],
    "coincidePerfil": false
  }
]
```

> **Nota sobre `categorias`:** El orden de los IDs en la respuesta respeta el orden
> del query param. Si `?categorias=social,laboral`, las instituciones de categoría
> `"social"` aparecen antes que las de `"laboral"`.

### Respuesta 401 — Sin token

```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### cURL

```bash
# Búsqueda con prioridad por categorías
curl "https://raices-backend-jftu6lrbda-uc.a.run.app/api/descubrimiento?categorias=social,laboral" \
  -H "Authorization: Bearer <TU_TOKEN>"

# Filtro por ciudad y categoría
curl "https://raices-backend-jftu6lrbda-uc.a.run.app/api/descubrimiento?ciudad=merida&categoria=laboral" \
  -H "Authorization: Bearer <TU_TOKEN>"

# Búsqueda por texto
curl "https://raices-backend-jftu6lrbda-uc.a.run.app/api/descubrimiento?busqueda=empleo" \
  -H "Authorization: Bearer <TU_TOKEN>"
```

---

## Tipos TypeScript

```typescript
// ── Interacción ────────────────────────────────────────────────────

type TipoInteraccion = 'guardar' | 'ver_detalle' | 'click_card'
type CategoriaInstitucion = 'funcional' | 'educativo' | 'laboral' | 'social'

interface RegistrarInteraccionPayload {
  institucionId: string
  tipo: TipoInteraccion
  categoria?: CategoriaInstitucion
}

interface InteraccionRegistradaResponse {
  exito: boolean
  id: string
  mensaje: string
}

// ── Pesos ──────────────────────────────────────────────────────────

interface PesosResponse {
  pesos: Record<CategoriaInstitucion, number>
}

// ── Recomendaciones ────────────────────────────────────────────────

interface RecomendacionesQuery {
  pagina?: number   // default: 1
  limite?: number   // default: 20, max: 50
}

interface InstitucionRecomendada {
  id: string
  nombre?: string
  categoria?: string
  ciudad?: string
  urlLogo?: string | null
  score_intereses: number      // 0 a 1
  score_comportamiento: number // 0 a 1
  final_score: number          // 0 a 1
}

interface RecomendacionesResponse {
  datos: InstitucionRecomendada[]
  paginacion: {
    total: number
    pagina: number
    limite: number
    totalPaginas: number
  }
}

// ── Descubrimiento ─────────────────────────────────────────────────

interface DiscoveryFilters {
  categorias?: string   // "laboral,social"
  categoria?: string    // "laboral"
  ciudad?: string
  busqueda?: string
  tipoDiscapacidad?: string
}

interface InstitucionDescubierta {
  id: string
  nombre?: string
  categoria?: string
  ciudad?: string
  descripcion?: string
  activa?: boolean
  verificada?: boolean
  tiposDiscapacidad: string[]
  coincidePerfil: boolean
}
```

---

## 📐 Cálculo de Scores

El `final_score` de cada institución se calcula así:

```
final_score = score_intereses × 0.6 + score_comportamiento × 0.4
```

- **`score_intereses`** (60%): Coincidencia entre los tokens de `metasActuales` + `areasInteres` del perfil extendido y el texto de la institución (nombre, descripción, categoría, servicios). Se normaliza entre 0 y 1.

- **`score_comportamiento`** (40%): Peso acumulado de la categoría de la institución en los últimos 30 días, normalizado entre 0 y 1 dividiendo entre el peso máximo de cualquier categoría.

### Ejemplo

```
Perfil: metasActuales = ["empleo"], areasInteres = ["tecnología"]
Institución: "Centro de Empleo Inclusivo" → categoría "laboral"
  → score_intereses = 1.0 (coincide "empleo")
  → score_comportamiento = 0.75 (peso laboral=15, max peso=20)
  → final_score = 1.0 × 0.6 + 0.75 × 0.4 = 0.9
```

---

## 💡 Ejemplo de Integración (React)

```typescript
// src/services/recommendations.service.ts

const API_URL = 'https://raices-backend-jftu6lrbda-uc.a.run.app/api'

async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `Error ${res.status}`)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

// Registrar interacción
export async function registrarInteraccion(
  institucionId: string,
  tipo: 'guardar' | 'ver_detalle' | 'click_card',
  categoria?: string
) {
  return authFetch('/usuarios/interacciones', {
    method: 'POST',
    body: JSON.stringify({ institucionId, tipo, categoria }),
  })
}

// Obtener pesos de comportamiento
export async function obtenerPesos() {
  return authFetch<{ pesos: Record<string, number> }>('/usuarios/interacciones/pesos')
}

// Obtener recomendaciones personalizadas
export async function obtenerRecomendaciones(pagina = 1, limite = 20) {
  return authFetch(`/usuarios/recomendaciones?pagina=${pagina}&limite=${limite}`)
}

// Descubrir instituciones con prioridad por categorías
export async function descubrirInstituciones(categorias?: string[]) {
  const params = categorias?.length ? `?categorias=${categorias.join(',')}` : ''
  return authFetch(`/descubrimiento${params}`)
}
```
