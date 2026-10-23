# Moderación Automática de Publicaciones (Frontend)

> **Base URL:** `http://localhost:7000/api` (todas las rutas bajo el prefijo `/api`)
> **Swagger vivo:** `http://localhost:7000/docs`
> Guía de implementación del sistema de moderación de la comunidad: qué cambió en los endpoints existentes, cuáles son nuevos, cómo funciona y qué reglas sigue.

---

## 1. Cómo funciona (resumen)

Toda publicación (creación **y** edición) pasa por una **revisión automática antes de ser visible en el feed**:

1. El backend envía el contenido a **Gemini** con el prompt de moderación de Raíces (o usa un motor de **reglas de respaldo** si la IA no está configurada o falla — nunca se bloquea la app).
2. La revisión devuelve: `aprobado`, `categoria`, `razon`, `sugerenciaMejora` y `fuente` (`gemini` | `reglas` | `admin`).
3. El resultado se guarda en la publicación como:
   - `estado: 'aprobada'` → **visible** en `/comunidad/publicaciones`, `/comunidad/feed-mixto`, `/comunidad/conectemos/publicaciones` y `/comunidad/galeria`.
   - `estado: 'rechazada'` → **oculta del feed**, guardada en la colección para revisión manual del admin.
4. El **POST/PUT siempre devuelve 201/200** (no hay 4xx por contenido rechazado). El frontend debe leer `estado` y, si es `rechazada`, mostrar `moderacion.razon` y `moderacion.sugerenciaMejora` al usuario.
5. El admin resuelve las publicaciones rechazadas desde el panel; al hacerlo, el autor recibe una **notificación in-app**.

### Ciclo de vida de una publicación

```
creada ──► moderación automática ──┬── estado: 'aprobada'  ──► visible en el feed
                                   │
                                   └── estado: 'rechazada' ──► oculta + en cola del admin
                                                                  │
                                    admin: aprobar ───────────────┼──► estado: 'aprobada' (visible)
                                    admin: rechazar ──────────────┴──► permanece 'rechazada' (oculta, fuera de la cola)
```

---

## 2. Reglas que sigue la moderación

### 2.1 Criterios (aprobados = true)

- Experiencias personales, logros o testimonios sobre el proceso de inclusión (educativo, laboral, social, clínico).
- Consultas o dudas respetuosas sobre trámites (CEDis, becas, DIF), servicios, escuelas (CAM/USAER) o salud.
- Recursos útiles, guías, eventos inclusivos, talleres o vacantes laborales adaptadas.
- Mensajes de apoyo, concientización, comunidad y acompañamiento positivo.

### 2.2 Causas de rechazo (aprobado = false) y su `categoria`

| `categoria` | Causa |
|---|---|
| `spam` | Spam o irrelevante: memes fuera de contexto, cadenas, mensajes repetitivos, publicidad engañosa, productos milagro, esquemas piramidales, ventas ajenas a la inclusión. |
| `lenguaje_inapropiado` | Lenguaje de odio, discriminación, capacitismo, burla, agresión verbal o contenido violento/explicito. |
| `desinformacion` | Tratamientos médicos peligrosos no científicos, remedios milagro, asesoría legal falsa. |
| `datos_sensibles` | Números de tarjeta, contraseñas o datos personales sensibles expuestos. |

Categorías de aprobación: `comunidad`, `duda_tramite`, `logro_personal`, `recurso_util` (se conserva la categoría que el usuario eligió, `categoriaCreativa`, cuando es válida).

### 2.3 Motor de reglas de respaldo (`fuente: 'reglas'`)

Si Gemini no está disponible, el backend decide con patrones de código (en este orden, gana el primero):

