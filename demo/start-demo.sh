#!/bin/bash

# Aureus Sentinel Demo - Quick Start Script
# This script sets up and launches the complete Aureus Sentinel demo

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║         Aureus Sentinel End-to-End Demo Setup            ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo

# Function to print status messages
info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check prerequisites
info "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    error "Docker is not installed. Please install Docker first."
    exit 1
fi
success "Docker: $(docker --version | cut -d' ' -f3)"

if ! command -v docker-compose &> /dev/null; then
    warning "docker-compose not found, trying docker compose..."
    if ! docker compose version &> /dev/null; then
        error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    DOCKER_COMPOSE="docker compose"
    success "Docker Compose: $(docker compose version | cut -d' ' -f4)"
else
    DOCKER_COMPOSE="docker-compose"
    success "Docker Compose: $(docker-compose --version | cut -d' ' -f4)"
fi

if ! command -v node &> /dev/null; then
    warning "Node.js not found. Demo client will not be available."
    warning "Install Node.js 18+ to run the interactive demo client."
    NODE_AVAILABLE=false
else
    success "Node.js: $(node --version)"
    NODE_AVAILABLE=true
fi

echo

# Stop any existing containers
info "Stopping any existing Aureus Sentinel containers..."
$DOCKER_COMPOSE -f docker-compose-full.yml down 2>/dev/null || true
success "Previous containers stopped"

echo

# Build images
info "Building Docker images..."
echo

info "Building Aureus Agentic OS..."
$DOCKER_COMPOSE -f docker-compose-full.yml build aureus-os
success "Aureus OS image built"

info "Building Bridge service..."
$DOCKER_COMPOSE -f docker-compose-full.yml build bridge
success "Bridge image built"

echo

# Start services
info "Starting services (this may take 1-2 minutes)..."
echo

$DOCKER_COMPOSE -f docker-compose-full.yml up -d

echo

# Wait for services to be healthy
info "Waiting for services to be healthy..."
echo

MAX_WAIT=120
ELAPSED=0
SERVICES=("postgres" "redis" "bridge" "aureus-os")

while [ $ELAPSED -lt $MAX_WAIT ]; do
    ALL_HEALTHY=true
    
    for service in "${SERVICES[@]}"; do
        HEALTH=$($DOCKER_COMPOSE -f docker-compose-full.yml ps -q $service 2>/dev/null | xargs docker inspect -f '{{.State.Health.Status}}' 2>/dev/null || echo "starting")
        
        if [ "$HEALTH" != "healthy" ]; then
            ALL_HEALTHY=false
            break
        fi
    done
    
    if [ "$ALL_HEALTHY" = true ]; then
        success "All services are healthy!"
        break
    fi
    
    sleep 5
    ELAPSED=$((ELAPSED + 5))
    echo -ne "${BLUE}ℹ${NC} Still waiting... (${ELAPSED}s / ${MAX_WAIT}s)\r"
done

echo

if [ $ELAPSED -ge $MAX_WAIT ]; then
    error "Services did not become healthy within ${MAX_WAIT} seconds"
    echo
    info "Check service status:"
    $DOCKER_COMPOSE -f docker-compose-full.yml ps
    echo
    info "View logs with: $DOCKER_COMPOSE -f docker-compose-full.yml logs -f"
    exit 1
fi

echo

# Display status
info "Services status:"
$DOCKER_COMPOSE -f docker-compose-full.yml ps

echo
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Aureus Sentinel Demo is ready!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

echo -e "${CYAN}📊 Access Points:${NC}"
echo
echo "  • Bridge API:      http://localhost:3000"
echo "  • Aureus OS API:   http://localhost:5000"
echo "  • Grafana:         http://localhost:3001 (admin/admin)"
echo "  • Prometheus:      http://localhost:9090"
echo "  • PostgreSQL:      localhost:5432 (aureus/aureus_dev_password)"
echo "  • Redis:           localhost:6379"
echo

if [ "$NODE_AVAILABLE" = true ]; then
    echo -e "${CYAN}🚀 Run the Interactive Demo:${NC}"
    echo
    echo "  cd demo"
    echo "  npm install"
    echo "  npm run demo"
    echo
else
    warning "Node.js not available - install Node.js 18+ to run the interactive demo"
    echo
fi

echo -e "${CYAN}📖 Quick Tests:${NC}"
echo
echo "  # Test Bridge health"
echo "  curl http://localhost:3000/health"
echo
echo "  # Test Aureus OS health"
echo "  curl http://localhost:5000/api/health"
echo
echo "  # Evaluate a policy"
echo "  curl -X POST http://localhost:5000/api/policy/evaluate \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"intent\": {\"action\": \"read_document\", \"user_id\": \"demo-user\"}}'"
echo

echo -e "${CYAN}📝 View Logs:${NC}"
echo
echo "  # All services"
echo "  $DOCKER_COMPOSE -f docker-compose-full.yml logs -f"
echo
echo "  # Specific service"
echo "  $DOCKER_COMPOSE -f docker-compose-full.yml logs -f bridge"
echo

echo -e "${CYAN}🛑 Stop Demo:${NC}"
echo
echo "  $DOCKER_COMPOSE -f docker-compose-full.yml down"
echo

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}For more information, see demo/README.md${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo
