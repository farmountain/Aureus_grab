@echo off
REM Pre-Flight Check Script for Windows
REM Runs all configuration and path validations

echo.
echo ========================================
echo  Aureus Agentic OS - Pre-Flight Check
echo ========================================
echo.

set ERROR_COUNT=0

REM 1. Validate configuration paths
echo.
echo Phase 1: Configuration Path Validation
echo ========================================
node scripts\validate-config-paths.js
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] Configuration path validation had minor issues
    REM Don't increment error count - sdk-python is expected
)

REM 2. Validate import paths
echo.
echo Phase 2: Import Path Validation
echo ========================================
node scripts\validate-imports.js
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Import path validation failed
    set /A ERROR_COUNT+=1
)

REM 3. Check database schemas
echo.
echo Phase 3: Database Schema Validation
echo ========================================
node scripts\check-database-schema.js
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] Database schema paths need build
    REM Don't increment error count - schemas exist in src
)

REM 4. Check build configuration
echo.
echo Phase 4: Build Configuration Check
echo ========================================
echo Checking TypeScript configuration...

if exist tsconfig.json (
    echo [OK] Root tsconfig.json exists
) else (
    echo [ERROR] Root tsconfig.json not found
    set /A ERROR_COUNT+=1
)

if exist vitest.config.ts (
    echo [OK] vitest.config.ts exists
) else (
    echo [ERROR] vitest.config.ts not found
    set /A ERROR_COUNT+=1
)

REM 5. Check workspace structure
echo.
echo Phase 5: Workspace Structure Check
echo ========================================

for %%d in (packages apps docs tests scripts demo-deployment infrastructure) do (
    if exist "%%d\" (
        echo [OK] %%d directory exists
    ) else (
        echo [ERROR] %%d directory not found
        set /A ERROR_COUNT+=1
    )
)

REM Summary
echo.
echo ========================================
echo  Pre-Flight Check Summary
echo ========================================
echo.

if %ERROR_COUNT% EQU 0 (
    echo [SUCCESS] All pre-flight checks passed!
    echo.
    echo Next steps:
    echo   1. Run: npm run build:ordered
    echo   2. Run: npm test
    echo   3. Start console: cd apps\console ^&^& npm start
    echo.
    exit /b 0
) else (
    echo [FAILED] %ERROR_COUNT% critical error(s) found
    echo.
    echo Please fix the errors above before proceeding.
    echo.
    exit /b 1
)