1. **datos_sensibles**: números de 16 dígitos (tarjetas), `cvv/cvc`, `contraseña:`/`password:`/`pin:` con valor.
2. **lenguaje_inapropiado**: insultos y capacitismo (pendejo, idiota, imbécil, estúpido, "no deberían salir", "lastima... discapacitad*"...).
3. **desinformacion**: "cura/sanar + discapacidad/autismo/parálisis", "remedio/medicina/tratamiento milagro", "vacuna causa autismo".
4. **spam**: cadenas ("comparte/reenvía a 10 personas"), "gana dinero fácil", esquemas piramidales, texto de relleno repetitivo o solo MAYÚSCULAS.
5. Si nada coincide → **aprueba** (el fallback nunca bloquea contenido legítimo por error).

> ⚠️ **Fail-open:** si el servicio de moderación fallara de forma inesperada, la publicación se guarda como `aprobada` para no bloquear a la comunidad. El frontend no necesita manejar este caso (es idéntico a un aprobado normal).

### 2.4 Revisión manual del admin

- La cola de revisión son las publicaciones con `estado: 'rechazada'` **sin** `resueltaPor`.
- Decisión `aprobar`: `estado → 'aprobada'` (vuelve a ser visible) y sale de la cola.
- Decisión `rechazar`: se confirma, permanece oculta (`estado: 'rechazada'`) y sale de la cola.
- La decisión se guarda con `moderacion.fuente: 'admin'` (conserva la `categoria` previa; la `nota` del admin queda como `razon`) más `resueltaPor` y `fechaResolucion`, y se registra en auditoría (`accion: 'moderar_publicacion'`).

---

## 3. Endpoints modificados

### 3.1 `POST /api/comunidad/publicaciones` 🌐🔒 + feature `comunidad`

Body igual que siempre: `{ contenido (req ≤5000), grupoId?, mediaUrl?, categoriaCreativa?, exclusivoPadres? }`. Rate limit 5/min.

**Nuevo en la respuesta (201):** `estado` y `moderacion`.

```json
{
  "id": "pub-uid",
  "autorId": "user-uid",
  "contenido": "¿Alguien sabe qué documentos piden en el CEDis?",
  "estado": "aprobada",
  "moderacion": {
    "categoria": "duda_tramite",
    "razon": "La publicación cumple las normas de la comunidad.",
    "sugerenciaMejora": null,
    "fuente": "gemini",
    "fecha": "2026-10-22T12:00:00.000Z"
  },
  "cantidadMeGustas": 0,
  "fechaCreacion": "2026-10-22T12:00:00.000Z"
}
```

Ejemplo de **rechazo** (la publicación sí se crea, pero queda oculta; muestra la razón y la sugerencia al usuario):

```json
{
  "id": "pub-uid",
  "estado": "rechazada",
  "moderacion": {
    "categoria": "spam",
    "razon": "Tu publicación parece spam, una cadena o contenido sin valor para la comunidad.",
    "sugerenciaMejora": "Comparte algo útil para la comunidad: una experiencia, una duda o un recurso sobre inclusión.",
    "fuente": "gemini",
    "fecha": "2026-10-22T12:00:00.000Z"
  }
}
```

> 💡 **UI sugerida:** si `estado === 'rechazada'`, mostrar un toast/panel con `moderacion.razon` y, si existe, `moderacion.sugerenciaMejora` (ya viene redactada en **Lectura Fácil** para que el usuario pueda corregir su publicación).

### 3.2 `PUT /api/comunidad/publicaciones/:id` 🔒 solo autor + feature `comunidad`

Igual que antes (`{ contenido, mediaUrl? }`), pero **el contenido editado se vuelve a moderar**: la respuesta incluye `estado` y `moderacion` igual que el POST. Una edición puede regresar una publicación visible a `rechazada`.

### 3.3 Feeds (sin cambios de request)

`GET /comunidad/publicaciones`, `GET /comunidad/feed-mixto`, `GET /comunidad/conectemos/publicaciones` y `GET /comunidad/galeria` **excluyen las `rechazada`**: el frontend no debe filtrar nada. Las publicaciones antiguas sin campo `estado` se tratan como `aprobada`.

---

## 4. Endpoints nuevos (admin)

Ambos en `/api/administracion`, **solo rol `admin`** (403 para el resto).

### 4.1 `GET /api/administracion/publicaciones-rechazadas`

