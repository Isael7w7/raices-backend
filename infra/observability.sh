#!/bin/bash
set -euo pipefail

# ============================================
# Raíces Backend - Observabilidad en GCP
# ============================================
# Despliega los artefactos de observabilidad de errores críticos:
#   1. Log-based metric  : critical_errors_counter (infra/metric-critical-errors.yaml)
#   2. Alerting policy    : > 0 errores en 5 minutos -> email / Slack (infra/alert-critical-errors.json)
#   3. Dashboard          : 5xx en el tiempo, latencia p95/p99, códigos de respuesta
#                           (infra/dashboard-raices-api.json)
#
# Uso:
#   ./infra/observability.sh [metric|channels|alert|dashboard|all|status|test-log] [--force]
#
#   all        (default) crea metrica + canales + alerta + dashboard (idempotente)
#   test-log   escribe un registro sintetico severity=ERROR / statusCode=500 para
#              verificar la metrica y la alerta sin tocar la aplicacion
#   status     muestra metrica, politica, dashboard y los ultimos errores 5xx
#   --force    recrea los artefactos que ya existen
#
# Variables de entorno:
#   GCP_PROJECT_ID             proyecto GCP           (default: raices-499122)
#   GCP_REGION                 region de Cloud Run    (default: us-central1)
#   SERVICE_NAME               servicio de Cloud Run  (default: raices-backend)
#   ALERT_EMAIL                canal de email para las alertas        (opcional)
#   SLACK_WEBHOOK_URL          webhook de Slack para las alertas      (opcional)
#   SLACK_WEBHOOK_USER         usuario basic-auth del webhook         (default: gcp-alerts)
#   SLACK_WEBHOOK_PASSWORD     password basic-auth del webhook        (default: gcp-alerts)
#
# Requisitos: gcloud autenticado (gcloud auth login) con permisos
# roles/logging.config.writer, roles/monitoring.alertPolicyEditor,
# roles/monitoring.dashboardEditor y roles/monitoring.notificationChannelEditor.

PROJECT_ID="${GCP_PROJECT_ID:-raices-499122}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-raices-backend}"

METRIC_NAME="critical_errors_counter"
METRIC_TYPE="logging.googleapis.com/user/${METRIC_NAME}"
ALERT_NAME="Errores críticos 5xx (Raíces backend)"
DASHBOARD_NAME="Raíces API — Observabilidad (5xx, latencia, códigos)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORCE="false"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ── Helpers ──────────────────────────────────────────────────────────────────

# Ejecuta un subcomando de Cloud Monitoring con el primer prefijo disponible
# (gcloud monitoring -> gcloud beta monitoring -> gcloud alpha monitoring).
#
# El prefijo se resuelve con --help (y no probando los tres) por dos motivos:
#  1. no se reintentan beta/alpha ante errores reales (permisos, validación);
#  2. stdout queda SOLO con datos y stderr se propaga tal cual: si se captura
#     2>&1, avisos como "WARNING: filter keys not present" se confunden con el
#     nombre de un recurso y producen falsos "ya existe".
mon() {
  local grupo="$1"; shift
  local prefijo=""
  if gcloud monitoring "$grupo" --help >/dev/null 2>&1; then
    prefijo="gcloud monitoring"
  elif gcloud beta monitoring "$grupo" --help >/dev/null 2>&1; then
    prefijo="gcloud beta monitoring"
  elif gcloud alpha monitoring "$grupo" --help >/dev/null 2>&1; then
    prefijo="gcloud alpha monitoring"
  else
    log_error "No existe el subcomando 'gcloud monitoring ${grupo}' en esta versión de gcloud."
    return 1
  fi
  # shellcheck disable=SC2086
  ${prefijo} "$grupo" "$@"
}

verificar_requisitos() {
  if ! command -v gcloud &>/dev/null; then
    log_error "gcloud CLI no está instalado: https://cloud.google.com/sdk/docs/install"
    exit 1
  fi
  if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q .; then
    log_error "No hay sesión de gcloud. Ejecuta: gcloud auth login"
    exit 1
  fi
  gcloud config set project "$PROJECT_ID" >/dev/null
}

