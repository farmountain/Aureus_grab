#!/bin/bash

# Aureus Sentinel Deployment Script
# Supports Docker Compose and Kubernetes deployments
# Usage: ./deploy.sh [environment] [platform]
# Example: ./deploy.sh staging kubernetes

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="${1:-dev}"
PLATFORM="${2:-docker}"
NAMESPACE="aureus"
HEALTH_CHECK_TIMEOUT=300
HEALTH_CHECK_INTERVAL=5

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if [ "$PLATFORM" = "docker" ]; then
        if ! command -v docker &> /dev/null; then
            log_error "Docker is not installed"
            exit 1
        fi
        
        if ! command -v docker-compose &> /dev/null; then
            log_error "Docker Compose is not installed"
            exit 1
        fi
        
        log_success "Docker and Docker Compose found"
    elif [ "$PLATFORM" = "kubernetes" ] || [ "$PLATFORM" = "k8s" ]; then
        if ! command -v kubectl &> /dev/null; then
            log_error "kubectl is not installed"
            exit 1
        fi
        
        log_success "kubectl found"
    else
        log_error "Unknown platform: $PLATFORM. Use 'docker' or 'kubernetes'"
        exit 1
    fi
}

check_environment() {
    log_info "Validating environment: $ENVIRONMENT"
    
    if [ "$ENVIRONMENT" != "dev" ] && [ "$ENVIRONMENT" != "staging" ] && [ "$ENVIRONMENT" != "production" ]; then
        log_error "Invalid environment: $ENVIRONMENT. Use 'dev', 'staging', or 'production'"
        exit 1
    fi
    
    if [ "$PLATFORM" = "docker" ]; then
        if [ ! -f ".env" ]; then
            log_warning ".env file not found, creating from template..."
            if [ -f ".env.full-stack.example" ]; then
                cp .env.full-stack.example .env
                log_warning "Please edit .env file with your configuration before deploying"
                exit 1
            else
                log_error ".env.full-stack.example not found"
                exit 1
            fi
        fi
    fi
    
    log_success "Environment validated: $ENVIRONMENT"
}

deploy_docker() {
    log_info "Deploying to Docker Compose ($ENVIRONMENT environment)..."
    
    # Set compose file based on environment
    COMPOSE_FILE="docker-compose-full.yml"
    
    if [ "$ENVIRONMENT" = "dev" ]; then
        log_info "Starting services with dev profile..."
        docker-compose -f "$COMPOSE_FILE" --profile dev up -d
    else
        log_info "Starting services..."
        docker-compose -f "$COMPOSE_FILE" up -d
    fi
    
    log_success "Services started"
}

deploy_kubernetes() {
    log_info "Deploying to Kubernetes ($ENVIRONMENT environment)..."
    
    # Create namespace if it doesn't exist
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_info "Creating namespace: $NAMESPACE"
        kubectl create namespace "$NAMESPACE"
    fi
    
    # Check for secrets
    if ! kubectl get secret postgres-secrets -n "$NAMESPACE" &> /dev/null; then
        log_warning "postgres-secrets not found. Creating with default values..."
        kubectl create secret generic postgres-secrets \
            --from-literal=password='changeme' \
            -n "$NAMESPACE"
        log_warning "Please update postgres-secrets with secure values"
    fi
    
    if ! kubectl get secret bridge-secrets -n "$NAMESPACE" &> /dev/null; then
        log_warning "bridge-secrets not found. Creating with default values..."
        kubectl create secret generic bridge-secrets \
            --from-literal=api-key='changeme' \
            --from-literal=jwt-secret='changeme' \
            -n "$NAMESPACE"
        log_warning "Please update bridge-secrets with secure values"
    fi
    
    if ! kubectl get secret openclaw-secrets -n "$NAMESPACE" &> /dev/null; then
        log_warning "openclaw-secrets not found. Creating with default values..."
        kubectl create secret generic openclaw-secrets \
            --from-literal=telegram-bot-token='changeme' \
            --from-literal=discord-bot-token='changeme' \
            -n "$NAMESPACE"
        log_warning "Please update openclaw-secrets with secure values"
    fi
    
    # Apply manifests
    log_info "Applying Kubernetes manifests..."
    kubectl apply -f k8s/ -n "$NAMESPACE"
    
    # Wait for rollout
    log_info "Waiting for deployments to roll out..."
    kubectl rollout status deployment/bridge -n "$NAMESPACE" --timeout=300s || true
    kubectl rollout status deployment/aureus-os -n "$NAMESPACE" --timeout=300s || true
    kubectl rollout status deployment/openclaw -n "$NAMESPACE" --timeout=300s || true
    
    log_success "Kubernetes deployment completed"
}

check_health_docker() {
    log_info "Checking service health (Docker)..."
    
    local services=("bridge:3000" "aureus-os:5000" "openclaw:8080")
    local timeout=$HEALTH_CHECK_TIMEOUT
    local interval=$HEALTH_CHECK_INTERVAL
    local elapsed=0
    
    while [ $elapsed -lt $timeout ]; do
        local all_healthy=true
        
        for service in "${services[@]}"; do
            IFS=':' read -r name port <<< "$service"
            
            if curl -sf "http://localhost:$port/health" > /dev/null 2>&1 || \
               curl -sf "http://localhost:$port/api/health" > /dev/null 2>&1; then
                log_success "$name is healthy"
            else
                all_healthy=false
                log_warning "$name is not ready yet..."
            fi
        done
        
        if [ "$all_healthy" = true ]; then
            log_success "All services are healthy"
            return 0
        fi
        
        sleep $interval
        elapsed=$((elapsed + interval))
    done
    
    log_error "Health check timeout after ${timeout}s"
    return 1
}

