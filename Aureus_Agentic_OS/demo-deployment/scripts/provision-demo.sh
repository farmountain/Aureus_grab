#!/bin/bash

# Aureus Demo Provisioning Script
# Provisions demo environments for different personas

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
MODE="local"
PERSONA="all"
ENVIRONMENT="demo"
SKIP_BUILD=false
SKIP_MIGRATIONS=false

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Provision Aureus demo environments for different user personas.

OPTIONS:
    --mode MODE              Deployment mode: local, aws, azure, gcp, kubernetes (default: local)
    --persona PERSONA        Target persona: personal, developer, admin, devops, all (default: all)
    --environment ENV        Environment name (default: demo)
    --skip-build            Skip building Docker images
    --skip-migrations       Skip database migrations
    -h, --help              Display this help message

EXAMPLES:
    # Local deployment with all personas
    $0 --mode local --persona all

    # Deploy only developer persona to Kubernetes
    $0 --mode kubernetes --persona developer

    # AWS deployment for production
    $0 --mode aws --environment production

EOF
}

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --mode)
            MODE="$2"
            shift 2
            ;;
        --persona)
            PERSONA="$2"
            shift 2
            ;;
        --environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-migrations)
            SKIP_MIGRATIONS=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Validate inputs
if [[ ! "$MODE" =~ ^(local|aws|azure|gcp|kubernetes)$ ]]; then
    print_error "Invalid mode: $MODE"
    exit 1
fi

if [[ ! "$PERSONA" =~ ^(personal|developer|admin|devops|all)$ ]]; then
    print_error "Invalid persona: $PERSONA"
    exit 1
fi

print_info "Starting Aureus demo provisioning..."
print_info "Mode: $MODE"
print_info "Persona: $PERSONA"
print_info "Environment: $ENVIRONMENT"
echo ""

# =================================================================
# PRE-FLIGHT CHECKS
# =================================================================
print_info "Running pre-flight checks..."

# Check if running from correct directory
if [[ ! -f "docker-compose.yml" ]]; then
    print_error "docker-compose.yml not found. Please run this script from the demo-deployment directory."
    exit 1
fi

# Check for required tools
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

if [[ "$MODE" == "kubernetes" ]] && ! command -v kubectl &> /dev/null; then
    print_error "kubectl is not installed. Please install kubectl for Kubernetes deployment."
    exit 1
fi

if [[ "$MODE" =~ ^(aws|azure|gcp)$ ]] && ! command -v terraform &> /dev/null; then
    print_error "Terraform is not installed. Please install Terraform for cloud deployment."
    exit 1
fi

# Check for .env file
if [[ ! -f ".env" ]]; then
    print_warning ".env file not found. Creating from .env.example..."
    cp .env.example .env
    print_warning "Please edit .env with your configuration before proceeding."
    exit 1
fi

print_success "Pre-flight checks passed"
echo ""

# =================================================================
# BUILD DOCKER IMAGES (if not skipped)
# =================================================================
if [[ "$SKIP_BUILD" == false && "$MODE" == "local" ]]; then
    print_info "Building Docker images..."
    
    # Build Aureus console image
    cd ..  # Go to repo root
    docker build -t aureus/console:latest -f apps/console/Dockerfile .
    
    cd demo-deployment
    print_success "Docker images built successfully"
    echo ""
fi

# =================================================================
# SETUP DATABASE
# =================================================================
if [[ "$SKIP_MIGRATIONS" == false ]]; then
    print_info "Setting up database..."
    
    # Create database initialization scripts
    mkdir -p infrastructure/docker
    
    # Copy database schemas
    cat > infrastructure/docker/init-db.sql << 'EOF'
-- Aureus Demo Database Initialization
-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS aureus;

-- Set search path
SET search_path TO aureus, public;

-- Import kernel schema
\i ../../packages/kernel/src/db-schema.sql

-- Import memory schema
\i ../../packages/memory-hipcortex/src/db-schema.sql

COMMIT;
EOF
    
    print_success "Database setup complete"
    echo ""
fi

