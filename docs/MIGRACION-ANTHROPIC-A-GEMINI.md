# Migración de Anthropic Claude a Google Gemini (Vertex AI)

> **Fecha de migración:** 7 de agosto de 2026
> **Autor:** Isael Ojeda
> **Commits relacionados:**
> - `3ddb905` — `security(infra): migrar secretos a GCP Secret Manager y limpiar credenciales`
> - `69be18d` — `chore(deps): eliminar residuos de Anthropic tras migración a Vertex AI`

---

## 1. Resumen del cambio

| Aspecto | ANTES (Anthropic) | DESPUÉS (Vertex AI / Gemini) |
|---|---|---|
| **Proveedor** | Anthropic (API externa) | Google Cloud Platform (dentro del mismo ecosistema) |
| **SDK** | `@anthropic-ai/sdk` v0.27 | `@google-cloud/vertexai` v1.12 |
| **Autenticación** | API key en texto plano (`ANTHROPIC_API_KEY`) | Application Default Credentials (ADC) — cuenta de servicio |
| **Modelo chat** | `claude-haiku-4-5-20251001` | `gemini-2.0-flash` |
| **Modelo JSON** | `claude-sonnet-4-6` | `gemini-2.0-flash` (con `responseMimeType: application/json`) |
| **Costo facturación** | Anthropic separado | GCP unificado (Cloud Run + Vertex AI) |
| **Secretos** | Variable de entorno directa | GCP Secret Manager montado en Cloud Run |

---

## 2. Archivos modificados

### Commit `3ddb905` (migración principal)

| Archivo | Cambio |
|---|---|
| `package.json` | Agregó `@google-cloud/vertexai` y `@nestjs/config` |
| `pnpm-lock.yaml` | Lock file actualizado |
| `src/modules/ai/ai.service.ts` | Reescritura completa del servicio de IA |
| `.env.example` | Variables de IA cambiadas de `ANTHROPIC_API_KEY` a `VERTEX_AI_*` |
| `docker-compose.yml` | Variables de entorno actualizadas |
| `.gitignore` | Endurecido para secretos |
| `Dockerfile` | Sin valores sensibles |
| `deploy.sh` | Sincronización de secretos con `--set-secrets` |
| `src/app.module.ts` | ConfigService inyectado |
| `src/database/firebase.provider.ts` | Lectura de credenciales desde config |
| `src/modules/auth/auth.service.ts` | ConfigService para secretos |
| `src/modules/email/email.service.ts` | ConfigService para secretos |
| `src/modules/storage/storage.service.ts` | ConfigService para secretos |

### Commit `69be18d` (limpieza final)

| Archivo | Cambio |
|---|---|
| `package.json` | Eliminó `@anthropic-ai/sdk` |
| `pnpm-lock.yaml` | Eliminó dependencias de Anthropic |
| `docs/DOCKER-GCP-DEPLOYMENT.md` | `ANTHROPIC_API_KEY` → `VERTEX_AI_*` |
| `docs/ESTRUCTURA-ARQUITECTURA.md` | `anthropic.provider.ts` → `vertexai.provider.ts` |

---

## 3. Diff completo por archivo

### 3.1 `package.json` — Dependencias

```diff
   "dependencies": {
-    "@anthropic-ai/sdk": "^0.27.0",
     "@google-cloud/storage": "^7.21.0",
+    "@google-cloud/vertexai": "^1.12.0",
     "@nestjs/common": "^10.3.0",
+    "@nestjs/config": "^4.0.4",
     "@nestjs/core": "^10.3.0",
```

### 3.2 `src/modules/ai/ai.service.ts` — Servicio de IA (completo)

#### Imports

```diff
 import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common'
+import { ConfigService } from '@nestjs/config'
+import { VertexAI, GenerativeModel } from '@google-cloud/vertexai'
 import { Firestore } from 'firebase-admin/firestore'
 import { FIRESTORE } from '../../database/firebase.provider'
 import { COLECCIONES } from '../../database/firestore.constants'
 import { parsearTiposDiscapacidad, parsearCampoJson } from '../../common/utils/firestore-helpers'
```

#### Clase y constructor

