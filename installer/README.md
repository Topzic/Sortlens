# Sortlens Installer Build Guide

## Overview

This folder contains the Inno Setup script that builds the Windows installer:

- `SortlensSetup-<version>.exe` for direct installation
- `SortlensSetup-<version>.zip` for GitHub releases and in-app update delivery

The current installer version is controlled by `installer/sortlens_installer.iss`.

## What The Installer Does

1. Installs Sortlens to `C:\Users\<user>\AppData\Local\Programs\Sortlens`
2. Installs the Visual C++ Redistributable if needed
3. Installs the Microsoft Edge WebView2 Runtime if needed
4. Creates Start Menu and Desktop shortcuts
5. Registers an uninstaller in Add/Remove Programs

## One-Time Setup

### 1. Install Inno Setup 6

Download and install from https://jrsoftware.org/isdl.php

### 2. Download Prerequisites

Place these files in `installer/prerequisites/`:

```text
installer/
  prerequisites/
    vc_redist.x64.exe
    MicrosoftEdgeWebview2Setup.exe
  sortlens_installer.iss
  README.md
```

Downloads:

- VC++ Redistributable x64: https://aka.ms/vs/17/release/vc_redist.x64.exe
- WebView2 Evergreen Bootstrapper: https://go.microsoft.com/fwlink/p/?LinkId=2124703

Save the WebView2 bootstrapper as `MicrosoftEdgeWebview2Setup.exe`.

## Build Steps

### Build The App Bundle

From the project root:

```powershell
.\build.ps1
```

This builds the frontend, syncs the backend environment, and creates the packaged app under `backend/dist/Sortlens/`.

### Compile The Installer

Option A, GUI:

1. Open `installer/sortlens_installer.iss` in Inno Setup Compiler
2. Click Build > Compile
3. Find the output in `installer/output/`

Option B, command line:

```powershell
& "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe" .\installer\sortlens_installer.iss
```

The installer output will be:

```text
installer/output/SortlensSetup-<version>.exe
```

### Create The Release Zip

For GitHub releases and in-app updates, zip the installer executable:

```powershell
Compress-Archive -Path .\installer\output\SortlensSetup-<version>.exe -DestinationPath .\installer\output\SortlensSetup-<version>.zip
```

## Full Release Pipeline

From the project root:

```powershell
.\release.ps1 -Version "0.7.0" -NotesFile ".\RELEASE_NOTES_0.7.0.md"
```

That script:

1. Bumps version files
2. Runs `build.ps1`
3. Compiles the installer
4. Creates the release zip
5. Publishes the GitHub release

## Troubleshooting

- "File not found" during installer compile: run `build.ps1` first and confirm `backend/dist/Sortlens/` exists.
- Missing prerequisites: download the two prerequisite installers into `installer/prerequisites/`.
- SmartScreen warning: the installer is unsigned, so Windows may show "More info" > "Run anyway".
