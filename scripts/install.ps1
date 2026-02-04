# Aureus Sentinel Quick Install Script (Windows PowerShell)
# Usage: iwr -useb https://raw.githubusercontent.com/farmountain/Aureus-Sentinel/main/scripts/install.ps1 | iex

$ErrorActionPreference = "Stop"

# Configuration
$CliPackage = "@aureus-sentinel/cli"
$MinNodeVersion = [version]"18.0.0"
$InstallDir = "$env:USERPROFILE\.aureus"

# Functions
function Print-Header {
    Write-Host ""
    Write-Host "╔═══════════════════════════════════════╗" -ForegroundColor Blue
    Write-Host "║   Aureus Sentinel Installation       ║" -ForegroundColor Blue
    Write-Host "╚═══════════════════════════════════════╝" -ForegroundColor Blue
    Write-Host ""
}

function Print-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Print-Error {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Print-Warning {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

function Print-Info {
    param([string]$Message)
    Write-Host "ℹ $Message" -ForegroundColor Blue
}

function Test-Command {
    param([string]$Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Check-Prerequisites {
    Print-Info "Checking prerequisites..."
    
    # Check Node.js
    if (-not (Test-Command node)) {
        Print-Error "Node.js is not installed"
        Write-Host "Please install Node.js $MinNodeVersion or higher: https://nodejs.org/"
        exit 1
    }
    
    $nodeVersionString = (node --version).TrimStart('v')
    $nodeVersion = [version]$nodeVersionString
    
    if ($nodeVersion -lt $MinNodeVersion) {
        Print-Error "Node.js $nodeVersionString is too old (requires >= $MinNodeVersion)"
        Write-Host "Please upgrade Node.js: https://nodejs.org/"
        exit 1
    }
    Print-Success "Node.js $nodeVersionString detected"
    
    # Check npm
    if (-not (Test-Command npm)) {
        Print-Error "npm is not installed"
        exit 1
    }
    $npmVersion = (npm --version)
    Print-Success "npm $npmVersion detected"
    
    # Check internet connectivity
    try {
        $null = Invoke-WebRequest -Uri "https://registry.npmjs.org/" -UseBasicParsing -TimeoutSec 5 -Method Head
        Print-Success "Internet connectivity verified"
    } catch {
        Print-Error "Cannot reach npm registry"
        Write-Host "Please check your internet connection"
        exit 1
    }
}

function Install-CLI {
    Print-Info "Installing Aureus CLI..."
    
    try {
        # Try global install
        npm install -g $CliPackage 2>&1 | Out-Null
        Print-Success "CLI installed globally"
    } catch {
        Print-Error "Failed to install CLI"
        Write-Host "Error: $_"
        exit 1
    }
}

function Setup-Directories {
    Print-Info "Setting up directories..."
    
    # Create directories
    New-Item -ItemType Directory -Path "$InstallDir\keys" -Force | Out-Null
    New-Item -ItemType Directory -Path "$InstallDir\config" -Force | Out-Null
    New-Item -ItemType Directory -Path "$InstallDir\logs" -Force | Out-Null
    
    Print-Success "Directories created at $InstallDir"
}

function Verify-Installation {
    Print-Info "Verifying installation..."
    
    if (-not (Test-Command aureus)) {
        Print-Error "CLI not found in PATH"
        Print-Warning "You may need to restart PowerShell or add npm global bin to PATH"
        
        # Show npm global bin path
        $npmPrefix = (npm config get prefix)
        Write-Host ""
        Write-Host "Add this path to your System PATH:" -ForegroundColor Yellow
        Write-Host "  $npmPrefix" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "To add automatically (requires PowerShell restart):" -ForegroundColor Yellow
        Write-Host '  $env:Path += ";' + $npmPrefix + '"' -ForegroundColor Cyan
        Write-Host ""
        
        return $false
    }
    
    $version = (aureus --version 2>$null)
    if ($version) {
        Print-Success "Aureus CLI $version installed"
        return $true
    } else {
        return $false
    }
}

function Print-NextSteps {
    Write-Host ""
    Write-Host "═══════════════════════════════════════" -ForegroundColor Green
    Write-Host "Installation Complete!" -ForegroundColor Green
    Write-Host "═══════════════════════════════════════" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host ""
    Write-Host "1. Verify installation:" -ForegroundColor White
    Write-Host "   aureus --version" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "2. Generate keys for local development:" -ForegroundColor White
    Write-Host "   aureus keygen --output $InstallDir\keys" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "3. Test connectivity:" -ForegroundColor White
    Write-Host "   aureus test" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "4. Read the Getting Started guide:" -ForegroundColor White
    Write-Host "   https://github.com/farmountain/Aureus-Sentinel/blob/main/docs/GETTING_STARTED.md" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "For help, run: " -NoNewline
    Write-Host "aureus --help" -ForegroundColor Yellow
    Write-Host ""
}

# Main installation flow
function Main {
    Print-Header
    
    Check-Prerequisites
    Write-Host ""
    
    Install-CLI
    Write-Host ""
    
    Setup-Directories
    Write-Host ""
    
    if (Verify-Installation) {
        Print-NextSteps
        exit 0
    } else {
        Write-Host ""
        Print-Error "Installation verification failed"
        Write-Host "Please restart PowerShell and verify with: aureus --version"
        exit 1
    }
}

# Run
Main
