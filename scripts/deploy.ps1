# Aureus Sentinel Deployment Script (PowerShell)
# Supports Docker Compose and Kubernetes deployments
# Usage: .\deploy.ps1 -Environment dev -Platform docker
# Example: .\deploy.ps1 -Environment staging -Platform kubernetes

param(
    [Parameter(Position=0)]
    [ValidateSet('dev', 'staging', 'production')]
    [string]$Environment = 'dev',
    
    [Parameter(Position=1)]
    [ValidateSet('docker', 'kubernetes', 'k8s')]
    [string]$Platform = 'docker'
)

# Configuration
$Namespace = 'aureus'
$HealthCheckTimeout = 300
$HealthCheckInterval = 5

# Functions
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-ErrorMessage {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Test-Prerequisites {
    Write-Info "Checking prerequisites..."
    
    if ($Platform -eq 'docker') {
        $docker = Get-Command docker -ErrorAction SilentlyContinue
        if (-not $docker) {
            Write-ErrorMessage "Docker is not installed"
            exit 1
        }
        
        $dockerCompose = Get-Command docker-compose -ErrorAction SilentlyContinue
        if (-not $dockerCompose) {
            Write-ErrorMessage "Docker Compose is not installed"
            exit 1
        }
        
        Write-Success "Docker and Docker Compose found"
    }
    elseif ($Platform -in @('kubernetes', 'k8s')) {
        $kubectl = Get-Command kubectl -ErrorAction SilentlyContinue
        if (-not $kubectl) {
            Write-ErrorMessage "kubectl is not installed"
            exit 1
        }
        
        Write-Success "kubectl found"
    }
}

function Test-EnvironmentConfig {
    Write-Info "Validating environment: $Environment"
    
    if ($Platform -eq 'docker') {
        if (-not (Test-Path ".env")) {
            Write-Warning ".env file not found, creating from template..."
            if (Test-Path ".env.full-stack.example") {
                Copy-Item ".env.full-stack.example" ".env"
                Write-Warning "Please edit .env file with your configuration before deploying"
                exit 1
            }
            else {
                Write-ErrorMessage ".env.full-stack.example not found"
                exit 1
            }
        }
    }
    
    Write-Success "Environment validated: $Environment"
}

function Deploy-Docker {
    Write-Info "Deploying to Docker Compose ($Environment environment)..."
    
    $composeFile = "docker-compose-full.yml"
    
    if ($Environment -eq 'dev') {
        Write-Info "Starting services with dev profile..."
        docker-compose -f $composeFile --profile dev up -d
    }
    else {
        Write-Info "Starting services..."
        docker-compose -f $composeFile up -d
    }
    
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMessage "Docker Compose deployment failed"
        exit 1
    }
    
    Write-Success "Services started"
}

function Deploy-Kubernetes {
    Write-Info "Deploying to Kubernetes ($Environment environment)..."
    
    # Create namespace if it doesn't exist
    $namespaceExists = kubectl get namespace $Namespace 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Info "Creating namespace: $Namespace"
        kubectl create namespace $Namespace
    }
    
    # Check for secrets
    $postgresSecret = kubectl get secret postgres-secrets -n $Namespace 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "postgres-secrets not found. Creating with default values..."
        kubectl create secret generic postgres-secrets `
            --from-literal=password='changeme' `
            -n $Namespace
        Write-Warning "Please update postgres-secrets with secure values"
    }
    
    $bridgeSecret = kubectl get secret bridge-secrets -n $Namespace 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "bridge-secrets not found. Creating with default values..."
        kubectl create secret generic bridge-secrets `
            --from-literal=api-key='changeme' `
            --from-literal=jwt-secret='changeme' `
            -n $Namespace
        Write-Warning "Please update bridge-secrets with secure values"
    }
    
    $openclawSecret = kubectl get secret openclaw-secrets -n $Namespace 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "openclaw-secrets not found. Creating with default values..."
        kubectl create secret generic openclaw-secrets `
            --from-literal=telegram-bot-token='changeme' `
            --from-literal=discord-bot-token='changeme' `
            -n $Namespace
        Write-Warning "Please update openclaw-secrets with secure values"
    }
    
    # Apply manifests
    Write-Info "Applying Kubernetes manifests..."
    kubectl apply -f k8s/ -n $Namespace
    
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMessage "Failed to apply Kubernetes manifests"
        exit 1
    }
    
    # Wait for rollout
    Write-Info "Waiting for deployments to roll out..."
    kubectl rollout status deployment/bridge -n $Namespace --timeout=300s
    kubectl rollout status deployment/aureus-os -n $Namespace --timeout=300s
    kubectl rollout status deployment/openclaw -n $Namespace --timeout=300s
    
    Write-Success "Kubernetes deployment completed"
}