habilitar_apis() {
  gcloud services enable logging.googleapis.com monitoring.googleapis.com \
    --project="$PROJECT_ID" >/dev/null 2>&1 || \
    log_warn "No se pudieron habilitar las APIs (¿permisos?). Se continúa igualmente."
}

# ── 1. Log-based metric ──────────────────────────────────────────────────────
crear_metrica() {
  local existente
  existente="$(gcloud logging metrics describe "$METRIC_NAME" \
    --project="$PROJECT_ID" --format='value(name)' 2>/dev/null || true)"

  if [[ -n "$existente" ]]; then
    if [[ "$FORCE" != "true" ]]; then
      log_warn "La métrica '${METRIC_NAME}' ya existe — omitida (usa --force para recrearla)."
      return 0
    fi
    log_info "Recreando métrica '${METRIC_NAME}'..."
    gcloud logging metrics delete "$METRIC_NAME" --project="$PROJECT_ID" --quiet
  fi

  gcloud logging metrics create "$METRIC_NAME" \
    --config-from-file="$SCRIPT_DIR/metric-critical-errors.yaml" \
    --project="$PROJECT_ID"
  log_info "Métrica creada: ${METRIC_TYPE} ✓"
}

# ── 2. Canales de notificación ───────────────────────────────────────────────
crear_canales() {
  # Email (requiere verificación del canal en la consola de Cloud Monitoring)
  if [[ -n "${ALERT_EMAIL:-}" ]]; then
    local existente
    existente="$(mon channels list --project="$PROJECT_ID" \
      --filter="type=email AND labels.email_address=${ALERT_EMAIL}" \
      --limit=1 --format='value(name)' 2>/dev/null || true)"
    if [[ -n "$existente" ]]; then
      log_info "Canal de email '${ALERT_EMAIL}' ya existe — omitido."
    else
      mon channels create --project="$PROJECT_ID" \
        --display-name="Raices - Alertas por email (${ALERT_EMAIL})" \
        --description="Notificaciones de alertas del backend Raices (Cloud Monitoring)." \
        --type=email \
        --channel-labels="email_address=${ALERT_EMAIL}" >/dev/null
      log_info "Canal de email creado: ${ALERT_EMAIL} ✓"
      log_warn "IMPORTANTE: verifica el canal en Cloud Monitoring → Alertas → Notificaciones (Google envía un correo de verificación)."
    fi
  else
    log_warn "ALERT_EMAIL no definida — se omite el canal de email."
  fi

  # Webhook de Slack (tipo webhook_basicauth: Slack ignora el basic auth)
  if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
    local existente_slack
    existente_slack="$(mon channels list --project="$PROJECT_ID" \
      --filter="type=webhook_basicauth AND labels.url=${SLACK_WEBHOOK_URL}" \
      --limit=1 --format='value(name)' 2>/dev/null || true)"
    if [[ -n "$existente_slack" ]]; then
      log_info "Webhook de Slack ya existe — omitido."
    else
      mon channels create --project="$PROJECT_ID" \
        --display-name="Raices - Slack (webhook de alertas)" \
        --description="Webhook de Slack para alertas críticas del backend Raices." \
        --type=webhook_basicauth \
        --channel-labels="url=${SLACK_WEBHOOK_URL},username=${SLACK_WEBHOOK_USER:-gcp-alerts},password=${SLACK_WEBHOOK_PASSWORD:-gcp-alerts}" >/dev/null
      log_info "Webhook de Slack creado ✓"
    fi
  else
    log_warn "SLACK_WEBHOOK_URL no definida — se omite el canal de Slack."
  fi
}

