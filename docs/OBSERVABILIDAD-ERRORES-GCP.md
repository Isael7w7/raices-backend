# Observabilidad de errores críticos y alertas en GCP

Guía de la infraestructura de observabilidad del backend **Raíces** (Cloud Run / NestJS):

| # | Entregable | Dónde vive |
|---|------------|------------|
| 1 | Logs estructurados del `ExceptionFilter` | `src/common/filters/global-exception.filter.ts` (registrado en `src/main.ts`) |
| 2 | Métrica + alerta + dashboard (gcloud) | `infra/observability.sh`, `infra/metric-critical-errors.yaml`, `infra/alert-critical-errors.json`, `infra/dashboard-raices-api.json` |
| 3 | Guía de prueba de disparo de alerta | [Guía rápida de prueba](#guía-rápida-de-prueba-de-la-alerta) (este documento) |

---

## 1. Logs estructurados del backend

`GlobalExceptionFilter` (filtro global, reemplaza al por defecto de Nest) escribe **una línea JSON por error en stdout**:

```json
{
  "timestamp": "2026-09-28T14:03:22.184Z",
  "severity": "ERROR",
  "message": "Failed to commit Firestore batch",
  "statusCode": 500,
  "path": "/api/instituciones",
  "method": "POST",
  "stack": "Error: Failed to commit Firestore batch\n    at ...",
  "userId": "abc123XYZ",
  "context": "GlobalExceptionFilter"
}
```

Reglas de severidad:

| Escenario | `severity` | `statusCode` | `stack` | `userId` |
|-----------|-----------|--------------|---------|----------|
| Respuesta 5xx (DB, servicios externos, excepción no capturada) | `ERROR` | `>=500` | sí | si hay sesión |
| Respuesta 4xx (validaciones, 401/403/404) | `WARNING` | `4xx` | vacío | si hay sesión |
| `unhandledRejection` / `uncaughtException` (proceso) | `ERROR` | ausente | sí | no |

Puntos clave:

- **Cloud Run → Cloud Logging**: si una línea de stdout es JSON con el campo `severity`, Cloud Logging la usa como severidad del registro y guarda el resto en `jsonPayload`. Eso es lo que permite el filtro `severity>=ERROR AND jsonPayload.statusCode>=500`.
- Los 5xx **nunca** exponen mensaje ni stack al cliente: la respuesta es `{"statusCode":500,"message":"Error interno del servidor"}`.
- Los errores de proceso (promesas rechazadas, excepciones no capturadas) se emiten con `severity=ERROR` desde `instalarManejadoresDeErroresNoCapturados()` (llamada en `main.ts`). No llevan `statusCode`, por lo que **no** cuentan en la métrica; se buscan en Logs Explorer con `severity>=ERROR`.
- Endpoint de simulación: `GET /api/health/simular-error-500` **solo existe si `NODE_ENV !== 'production'`** (se registra en `src/modules/health/health.module.ts`).

---

## 2. Infraestructura en GCP (script gcloud)

### Prerrequisitos

```bash
gcloud auth login
gcloud config set project raices-499122
```

Permisos: `roles/logging.config.writer`, `roles/monitoring.alertPolicyEditor`,
`roles/monitoring.dashboardEditor`, `roles/monitoring.notificationChannelEditor`.

### Despliegue completo

```bash
# Con email + Slack:
ALERT_EMAIL="ops@techmaleon.com.mx" \
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T0000/B0000/XXXXXXXX" \
./infra/observability.sh all

# Sin canales (usa los canales habilitados que ya existan en el proyecto):
./infra/observability.sh all
```

El script es **idempotente**: lo que ya existe se omite; con `--force` se recrea.

Acciones disponibles (`./infra/observability.sh help`):

| Acción | Qué crea |
|--------|----------|
| `metric` | Log-based metric `critical_errors_counter` |
| `channels` | Canales de notificación (email / webhook de Slack) |
| `alert` | Alerting policy `> 0 en 5 min` |
| `dashboard` | Dashboard con los 3 gráficos |
| `all` | Todo lo anterior (default) |
| `test-log` | Registro sintético para probar la alerta |
| `status` | Estado de métrica/alerta/dashboard + últimos errores 5xx |

### Qué despliega cada archivo

**`infra/metric-critical-errors.yaml`** → log-based metric `critical_errors_counter`
(`logging.googleapis.com/user/critical_errors_counter`, contador DELTA con labels `status_code`, `method`):

```sh
resource.type="cloud_run_revision" AND severity>=ERROR AND (jsonPayload.statusCode>=500 OR jsonPayload.status>=500)
```

**`infra/alert-critical-errors.json`** → alerting policy:

- Condición: `critical_errors_counter > 0` (comparación `COMPARISON_GT`, umbral `0`).
- Ventana: `alignmentPeriod: 300s` + `perSeriesAligner: ALIGN_SUM` → cuenta los errores de los últimos **5 minutos**.
- `duration: 0s` → notifica en cuanto la ventana supera 0 (sin período de gracia).
- Canales: los detectados por `ALERT_EMAIL` / `SLACK_WEBHOOK_URL` (o los habilitados del proyecto).
- `alertStrategy.autoClose: 1800s` → el incidente se cierra a los 30 min sin nuevos errores.

**`infra/dashboard-raices-api.json`** → dashboard *«Raíces API — Observabilidad (5xx, latencia, códigos)»*:

| Gráfico | Métrica | Configuración |
|---------|---------|---------------|
| 1. Errores 5xx en el tiempo | `logging.googleapis.com/user/critical_errors_counter` | `ALIGN_SUM` / 60 s (conteo por minuto) |
| 2. Latencia p95 / p99 | `serviceruntime.googleapis.com/http/server/response_latencies` | `ALIGN_PERCENTILE_95` y `ALIGN_PERCENTILE_99`, 60 s |
| 3. Solicitudes por código (2xx/4xx/5xx) | `run.googleapis.com/request_count` | `ALIGN_RATE` + `REDUCE_SUM` agrupado por `response_code_class`, área apilada |

### Notas de canales de notificación

- **Email**: Cloud Monitoring exige **verificar** el canal (llega un correo de Google con un enlace). Hasta que no se verifique **no se envían notificaciones**.
- **Slack**: se crea como canal `webhook_basicauth` apuntando al *incoming webhook* del canal de Slack (`SLACK_WEBHOOK_URL`). Slack ignora el basic auth, así que `SLACK_WEBHOOK_USER/PASSWORD` son valores dummy (`gcp-alerts`).

---

## 3. Guía rápida de prueba de la alerta

### Opción A — Registro sintético (sin redeploy, ~5 min)

Sirve para verificar métrica + alerta + canales de extremo a extremo:

```bash
./infra/observability.sh test-log
```

Esto escribe un registro con `severity=ERROR`, `statusCode=500` y `resource.type=cloud_run_revision`, idéntico en forma a los que emite el backend.

Verificación:

```bash
# Estado de métrica, alerta, dashboard y últimos errores 5xx
./infra/observability.sh status
```

1. **Logs Explorer**: debe aparecer el registro `[OBSERVABILIDAD] Error 500 sintetico de prueba`.
   [Abrir Logs Explorer con la consulta](https://console.cloud.google.com/logs/query?project=raices-499122)
   ```sh
   resource.type="cloud_run_revision" AND severity>=ERROR AND (jsonPayload.statusCode>=500 OR jsonPayload.status>=500)
   ```
2. **Metric Explorer** (`logging.googleapis.com/user/critical_errors_counter`): la serie incrementa.
3. **Alerting → Policies**: «Errores críticos 5xx (Raíces backend)» pasa a **Abierto** y aparece el incidente en *Alerting → Incidents*.
4. Llega la notificación al email / Slack.

> ⏱ Los log-based metrics se actualizan cada ~1 min y el punto alineado de la ventana de 5 min tarda **hasta 5 min** en emitirse: la notificación llega entre 1 y 6 minutos después de `test-log`.

### Opción B — Endpoint controlado en staging (500 real)

1. Desplegar el backend **sin** `NODE_ENV=production` (eso es lo que registra el endpoint):

   ```bash
   NODE_ENV=staging ./deploy.sh deploy
   ```

2. Disparar el 500:

   ```bash
   curl -i "https://<URL_DEL_SERVICIO>/api/health/simular-error-500"
   # local: curl -i "http://localhost:7000/api/health/simular-error-500"
   ```

   Respuesta esperada: `HTTP/1.1 500` con `{"statusCode":500,"message":"Simulación controlada de error 500 ..."}`.

3. Verificar el log estructurado (Logs Explorer, misma consulta de la Opción A). El registro debe traer `severity=ERROR`, `statusCode=500`, `path`, `method`, `stack` y `userId` si se envió sesión.
4. En ~1–6 min la métrica incrementa y la alerta dispara la notificación.

> **Seguridad**: con `NODE_ENV=production` (default de `deploy.sh`) el endpoint **no se registra** y responde 404. Nunca se despliegue staging con el endpoint apuntando a datos de producción si no es deseado.

### Opción C — Verificación local del formato de logs

```bash
pnpm dev
curl -s "http://localhost:7000/api/health/simular-error-500"
```

La consola imprime la línea JSON con `severity:"ERROR"`. Esto **no** dispara la alerta (el registro no vive en GCP); solo valida el formato que consumirá Cloud Logging.

---

## 4. Solución de problemas

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| La métrica no incrementa | El log no es JSON o le falta `severity`/`statusCode` | Revisa la consulta en Logs Explorer; confirma que el registro venga del filtro y no de otro logger |
| La métrica incrementa pero no hay alerta | La condición es `> 0` en ventana de 5 min y aún no hay punto alineado | Espera ~5 min o revisa *Alerting → Policies → Condition* |
| No llega el email | Canal sin verificar | Cloud Monitoring → Alertas → Notificaciones → verificar |
| No llega el Slack | Webhook incorrecto o canal deshabilitado | Verifica `SLACK_WEBHOOK_URL` y `enabled=true` |
| Gráfico de latencia vacío | Aún no hay tráfico HTTP | Genera tráfico (health check o cualquier endpoint) |
| El script falla con permisos | Faltan roles de Monitoring/Logging | Otorga los roles listados en Prerrequisitos |
| `404` en `/api/health/simular-error-500` en staging | `NODE_ENV=production` en ese deploy | Despliega con `NODE_ENV=staging ./deploy.sh deploy` |

---

## 5. Consultas útiles en Logs Explorer

```sh
# Todos los errores críticos (los que cuentan en la métrica)
resource.type="cloud_run_revision" AND severity>=ERROR AND (jsonPayload.statusCode>=500 OR jsonPayload.status>=500)

# Errores 5xx por usuario
resource.type="cloud_run_revision" AND jsonPayload.statusCode>=500
| jsonPayload.userId

# Errores de proceso (promesas rechazadas / excepciones no capturadas)
resource.type="cloud_run_revision" AND severity>=ERROR -jsonPayload.statusCode

# Latencia y códigos por ruta
resource.type="cloud_run_revision" AND httpRequest.status>=500
```