function Test-HealthDocker {
    Write-Info "Checking service health (Docker)..."
    
    $services = @(
        @{Name='bridge'; Port=3000},
        @{Name='aureus-os'; Port=5000},
        @{Name='openclaw'; Port=8080}
    )
    
    $elapsed = 0
    
    while ($elapsed -lt $HealthCheckTimeout) {
        $allHealthy = $true
        
        foreach ($service in $services) {
            $name = $service.Name
            $port = $service.Port
            
            try {
                $response = Invoke-WebRequest -Uri "http://localhost:$port/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
                if ($response.StatusCode -eq 200) {
                    Write-Success "$name is healthy"
                    continue
                }
            }
            catch {}
            
            try {
                $response = Invoke-WebRequest -Uri "http://localhost:$port/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
                if ($response.StatusCode -eq 200) {
                    Write-Success "$name is healthy"
                    continue
                }
            }
            catch {}
            
            $allHealthy = $false
            Write-Warning "$name is not ready yet..."
        }
        
        if ($allHealthy) {
            Write-Success "All services are healthy"
            return $true
        }
        
        Start-Sleep -Seconds $HealthCheckInterval
        $elapsed += $HealthCheckInterval
    }
    
    Write-ErrorMessage "Health check timeout after ${HealthCheckTimeout}s"
    return $false
}

function Test-HealthKubernetes {
    Write-Info "Checking service health (Kubernetes)..."
    
    $deployments = @('bridge', 'aureus-os', 'openclaw')
    $elapsed = 0
    
    while ($elapsed -lt $HealthCheckTimeout) {
        $allReady = $true
        
        foreach ($deployment in $deployments) {
            $ready = kubectl get deployment $deployment -n $Namespace -o jsonpath='{.status.readyReplicas}' 2>$null
            $desired = kubectl get deployment $deployment -n $Namespace -o jsonpath='{.spec.replicas}' 2>$null
            
            if (-not $ready) { $ready = 0 }
            if (-not $desired) { $desired = 0 }
            
            if (($ready -eq $desired) -and ($ready -ne 0)) {
                Write-Success "$deployment is ready ($ready/$desired replicas)"
            }
            else {
                $allReady = $false
                Write-Warning "$deployment is not ready ($ready/$desired replicas)"
            }
        }
        
        if ($allReady) {
            Write-Success "All deployments are ready"
            return $true
        }
        
        Start-Sleep -Seconds $HealthCheckInterval
        $elapsed += $HealthCheckInterval
    }
    
    Write-ErrorMessage "Health check timeout after ${HealthCheckTimeout}s"
    return $false
}

function Show-AccessInfoDocker {
    Write-Host ""
    Write-Info "==================== Access Information ===================="
    Write-Host ""
    Write-Host "OpenClaw:     " -NoNewline; Write-Host "http://localhost:8080" -ForegroundColor Green
    Write-Host "Bridge:       " -NoNewline; Write-Host "http://localhost:3000" -ForegroundColor Green
    Write-Host "Aureus OS:    " -NoNewline; Write-Host "http://localhost:5000" -ForegroundColor Green
    Write-Host ""
    Write-Host "Monitoring:" -ForegroundColor Blue
    Write-Host "Prometheus:   " -NoNewline; Write-Host "http://localhost:9090" -ForegroundColor Green
    Write-Host "Grafana:      " -NoNewline; Write-Host "http://localhost:3001 (admin/admin)" -ForegroundColor Green
    Write-Host ""
    
    if ($Environment -eq 'dev') {
        Write-Host "Dev Tools:" -ForegroundColor Blue
        Write-Host "pgAdmin:      " -NoNewline; Write-Host "http://localhost:5050" -ForegroundColor Green
        Write-Host "Redis:        " -NoNewline; Write-Host "http://localhost:8082" -ForegroundColor Green
        Write-Host ""
    }
    
    Write-Info "============================================================"
    Write-Host ""
}

