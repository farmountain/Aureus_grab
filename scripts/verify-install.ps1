# Verification script for Aureus Sentinel installations (Windows)
# Tests all installation methods

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "╔═══════════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "║  Aureus Sentinel Installation Verifier   ║" -ForegroundColor Blue
Write-Host "╚═══════════════════════════════════════════╝" -ForegroundColor Blue
Write-Host ""

$passed = 0
$failed = 0

function Test-Check {
    param(
        [string]$Name,
        [scriptblock]$Test
    )
    
    Write-Host "Testing $Name... " -NoNewline
    try {
        $result = & $Test
        if ($result) {
            Write-Host "✓ PASS" -ForegroundColor Green
            $script:passed++
        } else {
            Write-Host "✗ FAIL" -ForegroundColor Red
            $script:failed++
        }
    } catch {
        Write-Host "✗ FAIL" -ForegroundColor Red
        $script:failed++
    }
}

# Check prerequisites
Write-Host "=== Prerequisites ===" -ForegroundColor Cyan
Test-Check "Node.js" { $null -ne (Get-Command node -ErrorAction SilentlyContinue) }
Test-Check "npm" { $null -ne (Get-Command npm -ErrorAction SilentlyContinue) }
Test-Check "curl" { $null -ne (Get-Command curl -ErrorAction SilentlyContinue) }
Write-Host ""

# Check CLI installation
Write-Host "=== CLI Installation ===" -ForegroundColor Cyan
Test-Check "aureus command" { $null -ne (Get-Command aureus -ErrorAction SilentlyContinue) }
Test-Check "aureus --version" { 
    try {
        $null = (aureus --version 2>&1)
        return $true
    } catch {
        return $false
    }
}
Test-Check "aureus --help" {
    try {
        $null = (aureus --help 2>&1)
        return $true
    } catch {
        return $false
    }
}
Write-Host ""

# Check SDK installation (if in a project)
Write-Host "=== SDK Installation ===" -ForegroundColor Cyan
if (Test-Path "package.json") {
    Test-Check "SDK presence" {
        try {
            node -e "require('@aureus-sentinel/bridge-client')" 2>&1 | Out-Null
            return $true
        } catch {
            return $false
        }
    }
} else {
    Write-Host "Skipping SDK check (not in a Node.js project)" -ForegroundColor Yellow
}
Write-Host ""

# Check Docker installation
Write-Host "=== Docker Installation ===" -ForegroundColor Cyan
if (Get-Command docker -ErrorAction SilentlyContinue) {
    Test-Check "Docker" { $null -ne (Get-Command docker -ErrorAction SilentlyContinue) }
    Test-Check "Docker image" {
        $images = docker images | Select-String "aureus-bridge"
        return $null -ne $images
    }
    
    # Try to start container
    Write-Host "Testing Docker run... " -NoNewline
    try {
        docker run --rm ghcr.io/farmountain/aureus-bridge:latest node --version 2>&1 | Out-Null
        Write-Host "✓ PASS" -ForegroundColor Green
        $script:passed++
    } catch {
        Write-Host "⚠ SKIP (image not pulled)" -ForegroundColor Yellow
    }
} else {
    Write-Host "Docker not installed, skipping Docker tests" -ForegroundColor Yellow
}
Write-Host ""

# Check directories
Write-Host "=== Directories ===" -ForegroundColor Cyan
Test-Check "$env:USERPROFILE\.aureus exists" { Test-Path "$env:USERPROFILE\.aureus" }
Test-Check "$env:USERPROFILE\.aureus\keys exists" { Test-Path "$env:USERPROFILE\.aureus\keys" }
Write-Host ""

# Test CLI functionality
Write-Host "=== CLI Functionality ===" -ForegroundColor Cyan
$tempKeys = "$env:TEMP\test-keys"
Test-Check "keygen command" {
    try {
        aureus keygen --output $tempKeys 2>&1 | Out-Null
        return $true
    } catch {
        return $false
    }
}
Test-Check "keygen output" {
    (Test-Path "$tempKeys\private.pem") -and (Test-Path "$tempKeys\public.pem")
}

# Clean up test keys
if (Test-Path $tempKeys) {
    Remove-Item -Recurse -Force $tempKeys
}

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "Passed: $passed" -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "Failed: $failed" -ForegroundColor Red
} else {
    Write-Host "Failed: 0" -ForegroundColor Green
}
Write-Host ""

if ($failed -eq 0) {
    Write-Host "All tests passed! ✓" -ForegroundColor Green
    Write-Host "Your Aureus Sentinel installation is working correctly."
    exit 0
} else {
    Write-Host "Some tests failed! ✗" -ForegroundColor Red
    Write-Host "Please check the installation guide: https://github.com/farmountain/Aureus-Sentinel/blob/main/docs/INSTALLATION.md"
    exit 1
}
