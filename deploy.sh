#!/bin/bash
set -euo pipefail

# ============================================
# Raíces Backend - GCP Cloud Run Deployment
# ============================================
# SECURITY: Los secretos (FIREBASE_CREDENTIALS, RESEND_API_KEY) se gestionan
# en GCP Secret Manager y se montan en Cloud Run con --set-secrets. NUNCA se
# inyectan en la imagen Docker ni se hardcodean en el repositorio.

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================
# Configuration - Edit these values
# ============================================
PROJECT_ID="${GCP_PROJECT_ID:-raices-499122}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="raices-backend"
# Use Artifact Registry (recommended) instead of Container Registry
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/raices/${SERVICE_NAME}"
# Firebase service account for Cloud Run (needs access to the secrets)
FIREBASE_SA="firebase-adminsdk-fbsvc@${PROJECT_ID}.iam.gserviceaccount.com"

# Secretos que se leen de Secret Manager (montados como env vars en Cloud Run)
SENSITIVE_ENV_NAMES=(FIREBASE_CREDENTIALS RESEND_API_KEY)

# ============================================
# Functions
# ============================================
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if gcloud is installed
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed. Please install it first."
        log_info "Install from: https://cloud.google.com/sdk/docs/install"
        exit 1
    fi

    # Check if Firebase CLI is installed
    if ! command -v firebase &> /dev/null; then
        log_warn "Firebase CLI not found. Firestore indexes deployment will be skipped."
        log_info "Install from: npm install -g firebase-tools"
    fi

    # Check if Docker is running
    if ! docker info &> /dev/null; then
        log_error "Docker is not running. Please start Docker Desktop."
        exit 1
    fi

    # Check if authenticated with gcloud
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q .; then
        log_error "Not authenticated with gcloud. Run: gcloud auth login"
        exit 1
    fi

    log_info "Prerequisites check passed ✓"
}

authenticate_gcp() {
    log_info "Authenticating with GCP..."
    gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
    gcloud config set project "${PROJECT_ID}"
    log_info "GCP authentication configured ✓"
}

deploy_firestore_indexes() {
    log_info "Deploying Firestore composite indexes..."

    if ! command -v firebase &> /dev/null; then
        log_warn "Firebase CLI not installed. Skipping Firestore indexes deployment."
        log_warn "Install with: npm install -g firebase-tools"
        return 0
    fi

    if [ ! -f "firestore.indexes.json" ]; then
        log_warn "firestore.indexes.json not found. Skipping indexes deployment."
        return 0
    fi

    # Ensure Firebase is logged in
    if ! firebase projects:list &>/dev/null; then
        log_warn "Firebase not authenticated. Run: firebase login"
        return 0
    fi

    if firebase deploy --only firestore:indexes --project "${PROJECT_ID}" 2>&1 | while IFS= read -r line; do
        log_info "  ${line}"
    done; then
        log_info "Firestore indexes deployment completed ✓"
    else
        log_warn "Firestore indexes deployment failed (non-blocking — Cloud Run deploy will continue)"
    fi
}

build_and_push_image() {
    local tag="${1:-latest}"
    local full_image="${IMAGE_NAME}:${tag}"

    log_info "Building Docker image: ${full_image}..."
    docker build -t "${full_image}" .

    log_info "Pushing image to Artifact Registry..."
    docker push "${full_image}"

    log_info "Image pushed successfully ✓"
}

# ── Secret Manager ────────────────────────────────────────────
# Habilita la API y garantiza que el secreto exista, dándole acceso a la
# cuenta de servicio del Cloud Run para poder montarlo.
ensure_secret() {
    local name="$1"
    if ! gcloud secrets describe "${name}" --project "${PROJECT_ID}" &>/dev/null; then
        log_info "Creating secret ${name}..."
        gcloud secrets create "${name}" \
            --project "${PROJECT_ID}" \
            --replication-policy=automatic
    fi
    gcloud secrets add-iam-policy-binding "${name}" \
        --member="serviceAccount:${FIREBASE_SA}" \
        --role=roles/secretmanager.secretAccessor \
        --project "${PROJECT_ID}" >/dev/null 2>&1 || true
}

# Guarda un valor en el secreto (nueva versión).
store_secret_version() {
    local name="$1"
    local value="$2"
    ensure_secret "${name}"
    printf '%s' "${value}" | gcloud secrets versions add "${name}" \
        --data-file=- --project "${PROJECT_ID}" >/dev/null
    log_info "Secret ${name} updated ✓"
}