Cola de revisión: publicaciones rechazadas **pendientes** de decisión (sin `resueltaPor`), más recientes primero.

- Query: `pagina` (default 1), `limite` (default 20) → paginación estándar `{ datos, total, pagina, limite, totalPaginas }`.

Item de `datos`:

```json
{
  "id": "pub-uid",
  "autorId": "user-uid",
  "contenido": "Comparte esta cadena a 10 amigos...",
  "grupoId": null,
  "mediaUrl": null,
  "categoriaCreativa": null,
  "estado": "rechazada",
  "fechaCreacion": "2026-10-22T11:00:00.000Z",
  "moderacion": {
    "categoria": "spam",
    "razon": "Tu publicación parece spam, una cadena o contenido sin valor para la comunidad.",
    "sugerenciaMejora": "Comparte algo útil para la comunidad.",
    "fuente": "gemini",
    "fecha": "2026-10-22T11:00:00.000Z"
  },
  "nombreAutor": "María López",
  "emailAutor": "maria@correo.mx",
  "rolAutor": "pcd"
}
```

### 4.2 `PATCH /api/administracion/publicaciones/:id/moderacion`

Resuelve una publicación de la cola.

- Body: `{ decision: 'aprobar' | 'rechazar' (req), nota?: string (≤500) }`
- Rate limit 20/min. Auditoría: `accion: 'moderar_publicacion'`, `recurso: 'publicacion'`.
- `404` si la publicación no existe · `400` si no está pendiente de revisión (ya resuelta o no rechazada).

```json
// PATCH body
{ "decision": "aprobar", "nota": "El contenido es pertinente a pesar del falso positivo." }
```

```json
// 200 respuesta
{
  "id": "pub-uid",
  "estado": "aprobada",
  "moderacion": {
    "categoria": "spam",
    "razon": "El contenido es pertinente a pesar del falso positivo.",
    "sugerenciaMejora": null,
    "fuente": "admin",
    "fecha": "2026-10-22T12:30:00.000Z"
  },
  "resueltaPor": "admin-uid",
  "fechaResolucion": "2026-10-22T12:30:00.000Z"
}
```

> Al aprobar, la publicación **vuelve a aparecer** en los feeds en el siguiente request (no hace falta nada más en el frontend).

---

## 5. Notificación al autor (existente, nuevos tipos)

Cuando el admin resuelve una publicación, el autor recibe una notificación in-app (`GET /api/notificaciones` y el flujo SSE `/api/notificaciones/flujo`):

| `tipo` | `titulo` | `cuerpo` | `referenciaId` |
|---|---|---|---|
| `publicacion_aprobada` | `¡Tu publicación fue aprobada!` | "Tu publicación ya es visible en la comunidad." (+ nota del admin si la hubo) | id de la publicación |
| `publicacion_rechazada` | `Tu publicación fue rechazada` | "Tu publicación no será visible en la comunidad." + motivo (nota del admin o la razón de la revisión automática) | id de la publicación |

---

## 6. Checklist de implementación frontend

- [ ] Al crear/editar publicación, leer `estado` y `moderacion` de la respuesta.
- [ ] Si `estado === 'rechazada'`: mostrar `moderacion.razon` + `moderacion.sugerenciaMejora` (Lectura Fácil) y no asumir que aparecerá en el feed.
- [ ] Los feeds no requieren cambios (el backend ya excluye las rechazadas).
- [ ] Panel admin: `GET /administracion/publicaciones-rechazadas` con paginación y acciones `aprobar` / `rechazar` (`PATCH /administracion/publicaciones/:id/moderacion`), mostrando el detalle de `moderacion` y los datos del autor.
- [ ] Campana/notificaciones: manejar los tipos `publicacion_aprobada` y `publicacion_rechazada` (enlazar con `referenciaId`).
- [ ] Campos disponibles para UI: `categoria` para chips/etiquetas, `fuente` (`gemini`/`reglas`/`admin`) para un sello de "revisión automática" vs "decisión del equipo".
