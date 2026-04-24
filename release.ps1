# Sortlens Release Script - build, package installer, and create GitHub release
# Usage:  .\release.ps1 -Version "0.4.0" [-Notes "Release notes here"] [-Draft]
#
# Steps:
#   1. Bumps version in config.py, pyproject.toml, and sortlens_installer.iss
#   2. Runs build.ps1 (frontend + PyInstaller)
#   3. Compiles Inno Setup installer (ISCC.exe)
#   4. Zips the installer as SortlensSetup-x.x.x.zip
#   5. Creates a GitHub release with the zip attached

param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [string]$Notes = "",

    [string]$NotesFile = "",

    [switch]$Draft,

    [switch]$SkipBuild
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = "Stop"
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Sortlens Release - v$Version" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# -- Validate version format ----------------------------------------
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Host "[ERROR] Version must be in format x.x.x (example: 0.4.0)" -ForegroundColor Red
    exit 1
}

# -- Locate tools ---------------------------------------------------
# Inno Setup ISCC.exe
$isccPaths = @(
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe",
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
)
$iscc = $null
foreach ($p in $isccPaths) {
    if (Test-Path $p) { $iscc = $p; break }
}
if (-not $iscc) {
    # Try PATH
    $found = Get-Command iscc -ErrorAction SilentlyContinue
    if ($found) { $iscc = $found.Source }
}
if (-not $iscc) {
    Write-Host "[ERROR] Inno Setup compiler (ISCC.exe) not found." -ForegroundColor Red
    Write-Host "        Install Inno Setup 6 from https://jrsoftware.org/isdl.php" -ForegroundColor Yellow
    Write-Host "        Or set ISCC_PATH environment variable to the ISCC.exe location." -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] Inno Setup: $iscc" -ForegroundColor Green

# GitHub CLI
$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) {
    Write-Host "[ERROR] GitHub CLI (gh) not found. Install from https://cli.github.com/" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] GitHub CLI: $($gh.Source)" -ForegroundColor Green

# -- 1. Bump version -----------------------------------------------
Write-Host ""
Write-Host "[1/5] Bumping version to $Version..." -ForegroundColor Yellow

$configPath = Join-Path $scriptPath "backend\app\core\config.py"
$pyprojectPath = Join-Path $scriptPath "backend\pyproject.toml"
$issPath = Join-Path $scriptPath "installer\sortlens_installer.iss"

# config.py
$configContent = Get-Content $configPath -Raw
$configContent = $configContent -replace 'VERSION:\s*str\s*=\s*"[^"]*"', "VERSION: str = `"$Version`""
Set-Content $configPath $configContent -NoNewline

# pyproject.toml
$pyprojectContent = Get-Content $pyprojectPath -Raw
$pyprojectContent = [regex]::Replace($pyprojectContent, '(?m)^version\s*=\s*"[^"]*"', "version = `"$Version`"", 1)
Set-Content $pyprojectPath $pyprojectContent -NoNewline

# sortlens_installer.iss
$issContent = Get-Content $issPath -Raw
$issContent = $issContent -replace '#define MyAppVersion "[^"]*"', "#define MyAppVersion `"$Version`""
Set-Content $issPath $issContent -NoNewline

Write-Host "[OK] Version bumped in config.py, pyproject.toml, sortlens_installer.iss" -ForegroundColor Green

# -- 2. Build (frontend + PyInstaller) ----------------------------
if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "[2/5] Running build.ps1..." -ForegroundColor Yellow
    $ErrorActionPreference = "Continue"
    & "$scriptPath\build.ps1"
    $ErrorActionPreference = "Stop"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Build failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "[OK] Build complete" -ForegroundColor Green
}
else {
    Write-Host ""
    Write-Host "[2/5] Skipping build (--SkipBuild)" -ForegroundColor Gray
}

# -- 3. Compile Inno Setup installer ------------------------------
Write-Host ""
Write-Host "[3/5] Compiling installer..." -ForegroundColor Yellow

$ErrorActionPreference = "Continue"
& $iscc $issPath
$ErrorActionPreference = "Stop"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Inno Setup compilation failed" -ForegroundColor Red
    exit 1
}

$installerExe = Join-Path $scriptPath "installer\output\SortlensSetup-$Version.exe"
if (-not (Test-Path $installerExe)) {
    Write-Host "[ERROR] Expected installer not found: $installerExe" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Installer created: $installerExe" -ForegroundColor Green

# -- 4. Zip the installer -----------------------------------------
Write-Host ""
Write-Host "[4/5] Zipping installer..." -ForegroundColor Yellow

$zipPath = Join-Path $scriptPath "installer\output\SortlensSetup-$Version.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Compress-Archive -Path $installerExe -DestinationPath $zipPath -CompressionLevel Optimal
if (-not (Test-Path $zipPath)) {
    Write-Host "[ERROR] Failed to create zip" -ForegroundColor Red
    exit 1
}
$zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host "[OK] Zip created: $zipPath ($zipSize MB)" -ForegroundColor Green

# -- 5. Create GitHub release -------------------------------------
Write-Host ""
Write-Host "[5/5] Creating GitHub release..." -ForegroundColor Yellow

$tag = "v$Version"
$title = "Sortlens $tag"
$repo = "Topzic/Sortlens"

$ghArgs = @("release", "create", $tag, $zipPath, "--repo", $repo, "--title", $title)

if ($NotesFile) {
    if (-not (Test-Path $NotesFile)) {
        Write-Host "[ERROR] Notes file not found: $NotesFile" -ForegroundColor Red
        exit 1
    }
    $ghArgs += "--notes-file"
    $ghArgs += $NotesFile
}
elseif ($Notes) {
    $ghArgs += "--notes"
    $ghArgs += $Notes
}
else {
    $ghArgs += "--notes"
    $ghArgs += "Sortlens $tag release"
}

if ($Draft) {
    $ghArgs += "--draft"
}

$ErrorActionPreference = "Continue"
& gh @ghArgs
$ErrorActionPreference = "Stop"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] GitHub release creation failed" -ForegroundColor Red
    Write-Host "        The zip is ready at: $zipPath" -ForegroundColor Yellow
    Write-Host "        You can manually create the release with:" -ForegroundColor Yellow
    Write-Host "        gh release create $tag `"$zipPath`" --repo $repo --title `"$title`"" -ForegroundColor Gray
    exit 1
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "  Release v$Version published!" -ForegroundColor Green
Write-Host "  https://github.com/$repo/releases/tag/$tag" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