# =================================================================
# CREATE TENANT CONFIGURATIONS
# =================================================================
print_info "Creating tenant configurations..."

mkdir -p configurations

# Personal user configuration
if [[ "$PERSONA" == "personal" || "$PERSONA" == "all" ]]; then
    cat > configurations/personal-tenant.json << 'EOF'
{
  "tenantId": "personal-demo",
  "displayName": "Personal User Demo",
  "description": "Simplified experience for personal users exploring AI agents",
  "resources": {
    "maxAgents": 5,
    "maxExecutionsPerDay": 50,
    "maxMemoryMB": 100,
    "sandboxType": "simulation"
  },
  "features": {
    "agentStudio": "simplified",
    "advancedFeatures": false,
    "customPolicies": false,
    "sdkAccess": false,
    "multiTenantView": false
  },
  "policies": {
    "riskTier": "LOW",
    "requireApproval": false,
    "maxCostPerExecution": 0.10
  }
}
EOF
    print_success "Personal user configuration created"
fi

# Developer configuration
if [[ "$PERSONA" == "developer" || "$PERSONA" == "all" ]]; then
    cat > configurations/developer-tenant.json << 'EOF'
{
  "tenantId": "developer-demo",
  "displayName": "Developer Demo",
  "description": "Full-featured development environment for agent developers",
  "resources": {
    "maxAgents": 20,
    "maxExecutionsPerDay": 500,
    "maxMemoryMB": 1000,
    "sandboxType": "container",
    "sandboxCPU": "2000m",
    "sandboxMemory": "4Gi"
  },
  "features": {
    "agentStudio": "full",
    "advancedFeatures": true,
    "customPolicies": true,
    "sdkAccess": true,
    "apiDocs": true,
    "customTools": true,
    "versionControl": true
  },
  "policies": {
    "riskTier": "MEDIUM",
    "requireApproval": false,
    "maxCostPerExecution": 1.00
  }
}
EOF
    print_success "Developer configuration created"
fi

# Admin configuration
if [[ "$PERSONA" == "admin" || "$PERSONA" == "all" ]]; then
    cat > configurations/admin-tenant.json << 'EOF'
{
  "tenantId": "admin-demo",
  "displayName": "Administrator Demo",
  "description": "Admin control center for multi-tenant management",
  "resources": {
    "unlimited": true
  },
  "features": {
    "multiTenantView": true,
    "policyEditor": true,
    "auditLogs": true,
    "userManagement": true,
    "complianceReports": true,
    "systemHealth": true
  },
  "role": "administrator",
  "permissions": ["read", "write", "approve", "manage_users", "manage_policies"]
}
EOF
    print_success "Administrator configuration created"
fi

# DevOps configuration
if [[ "$PERSONA" == "devops" || "$PERSONA" == "all" ]]; then
    cat > configurations/devops-tenant.json << 'EOF'
{
  "tenantId": "devops-demo",
  "displayName": "DevOps Demo",
  "description": "Infrastructure playground for DevOps engineers",
  "resources": {
    "infrastructure": "dedicated",
    "kubernetes": true,
    "terraform": true
  },
  "features": {
    "infrastructureAccess": true,
    "cicdTemplates": true,
    "monitoringStack": true,
    "fullAccess": true,
    "backupRestore": true
  },
  "role": "devops",
  "permissions": ["read", "write", "deploy", "infrastructure"]
}
EOF
    print_success "DevOps configuration created"
fi

echo ""

