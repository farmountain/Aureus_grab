# Aureus Demo Provisioning Script (PowerShell)
# Provisions demo environments for different personas

[CmdletBinding()]
param(
    [Parameter()]
    [ValidateSet('local', 'aws', 'azure', 'gcp', 'kubernetes')]
    [string]$Mode = 'local',
    
    [Parameter()]
    [ValidateSet('personal', 'developer', 'admin', 'devops', 'all')]
    [string]$Persona = 'all',
    
    [Parameter()]
    [string]$Environment = 'demo',
    
    [Parameter()]
    [switch]$SkipBuild,
    
    [Parameter()]
    [switch]$SkipMigrations
)

# Set error action preference
$ErrorActionPreference = "Stop"

# Function to print colored output
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

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Display banner
Write-Host ""
Write-Success "====================================="
Write-Success "Aureus Demo Provisioning (Windows)"
Write-Success "====================================="
Write-Host ""

Write-Info "Starting Aureus demo provisioning..."
Write-Info "Mode: $Mode"
Write-Info "Persona: $Persona"
Write-Info "Environment: $Environment"
Write-Host ""

# =================================================================
# PRE-FLIGHT CHECKS
# =================================================================
Write-Info "Running pre-flight checks..."

# Check if running from correct directory
if (-not (Test-Path "docker-compose.yml")) {
    Write-Error "docker-compose.yml not found. Please run this script from the demo-deployment directory."
    exit 1
}

# Check for Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker is not installed. Please install Docker Desktop first."
    Write-Info "Download from: https://www.docker.com/products/docker-desktop/"
    exit 1
}

# Check if Docker is running
try {
    docker ps | Out-Null
    Write-Success "Docker is running"
} catch {
    Write-Error "Docker is not running. Please start Docker Desktop."
    exit 1
}

# Check for .env file
if (-not (Test-Path ".env")) {
    Write-Warning ".env file not found. Creating from .env.example..."
    Copy-Item ".env.example" ".env"
    Write-Warning "Please edit .env with your configuration before proceeding."
    Write-Info "Opening .env in notepad..."
    notepad .env
    Write-Host ""
    Read-Host "Press Enter after you've configured .env to continue"
}

Write-Success "Pre-flight checks passed"
Write-Host ""

# =================================================================
# SETUP DIRECTORIES
# =================================================================
Write-Info "Creating required directories..."

$directories = @(
    "infrastructure\docker",
    "configurations",
    "logs",
    "var\run"
)

foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Info "Created directory: $dir"
    }
}

Write-Success "Directories created"
Write-Host ""

# =================================================================
# CREATE TENANT CONFIGURATIONS
# =================================================================
Write-Info "Creating tenant configurations..."

New-Item -ItemType Directory -Path "configurations" -Force | Out-Null

# Personal user configuration
if ($Persona -eq "personal" -or $Persona -eq "all") {
    $personalConfig = @{
        tenantId = "personal-demo"
        displayName = "Personal User Demo"
        description = "Simplified experience for personal users exploring AI agents"
        resources = @{
            maxAgents = 5
            maxExecutionsPerDay = 50
            maxMemoryMB = 100
            sandboxType = "simulation"
        }
        features = @{
            agentStudio = "simplified"
            advancedFeatures = $false
            customPolicies = $false
            sdkAccess = $false
            multiTenantView = $false
        }
        policies = @{
            riskTier = "LOW"
            requireApproval = $false
            maxCostPerExecution = 0.10
        }
    } | ConvertTo-Json -Depth 10
    
    $personalConfig | Out-File "configurations\personal-tenant.json" -Encoding UTF8
    Write-Success "Personal user configuration created"
}

# Developer configuration
if ($Persona -eq "developer" -or $Persona -eq "all") {
    $developerConfig = @{
        tenantId = "developer-demo"
        displayName = "Developer Demo"
        description = "Full-featured development environment for agent developers"
        resources = @{
            maxAgents = 20
            maxExecutionsPerDay = 500
            maxMemoryMB = 1000
            sandboxType = "container"
            sandboxCPU = "2000m"
            sandboxMemory = "4Gi"
        }
        features = @{
            agentStudio = "full"
            advancedFeatures = $true
            customPolicies = $true
            sdkAccess = $true
            apiDocs = $true
            customTools = $true
            versionControl = $true
        }
        policies = @{
            riskTier = "MEDIUM"
            requireApproval = $false
            maxCostPerExecution = 1.00
        }
    } | ConvertTo-Json -Depth 10
    
    $developerConfig | Out-File "configurations\developer-tenant.json" -Encoding UTF8
    Write-Success "Developer configuration created"
}