# Devuelve un array JSON con los canales que debe usar la alerta.
# NOTA: se captura con $(...), así que todos los mensajes de log van a stderr
# (log_warn >&2) para no contaminar el JSON resultante.
obtener_canales_json() {
  local nombres=()

  if [[ -n "${ALERT_EMAIL:-}" ]]; then
    while IFS= read -r nombre; do
      [[ -n "$nombre" ]] && nombres+=("$nombre")
    done < <(mon channels list --project="$PROJECT_ID" \
      --filter="type=email AND labels.email_address=${ALERT_EMAIL}" \
      --format='value(name)' 2>/dev/null || true)
  fi

  if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
    while IFS= read -r nombre; do
      [[ -n "$nombre" ]] && nombres+=("$nombre")
    done < <(mon channels list --project="$PROJECT_ID" \
      --filter="type=webhook_basicauth AND labels.url=${SLACK_WEBHOOK_URL}" \
      --format='value(name)' 2>/dev/null || true)
  fi

  # Sin variables de entorno: se usan los canales habilitados ya existentes
  # (p. ej. el correo del equipo configurado a mano en la consola).
  if [[ ${#nombres[@]} -eq 0 ]]; then
    log_warn "No se detectaron canales por variable de entorno; se usarán los canales habilitados del proyecto." >&2
    while IFS= read -r nombre; do
      [[ -n "$nombre" ]] && nombres+=("$nombre")
    done < <(mon channels list --project="$PROJECT_ID" \
      --filter="enabled=true" --format='value(name)' 2>/dev/null || true)
  fi

  local json=""
  local i=0
  if [[ ${#nombres[@]} -gt 0 ]]; then
    for nombre in "${nombres[@]}"; do
      if [[ $i -gt 0 ]]; then
        json+=","
      fi
      json+="\"${nombre}\""
      i=$((i + 1))
    done
  else
    log_warn "Sin canales de notificación: la alerta se creará sin destino de aviso." >&2
  fi
  printf '[%s]' "$json"
}

# ── 3. Alerting policy ───────────────────────────────────────────────────────
crear_alerta() {
  local existente
  existente="$(mon policies list --project="$PROJECT_ID" \
    --filter="displayName=\"${ALERT_NAME}\"" \
    --limit=1 --format='value(name)' 2>/dev/null || true)"

  if [[ -n "$existente" ]]; then
    if [[ "$FORCE" != "true" ]]; then
      log_warn "La alerta '${ALERT_NAME}' ya existe — omitida (usa --force para recrearla)."
      return 0
    fi
    log_info "Recreando alerta '${ALERT_NAME}'..."
    mon policies delete "$existente" --project="$PROJECT_ID" --quiet >/dev/null
  fi

  local canales tmp_dir tmp
  canales="$(obtener_canales_json)"
  tmp_dir="$(mktemp -d)"
  tmp="$tmp_dir/alert-critical-errors.json"

  # Sustituye los placeholders del template. sed con '|' como delimitador
  # porque los nombres de canal contienen '/'.
  sed -e "s|__NOTIFICATION_CHANNELS__|${canales}|g" \
      -e "s|__PROJECT_ID__|${PROJECT_ID}|g" \
      "$SCRIPT_DIR/alert-critical-errors.json" > "$tmp"

  mon policies create --policy-from-file="$tmp" --project="$PROJECT_ID"
  rm -rf "$tmp_dir"
  log_info "Alerting policy creada: '${ALERT_NAME}' (> 0 en 5 min) ✓"
}

# ── 4. Dashboard ─────────────────────────────────────────────────────────────
crear_dashboard() {
  local existente
  existente="$(mon dashboards list --project="$PROJECT_ID" \
    --filter="displayName=\"${DASHBOARD_NAME}\"" \
    --limit=1 --format='value(name)' 2>/dev/null || true)"

  if [[ -n "$existente" ]]; then
    if [[ "$FORCE" != "true" ]]; then
      log_warn "El dashboard '${DASHBOARD_NAME}' ya existe — omitido (usa --force para recrearlo)."
      return 0
    fi
    log_info "Recreando dashboard '${DASHBOARD_NAME}'..."
    mon dashboards delete "$existente" --project="$PROJECT_ID" --quiet >/dev/null
  fi

  mon dashboards create --config-from-file="$SCRIPT_DIR/dashboard-raices-api.json" \
    --project="$PROJECT_ID"
  log_info "Dashboard creado: '${DASHBOARD_NAME}' ✓"
}

# ── 5. Prueba de disparo (registro sintético) ────────────────────────────────
probar_log() {
  local payload
  payload="$(printf '{"timestamp":"%s","severity":"ERROR","message":"[OBSERVABILIDAD] Error 500 sintetico de prueba","statusCode":500,"path":"/api/health/simular-error-500","method":"GET","stack":"(registro sintetico)","context":"observability-test"}' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)")"

  gcloud logging write "projects/${PROJECT_ID}/logs/${SERVICE_NAME}" "$payload" \
    --payload-type=json \
    --severity=ERROR \
    --monitored-resource-type=cloud_run_revision \
    --monitored-resource-labels="project_id=${PROJECT_ID},service_name=${SERVICE_NAME},location=${REGION},configuration_name=${SERVICE_NAME},revision_name=${SERVICE_NAME}-00001-test" \
    --project="$PROJECT_ID"

  log_info "Registro sintético escrito. En ~1-5 min la métrica '${METRIC_NAME}' debe incrementar y la alerta debe dispararse."
  log_info "Verifica con: $0 status"
}

# ── 6. Estado ────────────────────────────────────────────────────────────────
ver_estado() {
  echo ""
  log_info "── Métrica ──"
  gcloud logging metrics describe "$METRIC_NAME" --project="$PROJECT_ID" \
    --format="table(name, metricDescriptor.type, filter)" 2>/dev/null || \
    log_warn "La métrica '${METRIC_NAME}' no existe todavía."

  echo ""
  log_info "── Alerta ──"
  mon policies list --project="$PROJECT_ID" \
    --filter="displayName=\"${ALERT_NAME}\"" \
    --format="table(displayName, notificationChannels)" 2>/dev/null || true

  echo ""
  log_info "── Dashboard ──"
  mon dashboards list --project="$PROJECT_ID" \
    --filter="displayName=\"${DASHBOARD_NAME}\"" \
    --format="table(displayName)" 2>/dev/null || true

  echo ""
  log_info "── Últimos errores críticos (máx. 10) ──"
  gcloud logging read \
    'resource.type="cloud_run_revision" AND severity>=ERROR AND (jsonPayload.statusCode>=500 OR jsonPayload.status>=500)' \
    --project="$PROJECT_ID" --limit=10 \
    --format="table(timestamp,jsonPayload.statusCode,jsonPayload.method,jsonPayload.path,jsonPayload.message)" || true
  echo ""
}

# ── CLI ──────────────────────────────────────────────────────────────────────
uso() {
  cat <<'USO'
Raíces Backend - Observabilidad en GCP

Uso:
  ./infra/observability.sh [metric|channels|alert|dashboard|all|status|test-log] [--force]

Acciones:
  all        (default) crea métrica + canales + alerta + dashboard (idempotente)
  metric     solo la log-based metric critical_errors_counter
  channels   solo los canales de notificación (ALERT_EMAIL / SLACK_WEBHOOK_URL)
  alert      solo la alerting policy (> 0 errores críticos en 5 minutos)
  dashboard  solo el dashboard (5xx, latencia p95/p99, códigos de respuesta)
  test-log   escribe un registro sintético severity=ERROR / statusCode=500
             para verificar métrica + alerta sin tocar la aplicación
  status     muestra métrica, alerta, dashboard y los últimos errores 5xx
  --force    recrea los artefactos que ya existen

Variables de entorno:
  GCP_PROJECT_ID (default raices-499122), GCP_REGION (default us-central1),
  SERVICE_NAME (default raices-backend), ALERT_EMAIL, SLACK_WEBHOOK_URL

Ejemplos:
  ALERT_EMAIL=ops@ejemplo.com SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX \
    ./infra/observability.sh all
  ./infra/observability.sh test-log
USO
}

main() {
  local accion="all"
  if [[ $# -gt 0 ]]; then
    accion="$1"
    shift
  fi
  local arg
  for arg in "$@"; do
    if [[ "$arg" == "--force" ]]; then
      FORCE="true"
    fi
  done

  case "$accion" in
    metric|channels|alert|dashboard)
      verificar_requisitos
      habilitar_apis
      case "$accion" in
        metric)    crear_metrica ;;
        channels)  crear_canales ;;
        alert)     crear_alerta ;;
        dashboard) crear_dashboard ;;
      esac
      ;;
    all)
      verificar_requisitos
      habilitar_apis
      crear_metrica
      crear_canales
      crear_alerta
      crear_dashboard
      log_info "Despliegue de observabilidad completado ✓"
      ;;
    status)
      verificar_requisitos
      ver_estado
      ;;
    test-log)
      verificar_requisitos
      probar_log
      ;;
    help|-h|--help)
      uso
      ;;
    *)
      log_error "Acción desconocida: ${accion}"
      uso
      exit 1
      ;;
  esac
}

main "$@"
