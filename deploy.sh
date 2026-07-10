#!/bin/bash
set -euo pipefail

# ============================================
# Raíces Backend - GCP Cloud Run Deployment
# ============================================

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
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

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
    gcloud auth configure-docker --quiet
    gcloud config set project "${PROJECT_ID}"
    log_info "GCP authentication configured ✓"
}

build_and_push_image() {
    local tag="${1:-latest}"
    local full_image="${IMAGE_NAME}:${tag}"
    
    log_info "Building Docker image: ${full_image}..."
    docker build -t "${full_image}" .
    
    log_info "Pushing image to Google Container Registry..."
    docker push "${full_image}"
    
    log_info "Image pushed successfully ✓"
}

deploy_to_cloud_run() {
    local image_tag="${1:-latest}"
    local full_image="${IMAGE_NAME}:${image_tag}"
    local env_file="${2:-.env.production}"
    
    log_info "Deploying to Cloud Run..."
    
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
    
    # Add environment variables from .env file if it exists
    if [ -f "${env_file}" ]; then
        log_info "Loading environment variables from ${env_file}..."
        local env_vars=""
        while IFS= read -r line; do
            # Skip comments and empty lines
            if [[ ! "$line" =~ ^# ]] && [[ -n "$line" ]]; then
                if [ -n "${env_vars}" ]; then
                    env_vars+=","
                fi
                env_vars+="${line}"
            fi
        done < "${env_file}"
        if [ -n "${env_vars}" ]; then
            deploy_cmd+=" --set-env-vars=${env_vars}"
        fi
    fi
    
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
    local env_file="${3:-.env.production}"
    
    case "${action}" in
        build)
            check_prerequisites
            authenticate_gcp
            build_and_push_image "${image_tag}"
            ;;
        deploy)
            check_prerequisites
            authenticate_gcp
            build_and_push_image "${image_tag}"
            deploy_to_cloud_run "${image_tag}" "${env_file}"
            print_summary "${image_tag}"
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
            echo "Usage: $0 {build|deploy|url|logs} [image_tag] [env_file]"
            echo ""
            echo "Commands:"
            echo "  build   - Build and push Docker image"
            echo "  deploy  - Build, push, and deploy to Cloud Run"
            echo "  url     - Get the service URL"
            echo "  logs    - View recent logs"
            echo ""
            echo "Examples:"
            echo "  $0 deploy"
            echo "  $0 deploy v1.0.0"
            echo "  $0 deploy latest .env.production"
            exit 1
            ;;
    esac
}

main "$@"
