# Download Sortlens installer prerequisites
# Run this once to fetch VC++ Redist and WebView2 bootstrapper

$prereqDir = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "prerequisites"

if (-not (Test-Path $prereqDir)) {
    New-Item -ItemType Directory -Path $prereqDir | Out-Null
}

Write-Host "Downloading prerequisites into: $prereqDir" -ForegroundColor Cyan

# ── VC++ Redistributable 2015-2022 x64 ────────────────────────────
$vcRedist = Join-Path $prereqDir "vc_redist.x64.exe"
if (-not (Test-Path $vcRedist)) {
    Write-Host "  Downloading VC++ Redistributable x64..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://aka.ms/vs/17/release/vc_redist.x64.exe" -OutFile $vcRedist
    Write-Host "  Done." -ForegroundColor Green
}
else {
    Write-Host "  VC++ Redistributable already downloaded." -ForegroundColor Gray
}

# ── WebView2 Evergreen Bootstrapper ───────────────────────────────
$wv2 = Join-Path $prereqDir "MicrosoftEdgeWebview2Setup.exe"
if (-not (Test-Path $wv2)) {
    Write-Host "  Downloading WebView2 Runtime bootstrapper..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://go.microsoft.com/fwlink/p/?LinkId=2124703" -OutFile $wv2
    Write-Host "  Done." -ForegroundColor Green
}
else {
    Write-Host "  WebView2 bootstrapper already downloaded." -ForegroundColor Gray
}

Write-Host ""
Write-Host "All prerequisites ready!" -ForegroundColor Green
Write-Host "You can now compile sortlens_installer.iss with Inno Setup." -ForegroundColor Cyan