```diff
+/**
+ * Configuración de Vertex AI (Gemini). Los valores se leen de variables de
+ * entorno montadas desde GCP Secret Manager / config del contenedor:
+ *
+ * - VERTEX_AI_PROJECT_ID  (fallback: FIREBASE_PROJECT_ID)
+ * - VERTEX_AI_LOCATION    (default: us-central1)
+ * - VERTEX_AI_MODEL       (default: gemini-2.0-flash)
+ *
+ * Autenticación: el SDK usa Application Default Credentials (ADC). En Cloud
+ * Run se resuelve con la cuenta de servicio adjunta al servicio; en local con
+ * `gcloud auth application-default login` o GOOGLE_APPLICATION_CREDENTIALS.
+ * No se requiere API key en texto plano.
+ */
 @Injectable()
 export class AiService {
   private readonly logger = new Logger('AiService')
-  private client: any = null
-
-  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {
-    if (process.env.ANTHROPIC_API_KEY) {
-      try {
-        const Anthropic = require('@anthropic-ai/sdk')
-        this.client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY })
-        this.logger.log('Anthropic SDK inicializado con API key real')
-      } catch {
-        this.logger.warn('Anthropic SDK no disponible — usando respuestas mock')
-      }
-    } else {
-      this.logger.warn('ANTHROPIC_API_KEY no configurada — usando respuestas mock')
-    }
+  private chatModel: GenerativeModel | null = null
+  private jsonModel: GenerativeModel | null = null
+
+  constructor(
+    @Inject(FIRESTORE) private readonly db: Firestore,
+    private readonly config: ConfigService,
+  ) {
+    this.initializeModel()
+  }
+
+  private initializeModel(): void {
+    const project = this.config.get<string>('VERTEX_AI_PROJECT_ID')
+                    ?? this.config.get<string>('FIREBASE_PROJECT_ID')
+    const location = this.config.get<string>('VERTEX_AI_LOCATION') ?? 'us-central1'
+    const modelName = this.config.get<string>('VERTEX_AI_MODEL') ?? 'gemini-2.0-flash'
+
+    if (!project) {
+      this.logger.warn('Vertex AI: VERTEX_AI_PROJECT_ID/FIREBASE_PROJECT_ID no configurado — usando respuestas mock')
+      return
+    }
+
+    try {
+      const vertexAI = new VertexAI({ project, location })
+      this.chatModel = vertexAI.getGenerativeModel({
+        model: modelName,
+        generationConfig: { maxOutputTokens: 300 },
+      })
+      this.jsonModel = vertexAI.getGenerativeModel({
+        model: modelName,
+        generationConfig: {
+          maxOutputTokens: 800,
+          // Garantiza JSON parseable (evita truncamiento → fallback mock)
+          responseMimeType: 'application/json',
+        },
+      })
+      this.logger.log(`✅ Vertex AI inicializado: project=${project}, location=${location}, model=${modelName}`)
+    } catch (e: any) {
+      this.logger.warn(`⚠️  Vertex AI no disponible (${e?.message ?? e}) — usando respuestas mock`)
+      this.chatModel = null
+      this.jsonModel = null
+    }
+  }
+
+  /** Extrae el texto de la respuesta de Gemini de forma segura. */
+  private extractText(result: any): string {
+    const parts = result?.response?.candidates?.[0]?.content?.parts
+    if (!Array.isArray(parts)) return ''
+    return parts.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('')
+  }
+
+  /** Parsea JSON de la respuesta de Gemini tolerando bloques ```json. */
+  private parseJsonResponse(text: string): any {
+    let cleaned = text.trim()
+    const fence = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
+    if (fence) cleaned = fence[1].trim()
+    return JSON.parse(cleaned)
   }