# =================================================================
# DEPLOY BASED ON MODE
# =================================================================
case $MODE in
    local)
        print_info "Starting local deployment with Docker Compose..."
        
        # Start services
        docker-compose up -d
        
        # Wait for services to be healthy
        print_info "Waiting for services to start..."
        sleep 10
        
        # Check health
        MAX_RETRIES=30
        RETRY_COUNT=0
        until curl -sf http://localhost:3000/health > /dev/null || [ $RETRY_COUNT -eq $MAX_RETRIES ]; do
            echo -n "."
            sleep 2
            RETRY_COUNT=$((RETRY_COUNT+1))
        done
        echo ""
        
        if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
            print_error "Services failed to start. Check logs with: docker-compose logs"
            exit 1
        fi
        
        print_success "Services started successfully"
        ;;
        
    kubernetes)
        print_info "Deploying to Kubernetes..."
        
        # Apply Kubernetes manifests
        kubectl apply -f infrastructure/kubernetes/namespace.yaml
        kubectl apply -f infrastructure/kubernetes/configmap.yaml
        kubectl apply -f infrastructure/kubernetes/secrets.yaml
        kubectl apply -f infrastructure/kubernetes/postgres.yaml
        kubectl apply -f infrastructure/kubernetes/redis.yaml
        kubectl apply -f infrastructure/kubernetes/console.yaml
        kubectl apply -f infrastructure/kubernetes/monitoring.yaml
        
        # Wait for deployment
        kubectl wait --for=condition=available --timeout=300s deployment/aureus-console -n aureus-demo
        
        print_success "Kubernetes deployment complete"
        ;;
        
    aws|azure|gcp)
        print_info "Deploying to cloud provider: $MODE..."
        
        cd infrastructure/terraform/$MODE
        
        # Initialize Terraform
        terraform init
        
        # Apply configuration
        terraform apply -var="environment=$ENVIRONMENT" -auto-approve
        
        cd ../../..
        
        print_success "Cloud deployment complete"
        ;;
esac

echo ""

# =================================================================
# SETUP DEMO DATA
# =================================================================
print_info "Setting up demo data and scenarios..."

./scripts/setup-demo-data.sh --persona "$PERSONA"

print_success "Demo data setup complete"
echo ""

# =================================================================
# DISPLAY ACCESS INFORMATION
# =================================================================
print_success "====================================="
print_success "Aureus Demo Provisioning Complete!"
print_success "====================================="
echo ""
print_info "Access URLs:"

case $MODE in
    local)
        echo -e "  ${GREEN}Main Console:${NC}       http://localhost:3000"
        echo -e "  ${GREEN}Grafana Dashboard:${NC}  http://localhost:3001 (admin/demodemo)"
        echo -e "  ${GREEN}Prometheus:${NC}         http://localhost:9090"
        ;;
    kubernetes)
        INGRESS_IP=$(kubectl get ingress aureus-ingress -n aureus-demo -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
        echo -e "  ${GREEN}Main Console:${NC}       http://$INGRESS_IP"
        echo -e "  ${GREEN}Grafana Dashboard:${NC}  http://$INGRESS_IP/grafana"
        ;;
    aws|azure|gcp)
        echo -e "  ${GREEN}Console URL:${NC}        $(terraform output -raw console_url)"
        echo -e "  ${GREEN}Grafana URL:${NC}        $(terraform output -raw grafana_url)"
        ;;
esac

echo ""
print_info "Persona-Specific URLs:"

if [[ "$PERSONA" == "personal" || "$PERSONA" == "all" ]]; then
    echo -e "  ${BLUE}Personal Users:${NC}     http://localhost:3000/personal"
fi

if [[ "$PERSONA" == "developer" || "$PERSONA" == "all" ]]; then
    echo -e "  ${BLUE}Developers:${NC}         http://localhost:3000/developer"
fi

if [[ "$PERSONA" == "admin" || "$PERSONA" == "all" ]]; then
    echo -e "  ${BLUE}Administrators:${NC}     http://localhost:3000/admin"
fi

if [[ "$PERSONA" == "devops" || "$PERSONA" == "all" ]]; then
    echo -e "  ${BLUE}DevOps:${NC}             http://localhost:3000/devops"
fi

echo ""
print_info "Demo Credentials:"
echo -e "  ${YELLOW}Username:${NC} demo@aureus.io"
echo -e "  ${YELLOW}Password:${NC} AureusDemo2026!"

echo ""
print_info "Useful Commands:"
echo -e "  View logs:        docker-compose logs -f"
echo -e "  Stop services:    docker-compose down"
echo -e "  Restart services: docker-compose restart"
echo -e "  View health:      curl http://localhost:3000/health"

echo ""
print_success "Happy agent building! 🚀"