# Admin configuration
if ($Persona -eq "admin" -or $Persona -eq "all") {
    $adminConfig = @{
        tenantId = "admin-demo"
        displayName = "Administrator Demo"
        description = "Admin control center for multi-tenant management"
        resources = @{
            unlimited = $true
        }
        features = @{
            multiTenantView = $true
            policyEditor = $true
            auditLogs = $true
            userManagement = $true
            complianceReports = $true
            systemHealth = $true
        }
        role = "administrator"
        permissions = @("read", "write", "approve", "manage_users", "manage_policies")
    } | ConvertTo-Json -Depth 10
    
    $adminConfig | Out-File "configurations\admin-tenant.json" -Encoding UTF8
    Write-Success "Administrator configuration created"
}

# DevOps configuration
if ($Persona -eq "devops" -or $Persona -eq "all") {
    $devopsConfig = @{
        tenantId = "devops-demo"
        displayName = "DevOps Demo"
        description = "Infrastructure playground for DevOps engineers"
        resources = @{
            infrastructure = "dedicated"
            kubernetes = $true
            terraform = $true
        }
        features = @{
            infrastructureAccess = $true
            cicdTemplates = $true
            monitoringStack = $true
            fullAccess = $true
            backupRestore = $true
        }
        role = "devops"
        permissions = @("read", "write", "deploy", "infrastructure")
    } | ConvertTo-Json -Depth 10
    
    $devopsConfig | Out-File "configurations\devops-tenant.json" -Encoding UTF8
    Write-Success "DevOps configuration created"
}

Write-Host ""

# =================================================================
# DEPLOY BASED ON MODE
# =================================================================
switch ($Mode) {
    'local' {
        Write-Info "Starting local deployment with Docker Compose..."
        Write-Host ""
        
        # Pull latest images
        Write-Info "Pulling Docker images (this may take a few minutes)..."
        docker-compose pull
        
        # Start services
        Write-Info "Starting services..."
        docker-compose up -d
        
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to start services. Check logs with: docker-compose logs"
            exit 1
        }
        
        # Wait for services to be healthy
        Write-Info "Waiting for services to start (this may take up to 60 seconds)..."
        $maxRetries = 30
        $retryCount = 0
        $healthy = $false
        
        while (-not $healthy -and $retryCount -lt $maxRetries) {
            Start-Sleep -Seconds 2
            Write-Host "." -NoNewline
            
            try {
                $response = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
                if ($response.StatusCode -eq 200) {
                    $healthy = $true
                }
            } catch {
                # Continue waiting
            }
            
            $retryCount++
        }
        
        Write-Host ""
        
        if (-not $healthy) {
            Write-Error "Services failed to start. Check logs with: docker-compose logs console"
            Write-Info "You can also check individual service status with: docker-compose ps"
            exit 1
        }
        
        Write-Success "Services started successfully"
    }
    
    'kubernetes' {
        Write-Info "Deploying to Kubernetes..."
        
        if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
            Write-Error "kubectl is not installed. Please install kubectl first."
            exit 1
        }
        
        Write-Info "Applying Kubernetes manifests..."
        kubectl apply -f infrastructure\kubernetes\namespace.yaml
        kubectl apply -f infrastructure\kubernetes\configmap.yaml
        kubectl apply -f infrastructure\kubernetes\secrets.yaml
        kubectl apply -f infrastructure\kubernetes\postgres.yaml
        kubectl apply -f infrastructure\kubernetes\redis.yaml
        kubectl apply -f infrastructure\kubernetes\console.yaml
        kubectl apply -f infrastructure\kubernetes\monitoring.yaml
        
        Write-Info "Waiting for deployment..."
        kubectl wait --for=condition=available --timeout=300s deployment/aureus-console -n aureus-demo
        
        Write-Success "Kubernetes deployment complete"
    }
    
    'aws' {
        Write-Info "Deploying to AWS..."
        
        if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
            Write-Error "Terraform is not installed. Please install Terraform first."
            exit 1
        }
        
        Push-Location infrastructure\terraform\aws
        
        terraform init
        terraform apply -var="environment=$Environment" -auto-approve
        
        Pop-Location
        
        Write-Success "AWS deployment complete"
    }
    
    'azure' {
        Write-Info "Deploying to Azure..."
        
        if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
            Write-Error "Terraform is not installed. Please install Terraform first."
            exit 1
        }
        
        Push-Location infrastructure\terraform\azure
        
        terraform init
        terraform apply -var="environment=$Environment" -auto-approve
        
        Pop-Location
        
        Write-Success "Azure deployment complete"
    }
    
    'gcp' {
        Write-Info "Deploying to GCP..."
        
        if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
            Write-Error "Terraform is not installed. Please install Terraform first."
            exit 1
        }
        
        Push-Location infrastructure\terraform\gcp
        
        terraform init
        terraform apply -var="environment=$Environment" -auto-approve
        
        Pop-Location
        
        Write-Success "GCP deployment complete"
    }
}