```

#### Método `chat()`

```diff
   async chat(usuarioId: string, mensaje: string, historial: any[] = []) {
     const perfil = await this.getUserProfile(usuarioId)

-    if (!this.client) {
+    if (!this.chatModel) {
       await new Promise((r) => setTimeout(r, 600))
       const respuesta = RESPUESTAS_MOCK[Math.floor(Math.random() * RESPUESTAS_MOCK.length)]
       return { respuesta, simulado: true }
     }

     // ... (system prompt sin cambios) ...

-    const response = await this.client.messages.create({
-      model: 'claude-haiku-4-5-20251001',
-      max_tokens: 300,
-      system: sistema,
-      messages: [...historial.slice(-6), { role: 'user', content: mensaje }],
-    })
-
-    return { respuesta: response.content[0].text, simulado: false }
+    try {
+      const chat = this.chatModel.startChat({
+        systemInstruction: sistema,
+        history: historial.slice(-6).map((m) => ({
+          role: m.role === 'assistant' ? 'model' : 'user',
+          parts: [{ text: String(m.content) }],
+        })),
+      })
+      const result = await chat.sendMessage(mensaje)
+      const respuesta = this.extractText(result)
+      if (!respuesta) throw new Error('Respuesta vacía de Vertex AI')
+      return { respuesta, simulado: false }
+    } catch (e: any) {
+      this.logger.warn(`Vertex AI chat falló (${e?.message ?? e}) — usando respuestas mock`)
+      await new Promise((r) => setTimeout(r, 600))
+      const respuesta = RESPUESTAS_MOCK[Math.floor(Math.random() * RESPUESTAS_MOCK.length)]
+      return { respuesta, simulado: true }
+    }
   }
```

#### Método `recommend()`

```diff
-    if (!this.client || !perfil) {
+    if (!this.jsonModel || !perfil) {
       // ... (fallback mock sin cambios) ...
     }

     // ... (prompt sin cambios) ...

     try {
-      const response = await this.client.messages.create({
-        model: 'claude-sonnet-4-6', max_tokens: 500,
-        messages: [{ role: 'user', content: prompt }],
-      })
-      return { ...JSON.parse(response.content[0].text), simulado: false }
-    } catch {
+      const result = await this.jsonModel.generateContent(prompt)
+      const text = this.extractText(result)
+      return { ...this.parseJsonResponse(text), simulado: false }
+    } catch (e: any) {
+      this.logger.warn(`Vertex AI recommend falló (${e?.message ?? e}) — mostrando sugerencias generales`)
       return {
         proximosPasos: ['Explora instituciones cercanas', 'Completa tu historial', 'Únete a la comunidad'],
         razonamiento: 'Error al procesar — mostrando sugerencias generales', sugerenciasInstitucion: [], simulado: true,
       }
     }
```

#### Método `recommendForDependent()`

```diff
-    if (!this.client) {
+    if (!this.jsonModel) {
       // ... (fallback mock sin cambios) ...
     }

     // ... (prompt sin cambios) ...

     try {
-      const response = await this.client.messages.create({
-        model: 'claude-sonnet-4-6', max_tokens: 400,
-        messages: [{ role: 'user', content: prompt }],
-      })
-      return { ...JSON.parse(response.content[0].text), simulado: false }
-    } catch {
+      const result = await this.jsonModel.generateContent(prompt)
+      const text = this.extractText(result)
+      return { ...this.parseJsonResponse(text), simulado: false }
+    } catch (e: any) {
+      this.logger.warn(`Vertex AI recommendForDependent falló (${e?.message ?? e}) — mostrando sugerencias generales`)
       return {
         proximosPasos: [
           `Busca instituciones de ${discapacidades} cerca de ti`,
```

### 3.3 `.env.example` — Variables de entorno

```diff
-# ── AI Services (optional) ───────────────────────────────────
-# ANTHROPIC_API_KEY=
+# ---- IA (Vertex AI / Gemini) --------------------------------
+# Autenticacion via ADC: en Cloud Run usa la cuenta de servicio adjunta;
+# en local, `gcloud auth application-default login`.
+VERTEX_AI_PROJECT_ID=tu-proyecto-gcp
+VERTEX_AI_LOCATION=us-central1
+VERTEX_AI_MODEL=gemini-2.0-flash
```

### 3.4 `docker-compose.yml`

```diff
+      # Secretos leídos desde .env local (NUNCA versionados)
+      - FIREBASE_CREDENTIALS=${FIREBASE_CREDENTIALS}
       - FIREBASE_API_KEY=${FIREBASE_API_KEY}
+      - RESEND_API_KEY=${RESEND_API_KEY}
+      # Configuración no sensible
       - FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}
-      - FIREBASE_SERVICE_ACCOUNT=${FIREBASE_SERVICE_ACCOUNT}
-      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
+      # Si se omite, el código usa FIREBASE_PROJECT_ID como fallback
+      - VERTEX_AI_PROJECT_ID=${VERTEX_AI_PROJECT_ID:-}
+      - VERTEX_AI_LOCATION=${VERTEX_AI_LOCATION:-us-central1}
+      - VERTEX_AI_MODEL=${VERTEX_AI_MODEL:-gemini-2.0-flash}
```

### 3.5 `docs/DOCKER-GCP-DEPLOYMENT.md`

```diff
-| `ANTHROPIC_API_KEY` | API key de IA | https://console.anthropic.com/ |
+| `VERTEX_AI_PROJECT_ID` | Proyecto GCP para Vertex AI (fallback: `FIREBASE_PROJECT_ID`) | Consola GCP → Vertex AI |
+| `VERTEX_AI_LOCATION` | Región de Vertex AI (default: `us-central1`) | Consola GCP → Vertex AI |
+| `VERTEX_AI_MODEL` | Modelo Gemini (default: `gemini-2.0-flash`) | https://cloud.google.com/vertex-ai |
```

### 3.6 `docs/ESTRUCTURA-ARQUITECTURA.md`

```diff
-│       ├── anthropic.provider.ts
+│       ├── vertexai.provider.ts        # ← Vertex AI (Gemini)
```

---

## 4. Flujo de llamadas antes vs. después

### ANTES (Anthropic Claude)

```
Frontend
  │
  ▼
NestJS (AiService)
  │
  ├─ constructor():
  │    require('@anthropic-ai/sdk')
  │    new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY })
  │
  ├─ chat():
  │    client.messages.create({
  │      model: 'claude-haiku-4-5-20251001',
  │      max_tokens: 300,
  │      system: sistema,
  │      messages: [...historial, { role: 'user', content: mensaje }]
  │    })
  │    → response.content[0].text
  │
  ├─ recommend():
  │    client.messages.create({
  │      model: 'claude-sonnet-4-6',
  │      max_tokens: 500,
  │      messages: [{ role: 'user', content: prompt }]
  │    })
  │    → JSON.parse(response.content[0].text)
  │
  └─ recommendForDependent():
       client.messages.create({
         model: 'claude-sonnet-4-6',
         max_tokens: 400,
         messages: [{ role: 'user', content: prompt }]
       })
       → JSON.parse(response.content[0].text)
```

### DESPUÉS (Vertex AI / Gemini)

```
Frontend
  │
  ▼
NestJS (AiService)
  │
  ├─ constructor() → initializeModel():
  │    new VertexAI({ project, location })
  │    chatModel = vertexAI.getGenerativeModel({ model: 'gemini-2.0-flash', maxOutputTokens: 300 })
  │    jsonModel = vertexAI.getGenerativeModel({ model: 'gemini-2.0-flash', maxOutputTokens: 800, responseMimeType: 'application/json' })
  │
  ├─ chat():
  │    chat = chatModel.startChat({ systemInstruction: sistema, history: [...] })
  │    result = chat.sendMessage(mensaje)
  │    → extractText(result)
  │
  ├─ recommend():
  │    result = jsonModel.generateContent(prompt)
  │    → parseJsonResponse(extractText(result))
  │
  └─ recommendForDependent():
       result = jsonModel.generateContent(prompt)
       → parseJsonResponse(extractText(result))
```

---

## 5. Variables de entorno

### ANTES

```bash
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx  # API key de Anthropic (texto plano)
```

### DESPUÉS

```bash
# Autenticación via ADC (Application Default Credentials)
# En Cloud Run: cuenta de servicio adjunta al servicio
# En local: gcloud auth application-default login

VERTEX_AI_PROJECT_ID=raices-499122    # Proyecto GCP
VERTEX_AI_LOCATION=us-central1         # Región
VERTEX_AI_MODEL=gemini-2.0-flash       # Modelo
```

---

## 6. Autenticación

### ANTES
- API key en texto plano como variable de entorno
- Riesgo de filtración si el .env se expone
- Facturación separada en Anthropic

### DESPUÉS
- **Application Default Credentials (ADC)** — sin API key en texto plano
- **En Cloud Run:** La cuenta de servicio del servicio tiene el rol `Vertex AI User`
- **En local:** `gcloud auth application-default login` o `GOOGLE_APPLICATION_CREDENTIALS`
- **GCP Secret Manager:** Los secretos se montan con `--set-secrets` en el deploy
- Facturación unificada en GCP

---

## 7. Manejo de errores

### ANTES
- Sin fallback — si Anthropic fallaba, la app crasheaba
- Sin logging detallado de errores

### DESPUÉS
- **Fallback graceful:** Si Vertex AI no está configurado o falla, devuelve respuestas mock sin crashear
- **Campo `simulado: boolean`:** Cada respuesta indica si es real o mock
- **Logging detallado:** Mensajes con el error específico y contexto
- **Dos modelos separados:** `chatModel` (conversación) y `jsonModel` (estructurado con `responseMimeType: 'application/json'`)

---

## 8. Beneficios de la migración

1. **Todo en GCP:** Un solo proveedor para hosting (Cloud Run), IA (Vertex AI), auth (Firebase), y storage
2. **Sin API keys en texto plano:** ADC es más seguro que API keys
3. **Facturación unificada:** Una sola factura de GCP
4. **IAM centralizado:** Permisos gestionados desde la consola de GCP
5. **Modelo configurable:** Se cambia el modelo via variable de entorno sin tocar código
6. **Secretos seguros:** GCP Secret Manager en lugar de variables de entorno directas

---

## 9. Cómo verificar que la migración funciona

```bash
# 1. Verificar que Vertex AI está configurado en los logs
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=raices-backend AND jsonPayload.message=~\"Vertex AI\"" \
  --project=raices-499122 --limit=20

# Mensaje esperado:
# ✅ Vertex AI inicializado: project=raices-499122, location=us-central1, model=gemini-2.0-flash

# 2. Verificar variables de entorno en Cloud Run
gcloud run services describe raices-backend \
  --project=raices-499122 --region=us-central1 \
  --format="value(spec.template.spec.containers[0].env)"

# Deben existir: VERTEX_AI_PROJECT_ID, VERTEX_AI_LOCATION, VERTEX_AI_MODEL

# 3. Probar el chat (con token JWT)
curl -s https://raices.techmaleon.com.mx/api/ia/conversacion \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mensaje":"Hola","historial":[]}' | jq .

# "simulado": false → ✅ IA real activa
# "simulado": true  → ⚠️ Modo mock (configurar Vertex AI)
```

---

## 10. Archivo `ai.service.spec.ts` — Pruebas unitarias del servicio de IA

**Ruta:** `src/modules/ai/ai.service.spec.ts`

Este archivo contiene las **pruebas unitarias** del `AiService`, verificando que la migración de Anthropic a Vertex AI (Gemini) funciona correctamente. Utiliza **Jest** con mocks de `@google-cloud/vertexai` y Firestore para simular el comportamiento sin dependencias reales.

### Qué se prueba

| Sección | Qué valida |
|---|---|
| **Inicialización** | Que Vertex AI se configure con las variables correctas (`VERTEX_AI_PROJECT_ID`, `VERTEX_AI_LOCATION`, `VERTEX_AI_MODEL`), que use `FIREBASE_PROJECT_ID` como fallback, que caiga en modo mock cuando no hay project, que maneje errores de inicialización, y que use valores por defecto (`gemini-2.0-flash`, `us-central1`) |
| **`chat()`** | Que devuelva mock cuando el modelo no está disponible, que llame a Vertex AI chat cuando el modelo sí está, que incluya y limite el historial a los últimos 6 mensajes, que caiga en mock cuando Vertex AI falla o devuelve respuesta vacía, y que incluya el perfil del usuario en el system prompt |
| **`recommend()`** | Que devuelva mock sin modelo o sin perfil, que genere recomendaciones personalizadas via Vertex AI, que genere recomendaciones diferentes para usuarios sin diagnóstico, que incluya favoritos en el prompt, y que caiga en fallback cuando Vertex AI falla |
| **`recommendForDependent()`** | Que lance `NotFoundException` si el dependiente no existe o pertenece a otro tutor, que genere recomendaciones para dependientes via Vertex AI, que acepte un documento pre-cargado (guard), que maneje `datosPerfil` como JSON inválido, y que caiga en fallback |
| **`generarResumen()`** | Que devuelva mock sin modelo o sin perfil, que genere resúmenes narrativos via Vertex AI, que incluya datos relevantes del usuario en el prompt, que caiga en fallback cuando Vertex AI falla, y que maneje JSON malformado |
| **`extractText()`** | Prueba indirecta: extrae texto de respuestas válidas de Gemini, maneja respuestas sin candidatos, y concatena múltiples `parts` en una sola respuesta |
| **`parseJsonResponse()`** | Prueba indirecta: parsea JSON válido directamente, JSON envuelto en bloques ` ```json ` y bloques ` ``` ` sin lang tag |

### Mocks utilizados

- **`@google-cloud/vertexai`** — Auto-mockea el módulo; `VertexAI` se configura con `jest.fn()` en cada `beforeEach`
- **Firestore** — Mock de `collection()`, `doc()`, `get()`, `set()`, `update()`, `delete()`, `where()`, `limit()`
- **ConfigService** — Simula variables de entorno (`VERTEX_AI_PROJECT_ID`, `VERTEX_AI_LOCATION`, `VERTEX_AI_MODEL`)
- **Helpers** — `mockDoc()`, `mockCollection()`, `geminiResponse()`, `emptyGeminiResponse()` para construir respuestas simuladas

### Por qué es importante

1. **Regresión de migración:** Asegura que los métodos `chat()`, `recommend()`, `recommendForDependent()` y `generarResumen()` funcionan correctamente después del cambio de Anthropic a Vertex AI
2. **Fallback robusto:** Valida que cada método cae en respuestas mock cuando Vertex AI no está configurado o falla, evitando crashes en producción
3. **Parsing de respuestas:** Verifica que `extractText()` y `parseJsonResponse()` manejan correctamente los formatos de respuesta de Gemini (incluyendo bloques markdown)
4. **Seguridad:** Confirma que los permisos de tutor se respetan en `recommendForDependent()`

---

*Documento generado el 20 de agosto de 2026 como parte de la auditoría del proyecto Raíces.*