function Show-AccessInfoKubernetes {
    Write-Host ""
    Write-Info "==================== Access Information ===================="
    Write-Host ""
    Write-Host "To access services, use port forwarding:" -ForegroundColor Blue
    Write-Host ""
    Write-Host "kubectl port-forward -n $Namespace svc/openclaw-service 8080:8080" -ForegroundColor Gray
    Write-Host "kubectl port-forward -n $Namespace svc/bridge-service 3000:3000" -ForegroundColor Gray
    Write-Host "kubectl port-forward -n $Namespace svc/aureus-os-service 5000:5000" -ForegroundColor Gray
    Write-Host ""
    Write-Host "View logs:" -ForegroundColor Blue
    Write-Host ""
    Write-Host "kubectl logs -n $Namespace -l app=openclaw -f" -ForegroundColor Gray
    Write-Host "kubectl logs -n $Namespace -l app=bridge -f" -ForegroundColor Gray
    Write-Host "kubectl logs -n $Namespace -l app=aureus-os -f" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Check status:" -ForegroundColor Blue
    Write-Host ""
    Write-Host "kubectl get pods -n $Namespace" -ForegroundColor Gray
    Write-Host "kubectl get svc -n $Namespace" -ForegroundColor Gray
    Write-Host ""
    Write-Info "============================================================"
    Write-Host ""
}

function Invoke-RollbackDocker {
    Write-Warning "Rolling back Docker deployment..."
    docker-compose -f docker-compose-full.yml down
    Write-Success "Rollback complete"
}

function Invoke-RollbackKubernetes {
    Write-Warning "Rolling back Kubernetes deployment..."
    
    kubectl rollout undo deployment/bridge -n $Namespace 2>$null
    kubectl rollout undo deployment/aureus-os -n $Namespace 2>$null
    kubectl rollout undo deployment/openclaw -n $Namespace 2>$null
    
    Write-Success "Rollback initiated. Check status with: kubectl get pods -n $Namespace"
}

# Main script
try {
    Write-Host ""
    Write-Info "=========================================="
    Write-Info "Aureus Sentinel Deployment"
    Write-Info "=========================================="
    Write-Info "Environment: $Environment"
    Write-Info "Platform: $Platform"
    Write-Info "=========================================="
    Write-Host ""
    
    Test-Prerequisites
    Test-EnvironmentConfig
    
    if ($Platform -eq 'docker') {
        Deploy-Docker
        
        Write-Info "Waiting for services to start..."
        Start-Sleep -Seconds 10
        
        if (Test-HealthDocker) {
            Show-AccessInfoDocker
            Write-Success "Deployment successful!"
            exit 0
        }
        else {
            Write-ErrorMessage "Health checks failed. Rolling back..."
            Invoke-RollbackDocker
            exit 1
        }
    }
    elseif ($Platform -in @('kubernetes', 'k8s')) {
        Deploy-Kubernetes
        
        if (Test-HealthKubernetes) {
            Show-AccessInfoKubernetes
            Write-Success "Deployment successful!"
            exit 0
        }
        else {
            Write-ErrorMessage "Health checks failed. Check logs with:"
            Write-ErrorMessage "kubectl logs -n $Namespace -l app=bridge"
            Write-ErrorMessage "kubectl logs -n $Namespace -l app=aureus-os"
            Write-ErrorMessage "kubectl logs -n $Namespace -l app=openclaw"
            Write-Warning "To rollback, run: kubectl rollout undo deployment/<name> -n $Namespace"
            exit 1
        }
    }
}
catch {
    Write-ErrorMessage "Deployment failed: $_"
    exit 1
}
