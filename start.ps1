# Sortlens Startup Script
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "       Starting Sortlens             " -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

# Check for Python (try multiple common names)
$pythonCmd = $null
foreach ($cmd in @("python", "python3", "py")) {
    $found = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($found) {
        # Verify it's actually Python and not the Windows Store alias
        $version = & $cmd --version 2>&1
        if ($version -match "Python \d+\.\d+") {
            $pythonCmd = $cmd
            Write-Host "[OK] Found $version" -ForegroundColor Green
            break
        }
    }
}

if (-not $pythonCmd) {
    Write-Host "[ERROR] Python not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Python 3.11 or later:" -ForegroundColor Yellow
    Write-Host "  1. Download from: https://www.python.org/downloads/" -ForegroundColor White
    Write-Host "  2. During install, CHECK 'Add Python to PATH'" -ForegroundColor White
    Write-Host "  3. Restart this terminal after installation" -ForegroundColor White
    Write-Host ""
    Write-Host "Or install via winget:" -ForegroundColor Yellow
    Write-Host "  winget install Python.Python.3.12" -ForegroundColor White
    Write-Host ""
    exit 1
}

# Check for Node.js
$nodeVersion = & node --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Node.js not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Node.js 18 or later:" -ForegroundColor Yellow
    Write-Host "  1. Download from: https://nodejs.org/" -ForegroundColor White
    Write-Host "  2. Or via winget: winget install OpenJS.NodeJS.LTS" -ForegroundColor White
    Write-Host ""
    exit 1
}
Write-Host "[OK] Found Node.js $nodeVersion" -ForegroundColor Green

# Setup Backend
Write-Host ""
Write-Host "[1/4] Setting up backend..." -ForegroundColor Yellow
$backendPath = Join-Path $scriptPath "backend"
$venvPath = Join-Path $backendPath "venv"
$venvPython = Join-Path $venvPath "Scripts\python.exe"

Push-Location $backendPath

if (-not (Test-Path $venvPython)) {
    Write-Host "      Creating Python virtual environment..." -ForegroundColor Gray
    & $pythonCmd -m venv venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to create virtual environment" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    
    Write-Host "      Installing Python dependencies..." -ForegroundColor Gray
    & ".\venv\Scripts\pip.exe" install -e ".[dev]"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to install dependencies" -ForegroundColor Red
        Pop-Location
        exit 1
    }
}

Pop-Location
Write-Host "[OK] Backend ready" -ForegroundColor Green

# Setup Frontend
Write-Host ""
Write-Host "[2/4] Setting up frontend..." -ForegroundColor Yellow
$frontendPath = Join-Path $scriptPath "frontend"
$nodeModulesPath = Join-Path $frontendPath "node_modules"

Push-Location $frontendPath

if (-not (Test-Path $nodeModulesPath)) {
    Write-Host "      Installing npm dependencies..." -ForegroundColor Gray
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to install npm dependencies" -ForegroundColor Red
        Pop-Location
        exit 1
    }
}

Pop-Location
Write-Host "[OK] Frontend ready" -ForegroundColor Green

# Start Backend
Write-Host ""
Write-Host "[3/4] Starting backend server..." -ForegroundColor Yellow
$backendScript = @"
cd '$backendPath'
Write-Host 'Backend server starting...' -ForegroundColor Cyan
& '.\venv\Scripts\python.exe' main.py
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendScript
Write-Host "[OK] Backend starting at http://127.0.0.1:8000" -ForegroundColor Green

# Start Frontend
Write-Host ""
Write-Host "[4/4] Starting frontend server..." -ForegroundColor Yellow
$frontendScript = @"
cd '$frontendPath'
Write-Host 'Frontend server starting...' -ForegroundColor Cyan
npm run dev
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendScript
Write-Host "[OK] Frontend starting at http://localhost:5173" -ForegroundColor Green

# Done
Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Sortlens is starting!              " -ForegroundColor Cyan
Write-Host "  Opening browser in 5 seconds...    " -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

Start-Sleep -Seconds 5
Start-Process "http://localhost:5173"
