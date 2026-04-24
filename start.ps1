# Sortlens Startup Script
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "       Starting Sortlens             " -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

function Get-PythonVersionInfo {
    param(
        [string]$CommandName
    )

    $versionOutput = & $CommandName --version 2>&1
    if ($LASTEXITCODE -ne 0 -or $versionOutput -notmatch "Python (\d+)\.(\d+)\.(\d+)") {
        return $null
    }

    return [PSCustomObject]@{
        Command = $CommandName
        Version = [Version]::new([int]$Matches[1], [int]$Matches[2], [int]$Matches[3])
        Display = $versionOutput
    }
}

function Test-VenvNeedsRebuild {
    param(
        [string]$VenvPath,
        [string]$VenvPythonPath,
        [Version]$MinimumVersion
    )

    if (-not (Test-Path $VenvPythonPath)) {
        return $true
    }

    $venvVersionInfo = Get-PythonVersionInfo $VenvPythonPath
    if (-not $venvVersionInfo) {
        return $true
    }

    if ($venvVersionInfo.Version -lt $MinimumVersion) {
        Write-Host "      Existing virtual environment uses $($venvVersionInfo.Display); rebuilding..." -ForegroundColor Gray
        return $true
    }

    $pyvenvConfigPath = Join-Path $VenvPath "pyvenv.cfg"
    if (-not (Test-Path $pyvenvConfigPath)) {
        return $true
    }

    $commandLine = Get-Content $pyvenvConfigPath | Where-Object { $_ -like "command = *" } | Select-Object -First 1
    if (-not $commandLine) {
        return $false
    }

    $expectedVenvPath = [System.IO.Path]::GetFullPath($VenvPath).TrimEnd('\\')
    $configuredVenvPath = ($commandLine -replace "^command = .*?-m venv\s+", "").Trim().Trim('"').TrimEnd('\\')

    if (-not $configuredVenvPath) {
        return $false
    }

    return $configuredVenvPath -ne $expectedVenvPath
}

# Check for Python (try multiple common names)
$minimumPythonVersion = [Version]::new(3, 11, 0)
$pythonCmd = $null
foreach ($cmd in @("python", "python3", "py")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        continue
    }

    $versionInfo = Get-PythonVersionInfo $cmd
    if ($versionInfo -and $versionInfo.Version -ge $minimumPythonVersion) {
        $pythonCmd = $versionInfo.Command
        Write-Host "[OK] Found $($versionInfo.Display)" -ForegroundColor Green
        break
    }
}

if (-not $pythonCmd) {
    Write-Host "[ERROR] Python 3.11 or later not found!" -ForegroundColor Red
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
$depsStampPath = Join-Path $venvPath ".deps-stamp"
$pyprojectPath = Join-Path $backendPath "pyproject.toml"

Push-Location $backendPath

if (Test-VenvNeedsRebuild -VenvPath $venvPath -VenvPythonPath $venvPython -MinimumVersion $minimumPythonVersion) {
    if (Test-Path $venvPath) {
        Write-Host "      Removing stale virtual environment..." -ForegroundColor Gray
        Remove-Item $venvPath -Recurse -Force
    }

    Write-Host "      Creating Python virtual environment..." -ForegroundColor Gray
    & $pythonCmd -m venv venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to create virtual environment" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    
}

$pyprojectStamp = (Get-Item $pyprojectPath).LastWriteTimeUtc.Ticks.ToString()
$needsDependencySync = -not (Test-Path $depsStampPath)
if (-not $needsDependencySync) {
    $installedStamp = (Get-Content $depsStampPath -Raw).Trim()
    $needsDependencySync = $installedStamp -ne $pyprojectStamp
}

if ($needsDependencySync) {
    Write-Host "      Syncing Python dependencies..." -ForegroundColor Gray
    & $venvPython -m pip install -e ".[dev]"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to install dependencies" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Set-Content -Path $depsStampPath -Value $pyprojectStamp -Encoding ascii
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

# Clean stale .port file so vite picks up the new port
$portFile = Join-Path $backendPath ".port"
if (Test-Path $portFile) { Remove-Item $portFile -Force }

$backendScript = @"
cd '$backendPath'
Write-Host 'Backend server starting...' -ForegroundColor Cyan
& '.\venv\Scripts\python.exe' main.py
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendScript

# Wait for backend to write its .port file (up to 15 seconds)
$waited = 0
while (-not (Test-Path $portFile) -and $waited -lt 15) {
    Start-Sleep -Milliseconds 500
    $waited += 0.5
}

if (Test-Path $portFile) {
    $backendPort = (Get-Content $portFile -Raw).Trim()
    Write-Host "[OK] Backend starting at http://127.0.0.1:$backendPort" -ForegroundColor Green
}
else {
    $backendPort = "8000"
    Write-Host "[OK] Backend starting (port file not found, assuming $backendPort)" -ForegroundColor Yellow
}

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
