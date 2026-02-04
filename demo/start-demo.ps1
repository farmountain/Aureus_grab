# Aureus Sentinel Demo - Quick Start Script (PowerShell)
# This script sets up and launches the complete Aureus Sentinel demo

$ErrorActionPreference = "Stop"

# Helper functions
function Write-Info {
    param($Message)
    Write-Host "ℹ $Message" -ForegroundColor Blue
}

function Write-Success {
    param($Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Error {
    param($Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Write-Warning {
    param($Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

# Banner
Write-Host @"

╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║         Aureus Sentinel End-to-End Demo Setup            ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

# Check prerequisites
Write-Info "Checking prerequisites..."

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker is not installed. Please install Docker Desktop first."
    exit 1
}
$dockerVersion = (docker --version) -replace 'Docker version ', ''
Write-Success "Docker: $dockerVersion"

if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    Write-Warning "docker-compose not found, trying docker compose..."
    try {
        docker compose version | Out-Null
        $DockerCompose = "docker compose"
        $composeVersion = (docker compose version) -replace 'Docker Compose version ', ''
        Write-Success "Docker Compose: $composeVersion"
    }
    catch {
        Write-Error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    }
}
else {
    $DockerCompose = "docker-compose"
    $composeVersion = (docker-compose --version) -replace 'docker-compose version ', ''
    Write-Success "Docker Compose: $composeVersion"
}

$NODE_AVAILABLE = $false
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = node --version
    Write-Success "Node.js: $nodeVersion"
    $NODE_AVAILABLE = $true
}
else {
    Write-Warning "Node.js not found. Demo client will not be available."
    Write-Warning "Install Node.js 18+ to run the interactive demo client."
}

Write-Host

# Stop any existing containers
Write-Info "Stopping any existing Aureus Sentinel containers..."
try {
    if ($DockerCompose -eq "docker compose") {
        docker compose -f docker-compose-full.yml down 2>$null
    }
    else {
        docker-compose -f docker-compose-full.yml down 2>$null
    }
}
catch {
    # Ignore errors if containers don't exist
}
Write-Success "Previous containers stopped"

Write-Host

# Build images
Write-Info "Building Docker images..."
Write-Host

Write-Info "Building Aureus Agentic OS..."
if ($DockerCompose -eq "docker compose") {
    docker compose -f docker-compose-full.yml build aureus-os
}
else {
    docker-compose -f docker-compose-full.yml build aureus-os
}
Write-Success "Aureus OS image built"

Write-Info "Building Bridge service..."
if ($DockerCompose -eq "docker compose") {
    docker compose -f docker-compose-full.yml build bridge
}
else {
    docker-compose -f docker-compose-full.yml build bridge
}
Write-Success "Bridge image built"

Write-Host

# Start services
Write-Info "Starting services (this may take 1-2 minutes)..."
Write-Host

if ($DockerCompose -eq "docker compose") {
    docker compose -f docker-compose-full.yml up -d
}
else {
    docker-compose -f docker-compose-full.yml up -d
}

Write-Host

# Wait for services to be healthy
Write-Info "Waiting for services to be healthy..."
Write-Host

$MAX_WAIT = 120
$ELAPSED = 0
$SERVICES = @("postgres", "redis", "bridge", "aureus-os")

while ($ELAPSED -lt $MAX_WAIT) {
    $ALL_HEALTHY = $true
    
    foreach ($service in $SERVICES) {
        try {
            if ($DockerCompose -eq "docker compose") {
                $containerId = docker compose -f docker-compose-full.yml ps -q $service 2>$null
            }
            else {
                $containerId = docker-compose -f docker-compose-full.yml ps -q $service 2>$null
            }
            
            if ($containerId) {
                $HEALTH = (docker inspect -f '{{.State.Health.Status}}' $containerId 2>$null)
                if ($HEALTH -ne "healthy") {
                    $ALL_HEALTHY = $false
                    break
                }
            }
            else {
                $ALL_HEALTHY = $false
                break
            }
        }
        catch {
            $ALL_HEALTHY = $false
            break
        }
    }
    
    if ($ALL_HEALTHY) {
        Write-Success "All services are healthy!"
        break
    }
    
    Start-Sleep -Seconds 5
    $ELAPSED += 5
    $statusMsg = "Still waiting... ($ELAPSED s / $MAX_WAIT s)"
    Write-Host "ℹ $statusMsg" -ForegroundColor Blue -NoNewline
    Write-Host "`r" -NoNewline
}

Write-Host

if ($ELAPSED -ge $MAX_WAIT) {
    Write-Error "Services did not become healthy within $MAX_WAIT seconds"
    Write-Host
    Write-Info "Check service status:"
    if ($DockerCompose -eq "docker compose") {
        docker compose -f docker-compose-full.yml ps
    }
    else {
        docker-compose -f docker-compose-full.yml ps
    }
    Write-Host
    Write-Info "View logs with: $DockerCompose -f docker-compose-full.yml logs -f"
    exit 1
}

Write-Host

# Display status
Write-Info "Services status:"
if ($DockerCompose -eq "docker compose") {
    docker compose -f docker-compose-full.yml ps
}
else {
    docker-compose -f docker-compose-full.yml ps
}

Write-Host
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "✓ Aureus Sentinel Demo is ready!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host

Write-Host "📊 Access Points:" -ForegroundColor Cyan
Write-Host
Write-Host "  • Bridge API:      http://localhost:3000"
Write-Host "  • Aureus OS API:   http://localhost:5000"
Write-Host "  • Grafana:         http://localhost:3001 (admin/admin)"
Write-Host "  • Prometheus:      http://localhost:9090"
Write-Host "  • PostgreSQL:      localhost:5432 (aureus/aureus_dev_password)"
Write-Host "  • Redis:           localhost:6379"
Write-Host

if ($NODE_AVAILABLE) {
    Write-Host "🚀 Run the Interactive Demo:" -ForegroundColor Cyan
    Write-Host
    Write-Host "  cd demo"
    Write-Host "  npm install"
    Write-Host "  npm run demo"
    Write-Host
}
else {
    Write-Warning "Node.js not available - install Node.js 18+ to run the interactive demo"
    Write-Host
}

Write-Host "📖 Quick Tests:" -ForegroundColor Cyan
Write-Host
Write-Host "  # Test Bridge health"
Write-Host "  curl http://localhost:3000/health"
Write-Host
Write-Host "  # Test Aureus OS health"
Write-Host "  curl http://localhost:5000/api/health"
Write-Host
Write-Host "  # Evaluate a policy"
Write-Host "  curl -X POST http://localhost:5000/api/policy/evaluate \"
Write-Host "    -H 'Content-Type: application/json' \"
Write-Host "    -d '{`"intent`": {`"action`": `"read_document`", `"user_id`": `"demo-user`"}}'"
Write-Host

Write-Host "📝 View Logs:" -ForegroundColor Cyan
Write-Host
Write-Host "  # All services"
Write-Host "  $DockerCompose -f docker-compose-full.yml logs -f"
Write-Host
Write-Host "  # Specific service"
Write-Host "  $DockerCompose -f docker-compose-full.yml logs -f bridge"
Write-Host

Write-Host "🛑 Stop Demo:" -ForegroundColor Cyan
Write-Host
Write-Host "  $DockerCompose -f docker-compose-full.yml down"
Write-Host

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
Write-Host "For more information, see demo/README.md" -ForegroundColor Blue
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
Write-Host