Write-Host ""

# =================================================================
# DISPLAY ACCESS INFORMATION
# =================================================================
Write-Success "====================================="
Write-Success "Aureus Demo Provisioning Complete!"
Write-Success "====================================="
Write-Host ""

Write-Info "Access URLs:"

switch ($Mode) {
    'local' {
        Write-Host "  Main Console:       " -NoNewline
        Write-Host "http://localhost:3000" -ForegroundColor Cyan
        Write-Host "  Grafana Dashboard:  " -NoNewline
        Write-Host "http://localhost:3001" -ForegroundColor Cyan -NoNewline
        Write-Host " (admin/admin123)"
        Write-Host "  Prometheus:         " -NoNewline
        Write-Host "http://localhost:9090" -ForegroundColor Cyan
    }
    'kubernetes' {
        $ingressIP = kubectl get ingress aureus-ingress -n aureus-demo -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>$null
        if ($ingressIP) {
            Write-Host "  Main Console:       http://$ingressIP" -ForegroundColor Cyan
            Write-Host "  Grafana Dashboard:  http://$ingressIP/grafana" -ForegroundColor Cyan
        } else {
            Write-Warning "Ingress IP not yet available. Run: kubectl get ingress -n aureus-demo"
        }
    }
    default {
        Write-Info "Check Terraform output for access URLs"
    }
}

Write-Host ""
Write-Info "Persona-Specific URLs:"

if ($Persona -eq "personal" -or $Persona -eq "all") {
    Write-Host "  Personal Users:     " -NoNewline
    Write-Host "http://localhost:3000/personal" -ForegroundColor Cyan
}

if ($Persona -eq "developer" -or $Persona -eq "all") {
    Write-Host "  Developers:         " -NoNewline
    Write-Host "http://localhost:3000/developer" -ForegroundColor Cyan
}

if ($Persona -eq "admin" -or $Persona -eq "all") {
    Write-Host "  Administrators:     " -NoNewline
    Write-Host "http://localhost:3000/admin" -ForegroundColor Cyan
}

if ($Persona -eq "devops" -or $Persona -eq "all") {
    Write-Host "  DevOps:             " -NoNewline
    Write-Host "http://localhost:3000/devops" -ForegroundColor Cyan
}

Write-Host ""
Write-Info "Demo Credentials:"
Write-Host "  Username: " -NoNewline
Write-Host "demo@aureus.io" -ForegroundColor Yellow
Write-Host "  Password: " -NoNewline
Write-Host "AureusDemo2026!" -ForegroundColor Yellow

Write-Host ""
Write-Info "Useful Commands:"
Write-Host "  View logs:        docker-compose logs -f"
Write-Host "  Stop services:    docker-compose down"
Write-Host "  Restart services: docker-compose restart"
Write-Host "  View health:      Invoke-WebRequest http://localhost:3000/health"
Write-Host "  Check services:   docker-compose ps"

Write-Host ""
Write-Success "Happy agent building! 🚀"
Write-Host ""

# Open browser automatically (optional)
$openBrowser = Read-Host "Open browser to http://localhost:3000? (Y/N)"
if ($openBrowser -eq "Y" -or $openBrowser -eq "y") {
    Start-Process "http://localhost:3000"
}
