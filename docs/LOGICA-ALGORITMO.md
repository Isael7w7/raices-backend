# 🧠 Lógica del Algoritmo — Recomendaciones, Descubrimiento y Rutas

> **Última actualización:** 10 de septiembre de 2026
> **Fuente de verdad:** `src/modules/recommendations/recommendations.service.ts`, `src/modules/discovery/discovery.service.ts`, `src/modules/routes/routes.service.ts`

---

## 📋 Índice

1. [Visión general](#-visión-general)
2. [Algoritmo de recomendaciones de instituciones](#1-algoritmo-de-recomendaciones-de-instituciones)
3. [Algoritmo de recomendación de especialistas](#2-algoritmo-de-recomendación-de-especialistas)
4. [Algoritmo de descubrimiento (búsqueda)](#3-algoritmo-de-descubrimiento-búsqueda)
5. [Algoritmo de rutas de desarrollo](#4-algoritmo-de-rutas-de-desarrollo)
6. [Revelación progresiva (onboarding)](#5-revelación-progresiva-onboarding)
7. [Estrategia defensiva (null-safety)](#6-estrategia-defensiva-null-safety)

---

## 🔎 Visión general

El backend maneja **4 piezas de lógica algorítmica**, todas resueltas **en memoria** (sin ML, sin jobs en background):

| # | Módulo | Entrada | Salida | Ordenación |
|---|--------|---------|--------|------------|
| 1 | `recommendations` | Perfil extendido + interacciones (30 días) + instituciones activas | Instituciones con `final_score` | Descendente por score |
| 2 | `recommendations` (especialistas) | Perfil + perfil extendido + especialistas activos | Especialistas con `final_score` | Descendente por score |
| 3 | `discovery` | Filtros de query + perfil extendido | Instituciones con `coincidePerfil` | Relevancia + prioridad de categorías |
| 4 | `routes` | Rutas y pasos del usuario | Porcentaje de progreso | Prioridad + fecha de creación |

---

## 1. Algoritmo de recomendaciones de instituciones

**Endpoint:** `GET /api/usuarios/recomendaciones`
**Servicio:** `RecommendationsService.recomendaciones(usuarioId, pagina, limite)`

### 1.1 Fase 1 — Registro de interacciones

Cada evento de comportamiento del usuario se persiste en la colección `interacciones` vía `POST /api/usuarios/interacciones`. Cada tipo tiene un **peso distinto** según su nivel de intención:

```ts
const PUNTOS_POR_TIPO = {
  guardar: 10,      // intención alta: guardó la institución
  ver_detalle: 5,   // intención media: abrió el detalle
  click_card: 2,    // intención baja: hizo click en la tarjeta
}
```

El documento se guarda con `usuarioId`, `institucionId`, `tipo`, `categoria` (opcional, se usa para agrupar pesos) y `createdAt` como ISO string.

### 1.2 Fase 2 — Pesos de comportamiento (ventana de 30 días)

`RecommendationsService.pesos(usuarioId)` consulta las interacciones de los últimos `VENTANA_DIAS = 30` días y **agrupa en memoria** los puntos acumulados por categoría:

```
pesos[categoria] = Σ puntos de todas las interacciones de esa categoría
```

Ejemplo: si el usuario interactuó 3 veces con instituciones `laboral` (2 ver_detalle + 1 guardar), `pesos = { laboral: 20 }`.

### 1.3 Cálculo del score final

El score final de cada institución es una **mezcla ponderada 60/40** entre perfil declarado y comportamiento observado:

```ts
const PESO_INTERESES = 0.6
const PESO_COMPORTAMIENTO = 0.4

final_score = score_intereses * 0.6 + score_comportamiento * 0.4
```

Ambos scores se redondean a 3 decimales.

#### Score de intereses (0 → 1)

`scoreDeIntereses(metas, areasInteres, escalasVida, institucion)`:

1. **Tokens del perfil:** se combinan `metasActuales` + `areasInteres` del perfil extendido (aceptando array o string JSON), todos en minúsculas.
2. **Tokens de las escalas de vida:** si el usuario no definió metas/áreas, las escalas de la evaluación *"Cómo vives hoy"* con **nivel ≤ 2** (mayor necesidad de apoyo) aportan tokens genéricos (`autonomia`, `movilidad`, etc.). Si todas las escalas están en 0 (usuario nuevo), no aportan nada.
3. **Texto de la institución:** se concatena `nombre` + `descripcion` + `categoria` + `servicios[]` en minúsculas.
4. **Cálculo:**

```
score_intereses = (tokens que aparecen como substring en el texto de la institución) / (total de tokens)
```

- Sin tokens → score 0 (no lanza error).
- Es coincidencia por **substring inclusivo** (no word-boundary): `"arte"` coincide con `"artes"`.

#### Score de comportamiento (0 → 1)

Normalización min-max simple contra el peso máximo del usuario:

```
score_comportamiento = pesos[categoria_de_la_institucion] / maxPeso
```

donde `maxPeso = Math.max(0, ...Object.values(pesos))`. Si no hay interacciones (`maxPeso === 0`), el score es 0 y el orden queda determinado solo por intereses.

### 1.4 Flujo completo

```
1. Promise.all([
     obtenerPerfilExtendido(usuarioId),   // nunca lanza → {} si falla
     pesos(usuarioId),                    // nunca lanza → {} si falla
     obtenerInstitucionesActivas(),       // where('activa' == true); nunca lanza → []
   ])
2. Normalizar perfil: metasActuales, areasInteres, escalasVida (con fallbacks neutros)
3. map → score_intereses, score_comportamiento, final_score
4. sort → final_score descendente
5. Paginación (limite máx. 50, página mín. 1)
```

### 1.5 Datos fuente

| Fuente | Colección | Campos usados |
|--------|-----------|---------------|
| Perfil extendido | `perfilesExtendidos` | `perfilNecesidades`, `metasActuales`, `areasInteres`, `escalasVida` |
| Comportamiento | `interacciones` | `usuarioId`, `tipo`, `categoria`, `createdAt` |
| Instituciones | `instituciones` | `activa`, `nombre`, `descripcion`, `categoria`, `servicios` |

---

## 2. Algoritmo de recomendación de especialistas

**Endpoint:** `GET /api/usuarios/especialistas`
**Servicio:** `RecommendationsService.especialistasRecomendados(usuarioId, pagina, limite)`

### 2.1 Factores y pesos

Sobre cada especialista activo se evalúan 4 factores **aditivos**, y el score se normaliza entre los factores que fue posible evaluar:

| Factor | Peso | Condición |
|--------|------|-----------|
| 1. Tipo de discapacidad | 0.4 | Coincidencia entre `tiposDiscapacidad` del perfil extendido (parseado con `parsearTiposDiscapacidad`) y los del especialista |
| 2. Rango de edad | 0.3 | Edad calculada de `fechaNacimiento` dentro de `[edadMinima, edadMaxima]` del especialista (defaults 0–99) |
| 3. Calificación promedio | 0.2 | Proporcional: `0.2 * (calificacionPromedio / 5)` — siempre evaluable |
| 4. Ubicación / modalidad | 0.1 | Ciudad exacta coincide con la del perfil → 0.1; si no, modalidad `virtual`/`en_linea` → 0.05 (bonus sin restricción geográfica) |

```
final_score = round( (suma de factores obtenidos / suma de factores evaluables) * 1000 ) / 1000
```

**Nota de diseño:** la división entre `totalFactores` permite comparar especialistas aunque al perfil le falten datos (p. ej. sin fecha de nacimiento el factor de edad no se evalúa ni se castiga).

### 2.2 Respuesta

Además del `final_score`, se exponen flags binarios `score_edad` y `score_discapacidad` (1/0) para transparencia en el frontend.

---

## 3. Algoritmo de descubrimiento (búsqueda)

**Endpoint:** `GET /api/descubrimiento`
**Servicio:** `DiscoveryService.discover(usuarioId, filtros)`

### 3.1 Pipeline de ordenación (en memoria)

```
1. Perfil extendido → tiposDiscapacidad del usuario (nunca lanza si no existe)
2. Query Firestore: instituciones where('activa' == true) [+ categoria si viene]
   (sin .orderBy() en Firestore para evitar índices compuestos)
3. Parseo seguro de tiposDiscapacidad por fila
4. sort → calificacionPromedio descendente
5. slice(0, 50)                       ← tope duro de resultados
6. Filtros de texto en memoria:
   - ciudad → substring case-insensitive
   - busqueda → substring sobre nombre
   - tipoDiscapacidad → pertenencia al array
7. map → coincidePerfil (true si alguna discapacidad del usuario está en la institución)
   sort → coincidentes primero (estable)
8. ?categorias=laboral,funcional → estabilidad sort: prioridad por posición en el array
9. Resultado final
```

### 3.2 Reglas clave

- **`coincidePerfil`** es un flag booleano, no un score: marca instituciones compatibles con el perfil de discapacidad del usuario.
- **Orden de prioridad por categorías:** `?categorias=laboral,funcional` hace que las instituciones de esas categorías aparezcan primero **respetando el orden del array**; las demás conservan su orden previo (sort estable usando el índice original como desempate).
- El tope de **50 resultados** se aplica *antes* de los filtros de texto (optimización, puede descartar resultados si el catálogo crece).

---

## 4. Algoritmo de rutas de desarrollo

**Módulo:** `src/modules/routes` · **Colecciones:** `rutasDesarrollo`, `pasosRuta`

### 4.1 Ordenación de listado

`listarRutas` ordena en memoria por:

1. **Prioridad:** `alta` (0) → `media` (1) → `baja` (2)
2. **Desempate:** `fechaCreacion` descendente (comparación lexicográfica de ISO strings)

### 4.2 Progreso de una ruta

Al completar/descompletar un paso se **recalcula en memoria** el progreso de la ruta:

```
porcentajeProgreso = round( (pasosCompletados / totalPasos) * 100 )
```

Transiciones de estado:

| Evento | Estado resultante |
|--------|-------------------|
| Completar paso → porcentaje 100 | `estado = 'completada'` |
| Completar paso → porcentaje < 100 | se conserva el estado previo |
| Descompletar cualquier paso | `estado = 'activa'` (siempre) |

Otros invariantes:

- El `orden` de un paso nuevo es `dto.orden` o `máximo(orden) + 1` calculado en memoria.
- Al eliminar una ruta se borran sus pasos en el mismo **batch** de Firestore.
- Todos los handlers verifican propiedad (`ruta.usuarioId === usuarioId`) antes de operar → `ForbiddenException`.

### 4.3 Resumen agregado

`resumenRutas` calcula en memoria: totales por estado (`activa`, `completada`, `pausada`) y `progresoPromedio = round(Σ porcentajeProgreso / totalRutas)`.

---

## 5. Revelación progresiva (onboarding)

**Endpoint:** `GET /api/usuarios/onboarding`
**Servicio:** `RecommendationsService.verificarOnboarding(usuarioId)`

Calcula el porcentaje de completitud del perfil para desbloquear funcionalidad gradualmente:

| Rol | Campos requeridos |
|-----|-------------------|
| Todos | `nombreCompleto`, `fechaNacimiento`, `curp` |
| `pcd` | + `tiposDiscapacidad`, `tieneDiagnostico`, `certificadoDiscapacidad` (desde `perfilesExtendidos`) |
| `padre_tutor` / `tutor` | + `estadoAcreditacionTutor === 'aprobado'` |

```
porcentaje = round( camposCompletados / (camposCompletados + camposFaltantes) * 100 )
onboardingCompleto = camposFaltantes.length === 0
```

---

## 6. Estrategia defensiva (null-safety)

Todas las lecturas de datos que alimentan los algoritmos siguen el principio **"nunca lanzar por datos faltantes"**:

- **Perfil extendido inexistente / query fallida** → objeto vacío `{}` → scores neutros.
- **Escalas de vida con null/undefined** → normalizadas a `0` (neutro) por `normalizarEscalasVida`; se aceptan strings numéricos.
- **Arrays o JSON strings** → `leerArregloDeTexto` / `leerObjeto` aceptan array nativo o JSON string válido; inválido → `[]` / `{}`.
- **Sin interacciones** → pesos vacíos → `score_comportamiento = 0` para todas las instituciones.
- **Error transitorio de Firestore** (colección vacía, índice compuesto pendiente) → respuesta 200 con estructura vacía, jamás 500.
- **Índices compuestos:** se evita `.orderBy()` en Firestore; toda ordenación/filtrado se hace en memoria.

### Escalas de vida (referencia)

Las 8 escalas de *"Cómo vives hoy"* (1–4, guardadas por `POST /api/usuarios/perfil-necesidades/escalas-vida`): `autonomia`, `independencia`, `comunicacion`, `comprension`, `energia`, `movilidad`, `social`, `emocional`. En el algoritmo de recomendaciones, las escalas con **nivel ≤ 2** se convierten en tokens de interés.

---

## 📚 Referencias cruzadas

- Guía de endpoints para frontend: `docs/GUIA-RECOMENDACIONES-FRONTEND.md`
- Documentación completa del backend: `docs/DOCUMENTACION-COMPLETA-BACKEND.md`
- Tests: `src/modules/recommendations/recommendations.service.spec.ts`, `src/modules/discovery/discovery.service.spec.ts`, `src/modules/routes/routes.service.spec.ts`
