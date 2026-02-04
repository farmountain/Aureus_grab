# Pre-Flight Check Script for Windows
# Runs all configuration and path validations

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Aureus Agentic OS - Pre-Flight Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ErrorCount = 0
$WarningCount = 0

# Function to run a validator
function Run-Validator {
    param(
        [string]$Name,
        [string]$Script
    )
    
    Write-Host "Running: $Name" -ForegroundColor Yellow
    Write-Host "─────────────────────────────────────────" -ForegroundColor Gray
    
    node $Script
    $exitCode = $LASTEXITCODE
    
    if ($exitCode -eq 0) {
        Write-Host "✓ $Name PASSED" -ForegroundColor Green
        return $true
    } else {
        Write-Host "✗ $Name FAILED" -ForegroundColor Red
        $script:ErrorCount++
        return $false
    }
}

# 1. Validate configuration paths
Write-Host ""
Write-Host "Phase 1: Configuration Path Validation" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
$configResult = Run-Validator -Name "Configuration Paths" -Script "scripts\validate-config-paths.js"

# 2. Validate import paths
Write-Host ""
Write-Host "Phase 2: Import Path Validation" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
$importResult = Run-Validator -Name "Import Paths" -Script "scripts\validate-imports.js"

# 3. Check database schemas
Write-Host ""
Write-Host "Phase 3: Database Schema Validation" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
$schemaResult = Run-Validator -Name "Database Schema Paths" -Script "scripts\check-database-schema.js"

# 4. Check build configuration
Write-Host ""
Write-Host "Phase 4: Build Configuration Check" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Checking TypeScript configuration..." -ForegroundColor Yellow

if (Test-Path "tsconfig.json") {
    Write-Host "✓ Root tsconfig.json exists" -ForegroundColor Green
} else {
    Write-Host "✗ Root tsconfig.json not found" -ForegroundColor Red
    $ErrorCount++
}

if (Test-Path "vitest.config.ts") {
    Write-Host "✓ vitest.config.ts exists" -ForegroundColor Green
} else {
    Write-Host "✗ vitest.config.ts not found" -ForegroundColor Red
    $ErrorCount++
}

# 5. Check workspace structure
Write-Host ""
Write-Host "Phase 5: Workspace Structure Check" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan

$requiredDirs = @(
    "packages",
    "apps",
    "docs",
    "tests",
    "scripts",
    "demo-deployment",
    "infrastructure"
)

foreach ($dir in $requiredDirs) {
    if (Test-Path $dir) {
        Write-Host "✓ $dir directory exists" -ForegroundColor Green
    } else {
        Write-Host "✗ $dir directory not found" -ForegroundColor Red
        $ErrorCount++
    }
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Pre-Flight Check Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($ErrorCount -eq 0) {
    Write-Host "✓ All pre-flight checks passed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Run: npm run build:ordered" -ForegroundColor White
    Write-Host "  2. Run: npm test" -ForegroundColor White
    Write-Host "  3. Start console: cd apps\console && npm start" -ForegroundColor White
    Write-Host ""
    exit 0
} else {
    Write-Host "✗ $ErrorCount error(s) found" -ForegroundColor Red
    
    if ($WarningCount -gt 0) {
        Write-Host "⚠ $WarningCount warning(s) found" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "Please fix the errors above before proceeding." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