check_health_kubernetes() {
    log_info "Checking service health (Kubernetes)..."
    
    local deployments=("bridge" "aureus-os" "openclaw")
    local timeout=$HEALTH_CHECK_TIMEOUT
    local interval=$HEALTH_CHECK_INTERVAL
    local elapsed=0
    
    while [ $elapsed -lt $timeout ]; do
        local all_ready=true
        
        for deployment in "${deployments[@]}"; do
            local ready=$(kubectl get deployment "$deployment" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
            local desired=$(kubectl get deployment "$deployment" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")
            
            if [ "$ready" = "$desired" ] && [ "$ready" != "0" ]; then
                log_success "$deployment is ready ($ready/$desired replicas)"
            else
                all_ready=false
                log_warning "$deployment is not ready ($ready/$desired replicas)"
            fi
        done
        
        if [ "$all_ready" = true ]; then
            log_success "All deployments are ready"
            return 0
        fi
        
        sleep $interval
        elapsed=$((elapsed + interval))
    done
    
    log_error "Health check timeout after ${timeout}s"
    return 1
}

show_access_info_docker() {
    echo ""
    log_info "==================== Access Information ===================="
    echo ""
    echo -e "${GREEN}OpenClaw:${NC}     http://localhost:8080"
    echo -e "${GREEN}Bridge:${NC}       http://localhost:3000"
    echo -e "${GREEN}Aureus OS:${NC}    http://localhost:5000"
    echo ""
    echo -e "${BLUE}Monitoring:${NC}"
    echo -e "${GREEN}Prometheus:${NC}   http://localhost:9090"
    echo -e "${GREEN}Grafana:${NC}      http://localhost:3001 (admin/admin)"
    echo ""
    if [ "$ENVIRONMENT" = "dev" ]; then
        echo -e "${BLUE}Dev Tools:${NC}"
        echo -e "${GREEN}pgAdmin:${NC}      http://localhost:5050"
        echo -e "${GREEN}Redis:${NC}        http://localhost:8082"
    fi
    echo ""
    log_info "============================================================"
    echo ""
}

show_access_info_kubernetes() {
    echo ""
    log_info "==================== Access Information ===================="
    echo ""
    echo -e "${BLUE}To access services, use port forwarding:${NC}"
    echo ""
    echo -e "kubectl port-forward -n $NAMESPACE svc/openclaw-service 8080:8080"
    echo -e "kubectl port-forward -n $NAMESPACE svc/bridge-service 3000:3000"
    echo -e "kubectl port-forward -n $NAMESPACE svc/aureus-os-service 5000:5000"
    echo ""
    echo -e "${BLUE}View logs:${NC}"
    echo ""
    echo -e "kubectl logs -n $NAMESPACE -l app=openclaw -f"
    echo -e "kubectl logs -n $NAMESPACE -l app=bridge -f"
    echo -e "kubectl logs -n $NAMESPACE -l app=aureus-os -f"
    echo ""
    echo -e "${BLUE}Check status:${NC}"
    echo ""
    echo -e "kubectl get pods -n $NAMESPACE"
    echo -e "kubectl get svc -n $NAMESPACE"
    echo ""
    log_info "============================================================"
    echo ""
}

rollback_docker() {
    log_warning "Rolling back Docker deployment..."
    docker-compose -f docker-compose-full.yml down
    log_success "Rollback complete"
}

rollback_kubernetes() {
    log_warning "Rolling back Kubernetes deployment..."
    
    kubectl rollout undo deployment/bridge -n "$NAMESPACE" || true
    kubectl rollout undo deployment/aureus-os -n "$NAMESPACE" || true
    kubectl rollout undo deployment/openclaw -n "$NAMESPACE" || true
    
    log_success "Rollback initiated. Check status with: kubectl get pods -n $NAMESPACE"
}

main() {
    echo ""
    log_info "=========================================="
    log_info "Aureus Sentinel Deployment"
    log_info "=========================================="
    log_info "Environment: $ENVIRONMENT"
    log_info "Platform: $PLATFORM"
    log_info "=========================================="
    echo ""
    
    check_prerequisites
    check_environment
    
    if [ "$PLATFORM" = "docker" ]; then
        deploy_docker
        
        log_info "Waiting for services to start..."
        sleep 10
        
        if check_health_docker; then
            show_access_info_docker
            log_success "Deployment successful!"
            exit 0
        else
            log_error "Health checks failed. Rolling back..."
            rollback_docker
            exit 1
        fi
    elif [ "$PLATFORM" = "kubernetes" ] || [ "$PLATFORM" = "k8s" ]; then
        deploy_kubernetes
        
        if check_health_kubernetes; then
            show_access_info_kubernetes
            log_success "Deployment successful!"
            exit 0
        else
            log_error "Health checks failed. Check logs with:"
            log_error "kubectl logs -n $NAMESPACE -l app=bridge"
            log_error "kubectl logs -n $NAMESPACE -l app=aureus-os"
            log_error "kubectl logs -n $NAMESPACE -l app=openclaw"
            log_warning "To rollback, run: kubectl rollout undo deployment/<name> -n $NAMESPACE"
            exit 1
        fi
    fi
}

# Handle Ctrl+C
trap 'log_warning "Deployment interrupted by user"; exit 130' INT

# Run main
main