# Lee los secretos desde el archivo .env de despliegue y los carga en
# Secret Manager (solo si el archivo existe y tiene las variables).
# Acepta el alias FIREBASE_SERVICE_ACCOUNT y lo guarda en el secreto
# FIREBASE_CREDENTIALS (nombre canónico).
sync_secrets_from_env_file() {
    local env_file="${1:-.env}"
    if [ ! -f "${env_file}" ]; then
        log_warn "No ${env_file} found. Skipping secret sync (existing secrets will be used)."
        return 0
    fi

    log_info "Enabling Secret Manager API..."
    gcloud services enable secretmanager.googleapis.com --project "${PROJECT_ID}" >/dev/null 2>&1 || true

    local line value target found_firebase=""
    while IFS= read -r line; do
        # Skip comments and empty lines
        if [[ "$line" =~ ^# ]] || [[ -z "$line" ]]; then
            continue
        fi
        target=""
        for name in "${SENSITIVE_ENV_NAMES[@]}"; do
            if [[ "$line" =~ ^${name}= ]]; then
                target="${name}"
            fi
        done
        # Alias retrocompatible: FIREBASE_SERVICE_ACCOUNT → secreto FIREBASE_CREDENTIALS
        if [[ "$line" =~ ^FIREBASE_SERVICE_ACCOUNT= ]]; then
            target="FIREBASE_CREDENTIALS"
            log_warn "FIREBASE_SERVICE_ACCOUNT detectado: guardado como secreto FIREBASE_CREDENTIALS (renombra la variable en ${env_file} para el nombre canónico)."
        fi
        if [ -n "${target}" ]; then
            value="${line#*=}"
            if [ -z "${value}" ]; then
                log_warn "Variable ${target} vacía en ${env_file} — omitida."
                continue
            fi
            store_secret_version "${target}" "${value}"
            if [ "${target}" = "FIREBASE_CREDENTIALS" ]; then
                found_firebase=1
            fi
        fi
    done < "${env_file}"

    if [ -z "${found_firebase}" ]; then
        log_warn "FIREBASE_CREDENTIALS no está definido en ${env_file} (ni como FIREBASE_SERVICE_ACCOUNT). El secreto NO se actualizará; si no existe en Secret Manager, el deploy se abortará."
    fi
}

# Verifica que el secreto obligatorio exista. RESEND_API_KEY es opcional
# (EmailService cae a modo mock si no está configurado).
ensure_secrets_exist() {
    if ! gcloud secrets describe "FIREBASE_CREDENTIALS" --project "${PROJECT_ID}" &>/dev/null; then
        log_error "Secret 'FIREBASE_CREDENTIALS' does not exist in Secret Manager."
        log_info "Create it with: $0 secrets <env_file>  (o: gcloud secrets create FIREBASE_CREDENTIALS)"
        exit 1
    fi
}

# ── Cloud Run ─────────────────────────────────────────────────
deploy_to_cloud_run() {
    local image_tag="${1:-latest}"
    local full_image="${IMAGE_NAME}:${image_tag}"
    local env_file="${2:-.env}"

    log_info "Deploying to Cloud Run..."

    # Check if Artifact Registry repo exists
    if ! gcloud artifacts repositories describe raices --location="${REGION}" &>/dev/null; then
        log_warn "Artifact Registry repo 'raices' not found. Creating..."
        gcloud artifacts repositories create raices \
            --repository-format=docker \
            --location="${REGION}" \
            --description="Raíces Docker images"
    fi

    # Sincroniza secretos desde .env (si existe)
    sync_secrets_from_env_file "${env_file}"

    # Abortar si falta algún secreto (evita desplegar con referencias rotas)
    ensure_secrets_exist

    # Build deployment command
    local deploy_cmd="gcloud run deploy ${SERVICE_NAME}"
    deploy_cmd+=" --image=${full_image}"
    deploy_cmd+=" --region=${REGION}"
    deploy_cmd+=" --platform=managed"
    deploy_cmd+=" --allow-unauthenticated"
    deploy_cmd+=" --port=7000"
    deploy_cmd+=" --memory=512Mi"
    deploy_cmd+=" --cpu=1"
    deploy_cmd+=" --min-instances=0"
    deploy_cmd+=" --max-instances=10"
    deploy_cmd+=" --timeout=300"
    deploy_cmd+=" --service-account=${FIREBASE_SA}"

    # Variables NO sensibles como env vars directas (base mínima).
    # FIREBASE_PROJECT_ID y CORS_ORIGINS se agregan aquí (o desde el .env);
    # el loop de abajo los omite para evitar flags duplicados.
    local env_vars="NODE_ENV=production"
    env_vars+=",FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID:-${PROJECT_ID}}"
    if [ -n "${CORS_ORIGINS:-}" ]; then
        env_vars+=",CORS_ORIGINS=${CORS_ORIGINS}"
    fi

    # Agregar variables no sensibles adicionales desde el archivo .env si existe
    if [ -f "${env_file}" ]; then
        while IFS= read -r line; do
            if [[ ! "$line" =~ ^# ]] && [[ -n "$line" ]]; then
                local skip=0
                # Skip PORT (reservado por Cloud Run), NODE_ENV (ya fijada a production),
                # GOOGLE_APPLICATION_CREDENTIALS (ruta local inexistente en Cloud Run),
                # secretos y vars ya base
                if [[ "$line" =~ ^PORT= ]] || [[ "$line" =~ ^NODE_ENV= ]] || [[ "$line" =~ ^FIREBASE_PROJECT_ID= ]] || [[ "$line" =~ ^CORS_ORIGINS= ]] || [[ "$line" =~ ^GOOGLE_APPLICATION_CREDENTIALS= ]]; then
                    skip=1
                fi
                for name in "${SENSITIVE_ENV_NAMES[@]}"; do
                    if [[ "$line" =~ ^${name}= ]]; then
                        skip=1
                    fi
                done
                # Alias del secreto de Firebase: solo vía Secret Manager, nunca
                # como env var directa (evita filtrar el JSON en --set-env-vars).
                if [[ "$line" =~ ^FIREBASE_SERVICE_ACCOUNT= ]]; then
                    skip=1
                fi
                if [[ "$skip" -eq 1 ]]; then
                    continue
                fi
                env_vars+=",${line}"
            fi
        done < "${env_file}"
    fi
    deploy_cmd+=" --set-env-vars=${env_vars}"

    # Secretos montados desde Secret Manager (los valores nunca van en la imagen).
    # Solo se montan los secretos que existen (RESEND_API_KEY es opcional).
    local secrets_ref=""
    for name in "${SENSITIVE_ENV_NAMES[@]}"; do
        if gcloud secrets describe "${name}" --project "${PROJECT_ID}" &>/dev/null; then
            if [ -n "${secrets_ref}" ]; then
                secrets_ref+=","
            fi
            secrets_ref+="${name}=projects/${PROJECT_ID}/secrets/${name}:latest"
        else
            log_warn "Secret '${name}' no existe — se omitirá del --set-secrets."
        fi
    done
    deploy_cmd+=" --set-secrets=${secrets_ref}"

    # Execute deployment
    log_info "Running: ${deploy_cmd}"
    eval "${deploy_cmd}"

    log_info "Deployment completed successfully ✓"
}

get_service_url() {
    log_info "Fetching service URL..."
    gcloud run services describe "${SERVICE_NAME}" \
        --region="${REGION}" \
        --format="value(status.url)"
}

print_summary() {
    local url=$(get_service_url)

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Deployment Summary${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo -e "Service:  ${SERVICE_NAME}"
    echo -e "Region:   ${REGION}"
    echo -e "Image:    ${IMAGE_NAME}:${1:-latest}"
    echo -e "URL:      ${url}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "Swagger Docs: ${url}/docs"
    echo ""
}

# ============================================
# Main Script
# ============================================
main() {
    local action="${1:-deploy}"
    local image_tag="${2:-latest}"
    local env_file="${3:-.env}"

    case "${action}" in
        build)
            check_prerequisites
            authenticate_gcp
            build_and_push_image "${image_tag}"
            ;;
        deploy)
            check_prerequisites
            authenticate_gcp
            deploy_firestore_indexes
            build_and_push_image "${image_tag}"
            deploy_to_cloud_run "${image_tag}" "${env_file}"
            print_summary "${image_tag}"
            ;;
        secrets)
            # Solo sincroniza secretos (sin desplegar). El archivo es el 2º
            # argumento (no hay image_tag en esta acción).
            local secrets_env_file="${2:-.env}"
            if ! command -v gcloud &> /dev/null; then
                log_error "gcloud CLI is not installed. Install from: https://cloud.google.com/sdk/docs/install"
                exit 1
            fi
            if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q .; then
                log_error "Not authenticated with gcloud. Run: gcloud auth login"
                exit 1
            fi
            sync_secrets_from_env_file "${secrets_env_file}"
            log_info "Secrets synced ✓"
            ;;
        indexes)
            deploy_firestore_indexes
            ;;
        url)
            get_service_url
            ;;
        logs)
            log_info "Fetching logs..."
            gcloud run services logs read "${SERVICE_NAME}" \
                --region="${REGION}" \
                --limit=50
            ;;
        *)
            echo "Usage: $0 {build|deploy|indexes|secrets|url|logs} [image_tag] [env_file]"
            echo ""
            echo "Commands:"
            echo "  build   - Build and push Docker image"
            echo "  deploy  - Sync secrets + deploy Firestore indexes + build, push, and deploy to Cloud Run"
            echo "  secrets - Sync secrets from the env file to GCP Secret Manager"
            echo "  indexes - Deploy only Firestore composite indexes"
            echo "  url     - Get the service URL"
            echo "  logs    - View recent logs"
            echo ""
            echo "Examples:"
            echo "  $0 deploy"
            echo "  $0 deploy v1.0.0"
            echo "  $0 deploy latest .env"
            echo "  $0 secrets .env"
            exit 1
            ;;
    esac
}

main "$@"
