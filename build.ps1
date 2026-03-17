# Sortlens Build Script — creates a standalone .exe
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "     Building Sortlens .exe           " -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $scriptPath "backend"
$frontendPath = Join-Path $scriptPath "frontend"
$distFrontend = Join-Path $frontendPath "dist"
$staticDest = Join-Path $backendPath "static"

# ── 1. Build frontend ─────────────────────────────────────────────
Write-Host "[1/3] Building frontend..." -ForegroundColor Yellow
Push-Location $frontendPath

if (-not (Test-Path "node_modules")) {
    Write-Host "      Installing npm dependencies..." -ForegroundColor Gray
    npm install
}
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Frontend build failed" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "[OK] Frontend built" -ForegroundColor Green

# ── 2. Copy frontend dist into backend/static ─────────────────────
Write-Host ""
Write-Host "[2/3] Copying frontend assets..." -ForegroundColor Yellow
if (Test-Path $staticDest) {
    Remove-Item -Recurse -Force $staticDest
}
Copy-Item -Recurse $distFrontend $staticDest
Write-Host "[OK] Static files ready" -ForegroundColor Green

# ── 3. Run PyInstaller ─────────────────────────────────────────────
Write-Host ""
Write-Host "[3/3] Packaging with PyInstaller..." -ForegroundColor Yellow
Push-Location $backendPath

$venvPython = Join-Path $backendPath "venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "[ERROR] Backend venv not found. Run .\start.ps1 first to set up." -ForegroundColor Red
    Pop-Location
    exit 1
}

# Install pyinstaller if needed
& $venvPython -m pip install pyinstaller --quiet

# Generate app icon
$iconPath = Join-Path $backendPath "sortlens.ico"
& $venvPython (Join-Path $backendPath "generate_icon.py") $iconPath

$anacondaBin = "C:\Users\Ian_C\anaconda3\Library\bin"

& $venvPython -m PyInstaller `
    --noconfirm `
    --onedir `
    --name "Sortlens" `
    --add-data "static;static" `
    --add-data "app;app" `
    --add-binary "$anacondaBin\libssl-3-x64.dll;." `
    --add-binary "$anacondaBin\libcrypto-3-x64.dll;." `
    --add-binary "$anacondaBin\liblzma.dll;." `
    --add-binary "$anacondaBin\libbz2.dll;." `
    --add-binary "$anacondaBin\libexpat.dll;." `
    --add-binary "$anacondaBin\ffi.dll;." `
    --add-binary "$anacondaBin\sqlite3.dll;." `
    --hidden-import "uvicorn.logging" `
    --hidden-import "uvicorn.lifespan" `
    --hidden-import "uvicorn.lifespan.on" `
    --hidden-import "uvicorn.lifespan.off" `
    --hidden-import "uvicorn.protocols" `
    --hidden-import "uvicorn.protocols.http" `
    --hidden-import "uvicorn.protocols.http.auto" `
    --hidden-import "uvicorn.protocols.http.h11_impl" `
    --hidden-import "uvicorn.protocols.http.httptools_impl" `
    --hidden-import "uvicorn.protocols.websockets" `
    --hidden-import "uvicorn.protocols.websockets.auto" `
    --hidden-import "uvicorn.protocols.websockets.wsproto_impl" `
    --hidden-import "uvicorn.protocols.websockets.websockets_impl" `
    --hidden-import "rawpy" `
    --hidden-import "aiosqlite" `
    --hidden-import "PIL" `
    --hidden-import "numpy" `
    --hidden-import "imagehash" `
    --hidden-import "webview" `
    --windowed `
    --icon "$iconPath" `
    main.py

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] PyInstaller failed" -ForegroundColor Red
    Pop-Location
    exit 1
}

Pop-Location

$outputDir = Join-Path $backendPath "dist\Sortlens"
Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "  Build complete!                     " -ForegroundColor Green
Write-Host "  Output: $outputDir" -ForegroundColor Green
Write-Host "  Run: $outputDir\Sortlens.exe" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
